/**
 * Claude provider: sends captured page images, a lasso image, or text to
 * the Claude Messages API and gets back the tasks to create. Uses the REST API directly: the Anthropic TypeScript SDK
 * does not support React Native.
 */
import { log, brief } from './log';
import { fetchWithTimeout } from './http';
import {
  describe,
  instructionFor,
  parseTasks,
  SYSTEM_PROMPT,
  TASKS_SCHEMA,
  type Content,
  type ExtractedTask,
  type Mode,
} from './prompt';

const API_URL = 'https://api.anthropic.com/v1/messages';

export class ClaudeError extends Error {}

const imageBlock = (base64: string) => ({
  type: 'image',
  source: { type: 'base64', media_type: 'image/png', data: base64 },
});

export async function extractTasks(
  apiKey: string,
  model: string,
  input: Content,
  mode: Mode,
): Promise<ExtractedTask[]> {
  const instruction = instructionFor(mode);
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
  const tasks = parseTasks(text);
  if (!tasks) {
    log(`claude: unparseable text ${brief(text, 300)}`);
    throw new ClaudeError('Claude returned an unreadable response.');
  }
  return tasks;
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
