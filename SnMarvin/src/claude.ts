/**
 * Sends captured page images, a lasso image, or text to Claude and gets back
 * the tasks to create. Uses the REST API directly: the Anthropic TypeScript SDK
 * does not support React Native.
 */
import { log, brief } from './log';
import { fetchWithTimeout } from './http';

export type Mode = 'tasks' | 'research' | 'marked';

export type ExtractedTask = {
  title: string;
  note: string;
  dueDate: string; // YYYY-MM-DD or ""
};

/** What one Claude request contains. Pages are 0-based. */
export type Content =
  | { kind: 'image'; base64: string }
  | { kind: 'pages'; images: { page: number; base64: string }[] }
  | { kind: 'text'; text: string };

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
  marked: 'The user marks each item they want in Marvin as a heading with the diagonal-line (hatched) heading style. Create exactly one task per marked item and ignore everything else. Text items were read by the tablet\'s handwriting recognition and may contain recognition errors; fix obvious ones. For page images, use only headings drawn with diagonal-line shading, not other heading styles or plain writing.',
};

export class ClaudeError extends Error {}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const imageBlock = (base64: string) => ({
  type: 'image',
  source: { type: 'base64', media_type: 'image/png', data: base64 },
});

const kb = (base64: string) => Math.round((base64.length * 3) / 4 / 1024);

function describe(input: Content): string {
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

export async function extractTasks(
  apiKey: string,
  model: string,
  input: Content,
  mode: Mode,
): Promise<ExtractedTask[]> {
  const instruction = `Today is ${today()}.\n\n${MODE_INSTRUCTIONS[mode]}`;
  const content =
    input.kind === 'image'
      ? [imageBlock(input.base64), { type: 'text', text: instruction }]
      : input.kind === 'pages'
        ? [
            ...input.images.flatMap(({ page, base64 }) => [
              { type: 'text', text: `Page ${page + 1}:` },
              imageBlock(base64),
            ]),
            { type: 'text', text: instruction },
          ]
        : [
            { type: 'text', text: `<selected_text>\n${input.text}\n</selected_text>` },
            { type: 'text', text: instruction },
          ];

  log(`claude: ${model}, mode=${mode}, ${describe(input)}`);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetchWithTimeout(API_URL, {
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
    }, 120_000);
  } catch (e) {
    log(`claude: network failure: ${e instanceof Error ? e.message : String(e)}`);
    throw new ClaudeError(
      `Could not reach Claude (${e instanceof Error ? e.message : 'network error'}). Check Wi-Fi.`,
    );
  }

  const body = await res.json().catch(() => null);
  log(
    `claude: HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)}s, ` +
      `stop=${body?.stop_reason}, served by ${body?.model}, ` +
      `tokens in/out ${body?.usage?.input_tokens}/${body?.usage?.output_tokens}`,
  );
  if (!res.ok) {
    log(`claude: error body ${brief(body?.error ?? body, 300)}`);
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
    log(`claude: refusal ${brief(body?.stop_details)}`);
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
    log(`claude: unparseable text ${brief(text, 300)}`);
    throw new ClaudeError('Claude returned an unreadable response.');
  }
}

/** Checks the key and model with a free Models API lookup. */
export async function checkKey(apiKey: string, model: string): Promise<string> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`,
      { headers: { 'x-api-key': apiKey, 'anthropic-version': '2026-10-21' } },
      20_000,
    );
  } catch (e) {
    return `✗ Can't reach Anthropic (${e instanceof Error ? e.message : 'network error'})`;
  }
  log(`checkKey: HTTP ${res.status}`);
  if (res.ok) {
    const body = await res.json().catch(() => null);
    return `✓ Key works (${body?.display_name ?? model})`;
  }
  if (res.status === 401 || res.status === 403) {
    return '✗ Anthropic rejected this key';
  }
  if (res.status === 404) {
    return `✗ Key works, but model "${model}" wasn't found`;
  }
  return `✗ Anthropic error ${res.status}`;
}
