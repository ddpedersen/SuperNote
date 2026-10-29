/**
 * Prompt, output schema and content types shared by the AI providers
 * (claude.ts, openai.ts), so both get identical instructions.
 */

/**
 * tasks: find the to-dos (page, pages, note).
 * marked: find the to-dos, but only inside diagonal-line headings.
 * selection: the user picked this (lasso / selected text); it is the task.
 */
export type Mode = 'tasks' | 'marked' | 'selection';

export type ExtractedTask = {
  title: string;
  note: string;
  dueDate: string; // YYYY-MM-DD or ""
  /** HH:MM (24h) when a time is written, e.g. "2pm" -> "14:00"; drives reminders. */
  dueTime?: string;
};

/** What one AI request contains. Pages are 0-based. */
export type Content =
  // `recognized`: the tablet's own handwriting recognition of the image, if any.
  | { kind: 'image'; base64: string; recognized?: string }
  | { kind: 'pages'; images: { page: number; base64: string }[] }
  | { kind: 'text'; text: string };

export const TASKS_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          note: { type: 'string' },
          dueDate: { type: 'string' },
          dueTime: { type: 'string' },
        },
        required: ['title', 'note', 'dueDate', 'dueTime'],
        additionalProperties: false,
      },
    },
  },
  required: ['tasks'],
  additionalProperties: false,
};

export const SYSTEM_PROMPT = `You turn handwritten notes from a Supernote e-ink tablet into tasks for the user's to-do app.

Each task you return becomes one to-do item, so:
- title: short and actionable, starting with a verb where natural (e.g. "Call Dana about the quote"). Keep the writer's wording and names; fix obvious handwriting-recognition errors. No dates, tags, or symbols like +today, #, @ in the title.
- note: extra detail written alongside the item that doesn't fit in the title, otherwise "".
- dueDate: YYYY-MM-DD only when a due date is written or clearly implied (resolve relative dates like "Fri" against today's date), otherwise "".
- dueTime: HH:MM in 24-hour time when a time of day is written for the task (e.g. "2pm" -> "14:00", "9:30" -> "09:30"), otherwise "". A time can be set without a date.

If nothing in the input is a task, return an empty list. Never invent tasks.`;

export const MODE_INSTRUCTIONS: Record<Mode, string> = {
  tasks: 'Extract every to-do item. Look for checkboxes, bullets, "todo"/"TODO", arrows, and action phrases. Skip items that are checked off or crossed out, and skip plain notes that aren\'t actions. If the whole input is a single action, return one task.',
  marked: 'The user marks the parts of the note they want considered by setting them as headings with the diagonal-line (hatched) heading style. Find every task in that marked text, and ignore everything outside it. A marked heading is usually one task but may hold several. Text items were read by the tablet\'s handwriting recognition and may contain recognition errors; fix obvious ones. For page images, use only text inside headings drawn with diagonal-line shading, not other heading styles or plain writing.',
  selection: 'The user selected exactly this content to export as task(s), so it must become at least one task even if it isn\'t phrased as an action; this overrides the empty-list rule. Keep everything the user wrote in the title, including details such as places, times, names and parentheses (e.g. "Pick up dog (Pet Suites, 2pm)"); only fix handwriting-recognition errors. The one exception: a date word such as "today" or "Fri" goes into dueDate instead of the title. Leave note empty unless the selection has extra lines beyond the task itself. If it is a list of separate items, return one task per item. Still skip items that are crossed out.',
};

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The task's due date and time if valid; a time with no date means today. */
export function dueWhen(task: ExtractedTask): { date: string; time: string } {
  const time = TIME_RE.test(task.dueTime ?? '') ? task.dueTime! : '';
  const date = DATE_RE.test(task.dueDate) ? task.dueDate : time ? today() : '';
  return { date, time };
}

/** Local date + HH:MM as a Date (device time zone). */
export function localDateTime(date: string, time: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

/** The user-turn instruction for a request. */
export function instructionFor(mode: Mode): string {
  return `Today is ${today()}.\n\n${MODE_INSTRUCTIONS[mode]}`;
}

const kb = (base64: string) => Math.round((base64.length * 3) / 4 / 1024);

/** One-line summary of a request's content for the diagnostic log. */
export function describe(input: Content): string {
  switch (input.kind) {
    case 'image':
      return `image ${kb(input.base64)} KB`;
    case 'pages':
      return `${input.images.length} page(s) ${input.images.map(i => i.page + 1).join(',')}, ` +
        `${input.images.reduce((n, i) => n + kb(i.base64), 0)} KB`;
    case 'text':
      return `text ${input.text.length} chars`;
  }
}

/** Parses the schema-constrained JSON reply; null if it isn't valid. */
export function parseTasks(text: string): ExtractedTask[] | null {
  try {
    const parsed = JSON.parse(text) as { tasks: ExtractedTask[] };
    return parsed.tasks.filter(t => t.title.trim().length > 0);
  } catch {
    return null;
  }
}
