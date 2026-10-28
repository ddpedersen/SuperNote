/**
 * Prompt, output schema and content types shared by the AI providers
 * (claude.ts, openai.ts), so both get identical instructions.
 */

export type Mode = 'tasks' | 'marked';

export type ExtractedTask = {
  title: string;
  note: string;
  dueDate: string; // YYYY-MM-DD or ""
};

/** What one AI request contains. Pages are 0-based. */
export type Content =
  | { kind: 'image'; base64: string }
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
        },
        required: ['title', 'note', 'dueDate'],
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

If nothing in the input is a task, return an empty list. Never invent tasks.`;

export const MODE_INSTRUCTIONS: Record<Mode, string> = {
  tasks: 'Extract every to-do item. Look for checkboxes, bullets, "todo"/"TODO", arrows, and action phrases. Skip items that are checked off or crossed out, and skip plain notes that aren\'t actions. If the whole input is a single action, return one task.',
  marked: 'The user marks each item they want exported as a heading with the diagonal-line (hatched) heading style. Create exactly one task per marked item and ignore everything else. Text items were read by the tablet\'s handwriting recognition and may contain recognition errors; fix obvious ones. For page images, use only headings drawn with diagonal-line shading, not other heading styles or plain writing.',
};

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
