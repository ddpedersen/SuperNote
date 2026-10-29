/**
 * Todoist API v1: https://developer.todoist.com/api/v1
 * Tasks without a project_id land in the Inbox. A written due date is sent
 * as due_date (with a written time, due_datetime, which gets reminders);
 * otherwise the user's default (e.g. "today") as due_string.
 */
import { dueWhen, localDateTime, type ExtractedTask } from './prompt';
import { log } from './log';
import { fetchWithTimeout } from './http';

const API = 'https://api.todoist.com/api/v1';

export class TodoistError extends Error {}

export async function addTask(
  token: string,
  task: ExtractedTask,
  defaultDue: string,
): Promise<void> {
  const body: Record<string, unknown> = { content: task.title };
  if (task.note) {
    body.description = task.note;
  }
  const due = dueWhen(task);
  if (due.time) {
    // A timed task gets Todoist's reminders.
    body.due_datetime = localDateTime(due.date, due.time).toISOString();
  } else if (due.date) {
    body.due_date = due.date;
  } else if (defaultDue) {
    body.due_string = defaultDue;
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(`${API}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }, 30_000);
  } catch (e) {
    log(`todoist: network failure: ${e instanceof Error ? e.message : String(e)}`);
    throw new TodoistError(
      `Could not reach Todoist (${e instanceof Error ? e.message : 'network error'}). Check Wi-Fi.`,
    );
  }
  log(`todoist: HTTP ${res.status} for "${task.title.slice(0, 40)}"`);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    log(`todoist: error body ${detail.slice(0, 200)}`);
    throw new TodoistError(
      res.status === 401 || res.status === 403
        ? 'Todoist rejected the API token.'
        : `Todoist error ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''}`,
    );
  }
}

/** Checks the token by listing one project (read-only). */
export async function checkToken(token: string): Promise<string> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${API}/projects?limit=1`,
      { headers: { authorization: `Bearer ${token}` } },
      20_000,
    );
  } catch (e) {
    return `✗ Can't reach Todoist (${e instanceof Error ? e.message : 'network error'})`;
  }
  log(`checkToken(todoist): HTTP ${res.status}`);
  if (res.ok) {
    return '✓ Todoist token works';
  }
  return res.status === 401 || res.status === 403
    ? '✗ Todoist rejected this token'
    : `✗ Todoist error ${res.status}`;
}
