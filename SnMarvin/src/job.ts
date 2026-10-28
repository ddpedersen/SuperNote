/**
 * Runs a send (capture -> Claude -> Marvin) and holds the state the UI shows.
 * Lives outside React so button events that arrive before App mounts still
 * work.
 */
import { capturePage, captureLasso } from './capture';
import { extractTasks, type Input, type Mode } from './claude';
import { addTask } from './marvin';
import { loadConfig, ensurePermission, SetupNeeded } from './config';
import { clearLog, log, logError } from './log';
import { PluginManager } from 'sn-plugin-lib';

export type JobState =
  | { status: 'idle' }
  | { status: 'choose'; input: Input } // lasso captured, waiting for Tasks/Research
  | { status: 'working'; message: string }
  | { status: 'done'; added: string[]; failed: number; failReason?: string }
  | { status: 'error'; message: string }
  // Settings screen; `pending` is a send to resume once keys are saved.
  | { status: 'setup'; pending?: { input: Input; mode: Mode } }
  | { status: 'saved' };

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

export function openSettings() {
  if (!isBusy()) {
    set({ status: 'setup' });
  }
}

/** Called by the Settings screen after a successful save. */
export async function settingsSaved() {
  const pending = state.status === 'setup' ? state.pending : undefined;
  if (!pending) {
    set({ status: 'saved' });
    return;
  }
  log('resuming send after setup');
  try {
    await send(pending.input, pending.mode);
  } catch (e) {
    fail(e);
  }
}

const isBusy = () => state.status === 'working';

function fail(e: unknown) {
  logError('send', e);
  set({ status: 'error', message: e instanceof Error ? e.message : String(e) });
}

/** Starts a fresh diagnostic log for this send. */
async function begin(what: string) {
  clearLog();
  const device = await PluginManager.getDeviceType().catch(() => -1);
  log(`start: ${what} (deviceType ${device})`);
}

/** Sidebar button: send the whole current page as tasks. */
export async function startPage() {
  if (isBusy()) {
    return;
  }
  set({ status: 'working', message: 'Capturing page…' });
  try {
    await begin('page');
    await send({ kind: 'image', base64: await capturePage() }, 'tasks');
  } catch (e) {
    fail(e);
  }
}

/** Lasso button: capture now (while the lasso is active), then let the user pick a mode. */
export async function startLasso() {
  if (isBusy()) {
    return;
  }
  set({ status: 'working', message: 'Capturing selection…' });
  try {
    await begin('lasso');
    set({ status: 'choose', input: { kind: 'image', base64: await captureLasso() } });
  } catch (e) {
    fail(e);
  }
}

/** DOC text-selection button: let the user pick a mode for the selected text. */
export async function startText(text: string) {
  if (isBusy()) {
    return;
  }
  await begin(`doc text (${text.length} chars)`);
  if (!text.trim()) {
    set({ status: 'error', message: 'No text is selected.' });
    return;
  }
  set({ status: 'choose', input: { kind: 'text', text } });
}

export async function choose(mode: Mode) {
  if (state.status !== 'choose') {
    return;
  }
  const { input } = state;
  log(`mode: ${mode}`);
  try {
    await send(input, mode);
  } catch (e) {
    fail(e);
  }
}

async function send(input: Input, mode: Mode) {
  set({ status: 'working', message: 'Loading settings…' });
  let config;
  try {
    config = await loadConfig();
  } catch (e) {
    if (e instanceof SetupNeeded) {
      log('no keys yet: opening Settings');
      set({ status: 'setup', pending: { input, mode } });
      return;
    }
    throw e;
  }
  if (!(await ensurePermission('plugin.permission.INTERNET'))) {
    throw new Error('Network access was denied.');
  }

  set({ status: 'working', message: 'Asking Claude…' });
  const tasks = await extractTasks(config.anthropicApiKey, config.model, input, mode);
  log(`claude: ${tasks.length} task(s)`);
  if (tasks.length === 0) {
    set({ status: 'done', added: [], failed: 0 });
    return;
  }

  const added: string[] = [];
  let failReason: string | undefined;
  for (const [i, task] of tasks.entries()) {
    set({ status: 'working', message: `Adding to Marvin… ${i + 1}/${tasks.length}` });
    try {
      await addTask(config.marvinApiToken, task, config.titleSuffix);
      added.push(task.title);
    } catch (e) {
      failReason = e instanceof Error ? e.message : String(e);
    }
  }
  log(`done: ${added.length} added, ${tasks.length - added.length} failed`);
  set({ status: 'done', added, failed: tasks.length - added.length, failReason });
}
