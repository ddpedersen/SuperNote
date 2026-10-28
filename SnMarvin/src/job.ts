/**
 * Runs a send (capture -> Claude -> Marvin) and holds the state the UI shows.
 * Lives outside React so button events that arrive before App mounts still
 * work.
 */
import {
  captureLasso,
  capturePage,
  getMarkedHeadings,
  getNoteInfo,
  type NoteInfo,
} from './capture';
import { extractTasks, type Content, type ExtractedTask, type Mode } from './claude';
import { addTask } from './marvin';
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
  | { status: 'done'; added: string[]; failed: number; failReason?: string; emptyMessage?: string }
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
  const { model } = await loadSettings().catch(() => ({ model: '' }));
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

/** Lasso button: capture now (while the lasso is active) and send as tasks. */
export async function startLasso() {
  if (isBusy()) {
    return;
  }
  set({ status: 'working', message: 'Capturing selection…' });
  let base64: string;
  try {
    await begin('lasso');
    base64 = await captureLasso();
  } catch (e) {
    fail(e);
    return;
  }
  await run({ source: { kind: 'image', base64 }, mode: 'tasks' });
}

/** DOC text-selection button: send the selected text as tasks. */
export async function startText(text: string) {
  if (isBusy()) {
    return;
  }
  await begin(`doc text (${text.length} chars)`);
  if (!text.trim()) {
    set({ status: 'error', message: 'No text is selected.' });
    return;
  }
  await run({ source: { kind: 'text', text }, mode: 'tasks' });
}

// -------------------------------------------------------------------- send

/** Adds tasks to Marvin as they arrive, skipping titles already added this send. */
class Results {
  added: string[] = [];
  failed = 0;
  failReason?: string;
  private seen = new Set<string>();

  constructor(private config: Config) {}

  async add(tasks: ExtractedTask[]) {
    const fresh = tasks.filter(t => {
      const key = t.title.trim().toLowerCase();
      if (this.seen.has(key)) {
        return false;
      }
      this.seen.add(key);
      return true;
    });
    for (const task of fresh) {
      set({ status: 'working', message: `Adding to Marvin… ${this.added.length + 1}` });
      try {
        await addTask(this.config.marvinApiToken, task, this.config.titleSuffix);
        this.added.push(task.title);
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
    set({ status: 'working', message: `Claude is reading ${label}…` });
    try {
      await results.add(
        await extractTasks(config.anthropicApiKey, config.model, { kind: 'pages', images }, mode),
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
      set({ status: 'working', message: `Claude is reading ${marked.items.length} marked item(s)…` });
      const text = marked.items.map(i => `- (page ${i.page + 1}) ${i.text}`).join('\n');
      await results.add(
        await extractTasks(config.anthropicApiKey, config.model, { kind: 'text', text }, mode),
      );
    }
    if (marked.unrecognizedPages.length) {
      await sendPages(config, results, source.notePath, marked.unrecognizedPages, mode);
    }
  } else {
    set({ status: 'working', message: 'Asking Claude…' });
    await results.add(await extractTasks(config.anthropicApiKey, config.model, source, mode));
  }

  log(`done: ${results.added.length} added, ${results.failed} failed`);
  set({
    status: 'done',
    added: results.added,
    failed: results.failed,
    failReason: results.failReason,
    emptyMessage,
  });
}
