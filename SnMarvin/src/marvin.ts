/**
 * Amazing Marvin API: https://github.com/amazingmarvin/MarvinAPI/wiki/Marvin-API
 * Tasks without a parentId land in the Inbox. Title autocompletion is on, so
 * a trailing "+today" schedules the task for today and is stripped.
 */
import type { ExtractedTask } from './claude';

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
    res = await fetch(ADD_TASK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-Token': token },
      body: JSON.stringify(body),
    });
  } catch {
    throw new MarvinError('Could not reach Marvin. Check Wi-Fi.');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new MarvinError(
      res.status === 401 || res.status === 403
        ? 'Marvin rejected the API token.'
        : `Marvin error ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''}`,
    );
  }
}
