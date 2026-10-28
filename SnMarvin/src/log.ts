/**
 * In-memory diagnostic log, shown on the plugin's "Show details" screen so a
 * photo of the device is enough to debug (no ADB needed). Also mirrored to
 * console.log for adb logcat. Never log API keys.
 */
const MAX_LINES = 60;
const lines: string[] = [];

const VERSION: string = require('../package.json').version;

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function log(message: string) {
  const line = `${timestamp()} ${message}`;
  lines.push(line);
  if (lines.length > MAX_LINES) {
    lines.shift();
  }
  console.log('[SnMarvin]', line);
}

export function logError(where: string, e: unknown) {
  if (e instanceof Error) {
    log(`ERROR ${where}: ${e.name}: ${e.message}`);
    const frame = e.stack?.split('\n').slice(1, 3).join(' | ').trim();
    if (frame) {
      log(`  at ${frame.slice(0, 200)}`);
    }
  } else {
    log(`ERROR ${where}: ${String(e)}`);
  }
}

/** Compact one-line summary of an SDK/API response for the log. */
export function brief(value: unknown, max = 160): string {
  let s: string;
  try {
    s = JSON.stringify(value) ?? String(value);
  } catch {
    s = String(value);
  }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Shows the first/last few characters of a secret, e.g. "sk-ant…x9Q (108 chars)". */
export function mask(secret: string): string {
  if (!secret) {
    return '(empty)';
  }
  return `${secret.slice(0, 6)}…${secret.slice(-3)} (${secret.length} chars)`;
}

export function clearLog() {
  lines.length = 0;
}

export function getLog(): string[] {
  return [`AI Task Export v${VERSION}`, ...lines];
}
