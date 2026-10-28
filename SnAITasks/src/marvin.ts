/**
 * Amazing Marvin API: https://github.com/amazingmarvin/MarvinAPI/wiki/Marvin-API
 * Tasks without a parentId land in the Inbox. Title autocompletion is on, so
 * a trailing "+today" schedules the task for today and is stripped.
 */
import type { ExtractedTask } from './claude';
import { log } from './log';
import { fetchWithTimeout } from './http';

const ADD_TASK_URL = 'https://serv.amazingmarvin.com/api/addTask';

export class MarvinError extends Error {}

export async function addTask(
  token: string,
  task: ExtractedTask,
  titleSuffix: string,
): Promise<void> {
  const body: Record<string, unknown> = {
    title: titleSuffix ? `${task.title} ${titleSuffix}` : task.title,
    // Marvin wants minutes to add to UTC (e.g. -480 for Pacific).
    timeZoneOffset: -new Date().getTimezoneOffset(),
  };
  if (task.note) {
    body.note = task.note;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) {
    body.dueDate = task.dueDate;
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(ADD_TASK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-Token': token },
      body: JSON.stringify(body),
    }, 30_000);
  } catch (e) {
    log(`marvin: network failure: ${e instanceof Error ? e.message : String(e)}`);
    throw new MarvinError(
      `Could not reach Marvin (${e instanceof Error ? e.message : 'network error'}). Check Wi-Fi.`,
    );
  }
  log(`marvin: HTTP ${res.status} for "${task.title.slice(0, 40)}"`);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    log(`marvin: error body ${detail.slice(0, 200)}`);
    throw new MarvinError(
      res.status === 401 || res.status === 403
        ? 'Marvin rejected the API token.'
        : `Marvin error ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''}`,
    );
  }
}

/** Checks the token with Marvin's credential test endpoint. */
export async function checkToken(token: string): Promise<string> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      'https://serv.amazingmarvin.com/api/test',
      { method: 'POST', headers: { 'X-API-Token': token } },
      20_000,
    );
  } catch (e) {
    return `✗ Can't reach Marvin (${e instanceof Error ? e.message : 'network error'})`;
  }
  log(`checkToken: HTTP ${res.status}`);
  if (res.ok) {
    return '✓ Marvin token works';
  }
  return res.status === 401 || res.status === 403
    ? '✗ Marvin rejected this token'
    : `✗ Marvin error ${res.status}`;
}
