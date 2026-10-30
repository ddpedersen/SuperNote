/**
 * TickTick Open API: https://developer.ticktick.com/docs
 * Tasks without a projectId land in the Inbox. Dates are sent as UTC
 * "yyyy-MM-dd'T'HH:mm:ssZ" with the device time zone; a written time gets a
 * reminder REMINDER_MINUTES_BEFORE, an all-day date gets none.
 */
import { dueWhen, localDateTime, REMINDER_MINUTES_BEFORE, today, type ExtractedTask } from './prompt';
import { log } from './log';
import { fetchWithTimeout } from './http';

const API = 'https://api.ticktick.com/open/v1';

export class TickTickError extends Error {}

/** TickTick's date format, e.g. 2026-10-30T21:00:00+0000. */
export function tickTickDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, '+0000');
}

function timeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** "today" / "tomorrow" (case-insensitive) as YYYY-MM-DD; anything else, "". */
export function defaultDueDate(defaultDue: string): string {
  const word = defaultDue.trim().toLowerCase();
  if (word === 'today') {
    return today();
  }
  if (word === 'tomorrow') {
    const d = localDateTime(today(), '00:00');
    d.setDate(d.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return '';
}

export async function addTask(
  token: string,
  task: ExtractedTask,
  defaultDue: string,
): Promise<void> {
  const body: Record<string, unknown> = { title: task.title };
  if (task.note) {
    body.content = task.note;
  }
  const due = dueWhen(task);
  const date = due.date || defaultDueDate(defaultDue);
  if (date) {
    const at = localDateTime(date, due.time || '00:00');
    body.startDate = tickTickDate(at);
    body.dueDate = tickTickDate(at);
    body.isAllDay = !due.time;
    const tz = timeZone();
    if (tz) {
      body.timeZone = tz;
    }
    if (due.time) {
      body.reminders = [`TRIGGER:-PT${REMINDER_MINUTES_BEFORE}M`];
    }
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(`${API}/task`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }, 30_000);
  } catch (e) {
    log(`ticktick: network failure: ${e instanceof Error ? e.message : String(e)}`);
    throw new TickTickError(
      `Could not reach TickTick (${e instanceof Error ? e.message : 'network error'}). Check Wi-Fi.`,
    );
  }
  log(`ticktick: HTTP ${res.status} for "${task.title.slice(0, 40)}"`);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    log(`ticktick: error body ${detail.slice(0, 200)}`);
    throw new TickTickError(
      res.status === 401 || res.status === 403
        ? 'TickTick rejected the API token.'
        : `TickTick error ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''}`,
    );
  }
  if (due.time) {
    // The response shows whether the time and reminder were kept.
    const saved = await res.json().catch(() => null);
    log(
      `ticktick: time ${due.time} sent; saved dueDate=${saved?.dueDate ?? 'none'}, ` +
        `reminders=${JSON.stringify(saved?.reminders ?? 'none')}`,
    );
  }
}

/** Checks the token by listing projects (read-only). */
export async function checkToken(token: string): Promise<string> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${API}/project`,
      { headers: { authorization: `Bearer ${token}` } },
      20_000,
    );
  } catch (e) {
    return `✗ Can't reach TickTick (${e instanceof Error ? e.message : 'network error'})`;
  }
  log(`checkToken(ticktick): HTTP ${res.status}`);
  if (res.ok) {
    return '✓ TickTick token works';
  }
  return res.status === 401 || res.status === 403
    ? '✗ TickTick rejected this token'
    : `✗ TickTick error ${res.status}`;
}
