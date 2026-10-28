/**
 * Sends a captured image (or selected text) to Claude and gets back the
 * tasks to create. Uses the REST API directly: the Anthropic TypeScript SDK
 * does not support React Native.
 */

export type Mode = 'tasks' | 'research';

export type ExtractedTask = {
  title: string;
  note: string;
  dueDate: string; // YYYY-MM-DD or ""
};

export type Input = { kind: 'image'; base64: string } | { kind: 'text'; text: string };

const API_URL = 'https://api.anthropic.com/v1/messages';

const TASKS_SCHEMA = {
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

const SYSTEM_PROMPT = `You turn handwritten notes from a Supernote e-ink tablet into tasks for the Amazing Marvin to-do app.

Each task you return becomes one Marvin task, so:
- title: short and actionable, starting with a verb where natural (e.g. "Call Dana about the quote"). Keep the writer's wording and names; fix obvious handwriting-recognition errors. No dates, tags, or symbols like +today, #, @ in the title.
- note: extra detail written alongside the item that doesn't fit in the title, otherwise "".
- dueDate: YYYY-MM-DD only when a due date is written or clearly implied (resolve relative dates like "Fri" against today's date), otherwise "".

If nothing in the input is a task, return an empty list. Never invent tasks.`;

const MODE_INSTRUCTIONS: Record<Mode, string> = {
  tasks: 'Extract every to-do item. Look for checkboxes, bullets, "todo"/"TODO", arrows, and action phrases. Skip items that are checked off or crossed out, and skip plain notes that aren\'t actions. If the whole input is a single action, return one task.',
  research: 'The user marked this as something to research. Return one task titled "Research: <topic>" (or one per clearly separate topic). In the note, write 2-5 short bullet points: the specific questions to answer and useful search terms, based on what\'s written.',
};

export class ClaudeError extends Error {}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function extractTasks(
  apiKey: string,
  model: string,
  input: Input,
  mode: Mode,
): Promise<ExtractedTask[]> {
  const instruction = `Today is ${today()}.\n\n${MODE_INSTRUCTIONS[mode]}`;
  const content =
    input.kind === 'image'
      ? [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: input.base64 },
          },
          { type: 'text', text: instruction },
        ]
      : [
          { type: 'text', text: `<selected_text>\n${input.text}\n</selected_text>` },
          { type: 'text', text: instruction },
        ];

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2026-10-21',
        // Re-runs on Anthropic's recommended fallback model if a safety
        // classifier declines the request.
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        fallbacks: 'default',
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: TASKS_SCHEMA },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      }),
    });
  } catch {
    throw new ClaudeError('Could not reach Claude. Check Wi-Fi.');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) {
      throw new ClaudeError('Claude rejected the API key (401).');
    }
    if (res.status === 429 || res.status === 529 || res.status >= 500) {
      throw new ClaudeError(`Claude is busy (${res.status}). Try again shortly.`);
    }
    throw new ClaudeError(
      `Claude error ${res.status}: ${body?.error?.message ?? 'unknown error'}`,
    );
  }

  if (body?.stop_reason === 'refusal') {
    throw new ClaudeError('Claude declined to process this content.');
  }
  if (body?.stop_reason === 'max_tokens') {
    throw new ClaudeError('Claude response was cut off. Try a smaller selection.');
  }

  const text = (body?.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');
  try {
    const parsed = JSON.parse(text) as { tasks: ExtractedTask[] };
    return parsed.tasks.filter(t => t.title.trim().length > 0);
  } catch {
    throw new ClaudeError('Claude returned an unreadable response.');
  }
}
