/**
 * Runs a send (capture -> Claude -> Marvin) and holds the state the UI shows.
 * Lives outside React so button events that arrive before App mounts still
 * work.
 */
import { capturePage, captureLasso } from './capture';
import { extractTasks, type Input, type Mode } from './claude';
import { addTask } from './marvin';
import { loadConfig, ensurePermission } from './config';

export type JobState =
  | { status: 'idle' }
  | { status: 'choose'; input: Input } // lasso captured, waiting for Tasks/Research
  | { status: 'working'; message: string }
  | { status: 'done'; added: string[]; failed: number; failReason?: string }
  | { status: 'error'; message: string };

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
  const message = e instanceof Error ? e.message : String(e);
  console.log('[SnMarvin] error:', message);
  set({ status: 'error', message });
}

/** Sidebar button: send the whole current page as tasks. */
export async function startPage() {
  if (isBusy()) {
    return;
  }
  set({ status: 'working', message: 'Capturing page…' });
  try {
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
    set({ status: 'choose', input: { kind: 'image', base64: await captureLasso() } });
  } catch (e) {
    fail(e);
  }
}

/** DOC text-selection button: let the user pick a mode for the selected text. */
export function startText(text: string) {
  if (isBusy()) {
    return;
  }
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
  try {
    await send(input, mode);
  } catch (e) {
    fail(e);
  }
}

async function send(input: Input, mode: Mode) {
  set({ status: 'working', message: 'Loading settings…' });
  const config = await loadConfig();
  if (!(await ensurePermission('plugin.permission.INTERNET'))) {
    throw new Error('Network access was denied.');
  }

  set({ status: 'working', message: 'Asking Claude…' });
  const tasks = await extractTasks(config.anthropicApiKey, config.model, input, mode);
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
      console.log('[SnMarvin] addTask failed:', failReason);
    }
  }
  set({ status: 'done', added, failed: tasks.length - added.length, failReason });
}
