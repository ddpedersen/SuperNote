/**
 * Runs a send (capture -> Claude -> Marvin) and holds the state the UI shows.
 * Lives outside React so button events that arrive before App mounts still
 * work.
 */
import {
  captureLasso,
  capturePage,
  recognizeLasso,
  getMarkedHeadings,
  getNoteInfo,
  type NoteInfo,
} from './capture';
import type { Content, ExtractedTask, Mode } from './prompt';
import { aiFor, taskAppFor } from './providers';
import {
  ensurePermission,
  flushPendingSave,
  hasPendingSave,
  loadConfig,
  loadSettings,
  SetupNeeded,
  type Config,
} from './config';
import {
  chunk,
  CONFIRM_ABOVE_PAGES,
  estimateUsage,
  PAGES_PER_REQUEST,
  parsePageList,
} from './pages';
import { clearLog, log, logError } from './log';
import { PluginManager } from 'sn-plugin-lib';

/**
 * What to send. Note pages are captured during the send, a few at a time, so
 * a long note never sits in memory and a pending send (waiting on Settings)
 * stays small.
 */
export type Source =
  | Content
  | { kind: 'notePages'; notePath: string; pages: number[] }
  | { kind: 'marked'; notePath: string; totalPages: number };

type Pending = { source: Source; mode: Mode };

export type JobState =
  | { status: 'idle' }
  // Sidebar button: This page / Whole note / Choose pages / Marked headings.
  | { status: 'menu'; note: NoteInfo }
  | { status: 'pickPages'; note: NoteInfo; error?: string }
  | { status: 'confirm'; pending: Pending; pageCount: number; estimate: string }
  | { status: 'working'; message: string }
  | {
      status: 'done';
      added: ExtractedTask[];
      failed: number;
      failReason?: string;
      emptyMessage?: string;
      appLabel: string;
    }
  | { status: 'error'; message: string }
  // Settings screen; `pending` is a send to resume once keys are saved.
  // `fromGear`: opened from the plugin list, where no note is open.
  | { status: 'setup'; pending?: Pending; fromGear?: boolean }
  // `deferred`: keys are valid but only in memory until the plugin is used in a note.
  | { status: 'saved'; deferred?: boolean };

let state: JobState = { status: 'idle' };
const listeners = new Set<(s: JobState) => void>();

function set(next: JobState) {
  state = next;
  listeners.forEach(l => l(state));
}

export function getState(): JobState {
  return state;
}

export function subscribe(listener: (s: JobState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reset() {
  set({ status: 'idle' });
}

const isBusy = () => state.status === 'working';

function fail(e: unknown) {
  logError('send', e);
  set({ status: 'error', message: e instanceof Error ? e.message : String(e) });
}

async function run(pending: Pending) {
  try {
    await send(pending);
  } catch (e) {
    fail(e);
  }
}

/**
 * Bumped each time the plugin is opened (a button in a note, or the
 * plugin-list gear). The UI resets its view toggles (details, instructions)
 * when it changes, so every open starts on the normal screen.
 */
let session = 0;
export const getSession = () => session;

/** Starts a fresh diagnostic log. */
async function begin(what: string) {
  clearLog();
  const device = await PluginManager.getDeviceType().catch(() => -1);
  log(`start: ${what} (deviceType ${device})`);
  // Plugin buttons run inside a note, so gear-entered keys can be written now.
  await flushPendingSave('plugin button');
}

// ---------------------------------------------------------------- settings

export function openSettings(fromGear = false) {
  if (!isBusy()) {
    if (fromGear) {
      session++;
    }
    set({ status: 'setup', fromGear });
  }
}

/** Called by the Settings screen after a successful save. */
export async function settingsSaved(result: 'saved' | 'deferred') {
  const pending = state.status === 'setup' ? state.pending : undefined;
  if (result === 'deferred') {
    armPenUpFlush();
  }
  if (!pending) {
    set({ status: 'saved', deferred: result === 'deferred' });
    return;
  }
  log('resuming send after setup');
  await run(pending);
}

let penUpSubscription: { remove: () => void } | null = null;
let flushing = false;

/**
 * Also try the deferred save on the next pen stroke in any note, so keys get
 * written even if the user doesn't open the plugin. Removed once saved.
 */
function armPenUpFlush() {
  if (penUpSubscription) {
    return;
  }
  penUpSubscription = PluginManager.registerEventListener('event_pen_up', 2, {
    onMsg: async () => {
      if (flushing) {
        return;
      }
      flushing = true;
      try {
        await flushPendingSave('pen stroke');
      } finally {
        flushing = false;
      }
      if (!hasPendingSave()) {
        penUpSubscription?.remove();
        penUpSubscription = null;
      }
    },
  });
}

// ------------------------------------------------------------ note sidebar

/** Sidebar button: show what to send from this note. */
export async function startNote() {
  if (isBusy()) {
    return;
  }
  session++;
  set({ status: 'working', message: 'Opening note…' });
  try {
    await begin('note');
    const note = await getNoteInfo();
    log(`note: page ${note.currentPage + 1} of ${note.totalPages}`);
    set({ status: 'menu', note });
  } catch (e) {
    fail(e);
  }
}

function noteFromState(): NoteInfo | null {
  return state.status === 'menu' || state.status === 'pickPages' ? state.note : null;
}

export function sendCurrentPage() {
  const note = noteFromState();
  if (note) {
    log('menu: this page');
    run({
      source: { kind: 'notePages', notePath: note.notePath, pages: [note.currentPage] },
      mode: 'tasks',
    });
  }
}

export function sendWholeNote() {
  const note = noteFromState();
  if (note) {
    log('menu: whole note');
    const pages = Array.from({ length: note.totalPages }, (_, i) => i);
    confirmIfLarge({ kind: 'notePages', notePath: note.notePath, pages });
  }
}

export function openPagePicker() {
  const note = noteFromState();
  if (note) {
    set({ status: 'pickPages', note });
  }
}

export function sendPageList(text: string) {
  const note = noteFromState();
  if (!note) {
    return;
  }
  let pages: number[];
  try {
    pages = parsePageList(text, note.totalPages);
  } catch (e) {
    set({ status: 'pickPages', note, error: e instanceof Error ? e.message : String(e) });
    return;
  }
  log(`menu: pages ${text}`);
  confirmIfLarge({ kind: 'notePages', notePath: note.notePath, pages });
}

export function sendMarked() {
  const note = noteFromState();
  if (note) {
    log('menu: marked headings');
    run({
      source: { kind: 'marked', notePath: note.notePath, totalPages: note.totalPages },
      mode: 'marked',
    });
  }
}

async function confirmIfLarge(source: Source & { kind: 'notePages' }) {
  const pending: Pending = { source, mode: 'tasks' };
  if (source.pages.length <= CONFIRM_ABOVE_PAGES) {
    await run(pending);
    return;
  }
  const model = await loadSettings()
    .then(c => aiFor(c).model(c))
    .catch(() => '');
  set({
    status: 'confirm',
    pending,
    pageCount: source.pages.length,
    estimate: estimateUsage(source.pages.length, model),
  });
}

export function confirmSend() {
  if (state.status === 'confirm') {
    log(`confirmed ${state.pageCount} pages`);
    run(state.pending);
  }
}

// ----------------------------------------------------------- lasso and DOC

/**
 * Lasso button: everything selected becomes a task (literal mode). Captured
 * now, while the lasso is active, with the tablet's own text recognition as
 * a hint and fallback.
 */
export async function startLasso() {
  if (isBusy()) {
    return;
  }
  session++;
  set({ status: 'working', message: 'Capturing selection…' });
  let base64: string;
  let recognized: string;
  try {
    await begin('lasso');
    base64 = await captureLasso();
    recognized = await recognizeLasso();
    log(`lasso recognized: ${recognized ? `${recognized.length} chars` : 'nothing'}`);
  } catch (e) {
    fail(e);
    return;
  }
  await run({ source: { kind: 'image', base64, recognized }, mode: 'selection' });
}

/** DOC text-selection button: the selected text becomes a task (literal mode). */
export async function startText(text: string) {
  if (isBusy()) {
    return;
  }
  session++;
  await begin(`doc text (${text.length} chars)`);
  if (!text.trim()) {
    set({ status: 'error', message: 'No text is selected.' });
    return;
  }
  await run({ source: { kind: 'text', text }, mode: 'selection' });
}

// -------------------------------------------------------------------- send

/** The selection as a task when the AI returns none: first line as title, rest as note. */
function selectionFallback(source: Content): ExtractedTask {
  const text =
    source.kind === 'text' ? source.text : source.kind === 'image' ? source.recognized ?? '' : '';
  const [first = '', ...rest] = text.trim().split(/\n+/);
  return {
    title: first.trim().slice(0, 200) || 'Supernote selection (handwriting not readable)',
    note: rest.join('\n').trim(),
    dueDate: '',
    dueTime: '',
  };
}

const WRITTEN_TIME = /\b\d{1,2}(:\d{2})?\s*(am|pm)\b|\b\d{1,2}:\d{2}\b/i;

/**
 * With reminders turned off, a written time is not sent as a task time.
 * It's kept in the note if it isn't already in the title or note.
 */
export function withoutReminder(task: ExtractedTask): ExtractedTask {
  if (!task.dueTime) {
    return task;
  }
  const shown = WRITTEN_TIME.test(task.title) || WRITTEN_TIME.test(task.note);
  return {
    ...task,
    dueTime: '',
    note: shown ? task.note : [task.note, `Time: ${task.dueTime}`].filter(Boolean).join(' · '),
  };
}

/** Runs the selected AI provider. */
function extract(config: Config, input: Content, mode: Mode): Promise<ExtractedTask[]> {
  const ai = aiFor(config);
  return ai.extractTasks(ai.apiKey(config), ai.model(config), input, mode);
}

/** Adds tasks to the selected task app as they arrive, skipping titles already added this send. */
class Results {
  added: ExtractedTask[] = [];
  failed = 0;
  failReason?: string;
  private seen = new Set<string>();

  constructor(private config: Config) {}

  async add(found: ExtractedTask[]) {
    const tasks = this.config.createReminders ? found : found.map(withoutReminder);
    const fresh = tasks.filter(t => {
      const key = t.title.trim().toLowerCase();
      if (this.seen.has(key)) {
        return false;
      }
      this.seen.add(key);
      return true;
    });
    for (const task of fresh) {
      set({
        status: 'working',
        message: `Adding to ${taskAppFor(this.config).label}… ${this.added.length + 1}`,
      });
      log(
        `task: "${task.title.slice(0, 60)}"` +
          (task.dueDate ? ` due ${task.dueDate}` : '') +
          (task.dueTime ? ` at ${task.dueTime}` : '') +
          (task.note ? ` note "${task.note.slice(0, 60)}"` : ''),
      );
      try {
        await taskAppFor(this.config).addTask(this.config, task);
        this.added.push(task);
      } catch (e) {
        this.failed++;
        this.failReason = e instanceof Error ? e.message : String(e);
      }
    }
  }
}

async function sendPages(
  config: Config,
  results: Results,
  notePath: string,
  pages: number[],
  mode: Mode,
) {
  const batches = chunk(pages, PAGES_PER_REQUEST);
  for (const [i, batch] of batches.entries()) {
    const label =
      pages.length === 1
        ? 'the page'
        : `pages ${batch[0] + 1}–${batch[batch.length - 1] + 1} (${i + 1}/${batches.length})`;
    set({ status: 'working', message: `Capturing ${label}…` });
    const images = [];
    for (const page of batch) {
      images.push({ page, base64: await capturePage(notePath, page) });
    }
    set({ status: 'working', message: `${aiFor(config).label} is reading ${label}…` });
    try {
      await results.add(
        await extract(config, { kind: 'pages', images }, mode),
      );
    } catch (e) {
      if (!results.added.length && i === 0) {
        throw e;
      }
      // Keep what was already added; report where it stopped.
      results.failReason = `Stopped at ${label}: ${e instanceof Error ? e.message : String(e)}`;
      results.failed++;
      return;
    }
  }
}

async function send({ source, mode }: Pending) {
  set({ status: 'working', message: 'Loading settings…' });
  let config: Config;
  try {
    config = await loadConfig();
  } catch (e) {
    if (e instanceof SetupNeeded) {
      log('no keys yet: opening Settings');
      set({ status: 'setup', pending: { source, mode } });
      return;
    }
    throw e;
  }
  if (!(await ensurePermission('plugin.permission.INTERNET'))) {
    throw new Error('Network access was denied.');
  }

  const results = new Results(config);
  let emptyMessage: string | undefined;

  if (source.kind === 'notePages') {
    await sendPages(config, results, source.notePath, source.pages, mode);
  } else if (source.kind === 'marked') {
    set({ status: 'working', message: 'Finding marked headings…' });
    const marked = await getMarkedHeadings(source.notePath, source.totalPages);
    if (!marked.items.length && !marked.unrecognizedPages.length) {
      emptyMessage = 'No headings with the diagonal-line style were found in this note.';
    }
    if (marked.items.length) {
      set({
        status: 'working',
        message: `${aiFor(config).label} is reading ${marked.items.length} marked item(s)…`,
      });
      const text = marked.items.map(i => `- (page ${i.page + 1}) ${i.text}`).join('\n');
      await results.add(
        await extract(config, { kind: 'text', text }, mode),
      );
    }
    if (marked.unrecognizedPages.length) {
      await sendPages(config, results, source.notePath, marked.unrecognizedPages, mode);
    }
  } else {
    set({ status: 'working', message: `Asking ${aiFor(config).label}…` });
    let tasks = await extract(config, source, mode);
    if (mode === 'selection' && !tasks.length) {
      // A selection always becomes a task, even if the AI found nothing to do.
      log('selection: AI returned no tasks; using the selection text');
      tasks = [selectionFallback(source)];
    }
    await results.add(tasks);
  }

  log(`done: ${results.added.length} added, ${results.failed} failed`);
  set({
    status: 'done',
    appLabel: taskAppFor(config).label,
    added: results.added,
    failed: results.failed,
    failReason: results.failReason,
    emptyMessage,
  });
}
