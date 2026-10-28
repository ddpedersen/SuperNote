/**
 * OpenAI provider: same job as claude.ts, through the Chat Completions API
 * with a strict JSON-schema response format. Raw fetch, like claude.ts.
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

const API_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAIError extends Error {}

const imagePart = (base64: string) => ({
  type: 'image_url',
  image_url: { url: `data:image/png;base64,${base64}` },
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
      ? [imagePart(input.base64), { type: 'text', text: instruction }]
      : input.kind === 'pages'
        ? [
            ...input.images.flatMap(({ page, base64 }) => [
              { type: 'text', text: `Page ${page + 1}:` },
              imagePart(base64),
            ]),
            { type: 'text', text: instruction },
          ]
        : [
            { type: 'text', text: `<selected_text>\n${input.text}\n</selected_text>` },
            { type: 'text', text: instruction },
          ];

  log(`openai: ${model}, mode=${mode}, ${describe(input)}`);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_completion_tokens: 16000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'tasks', strict: true, schema: TASKS_SCHEMA },
        },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
      }),
    }, 120_000);
  } catch (e) {
    log(`openai: network failure: ${e instanceof Error ? e.message : String(e)}`);
    throw new OpenAIError(
      `Could not reach OpenAI (${e instanceof Error ? e.message : 'network error'}). Check Wi-Fi.`,
    );
  }

  const body = await res.json().catch(() => null);
  const choice = body?.choices?.[0];
  log(
    `openai: HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)}s, ` +
      `finish=${choice?.finish_reason}, served by ${body?.model}, ` +
      `tokens in/out ${body?.usage?.prompt_tokens}/${body?.usage?.completion_tokens}`,
  );
  if (!res.ok) {
    log(`openai: error body ${brief(body?.error ?? body, 300)}`);
    if (res.status === 401) {
      throw new OpenAIError('OpenAI rejected the API key (401).');
    }
    if (body?.error?.code === 'insufficient_quota') {
      throw new OpenAIError('Your OpenAI account is out of credit (insufficient_quota).');
    }
    if (res.status === 429 || res.status >= 500) {
      throw new OpenAIError(`OpenAI is busy (${res.status}). Try again shortly.`);
    }
    throw new OpenAIError(`OpenAI error ${res.status}: ${body?.error?.message ?? 'unknown error'}`);
  }

  if (choice?.message?.refusal) {
    log(`openai: refusal ${brief(choice.message.refusal)}`);
    throw new OpenAIError('OpenAI declined to process this content.');
  }
  if (choice?.finish_reason === 'length') {
    throw new OpenAIError('OpenAI response was cut off. Try fewer pages.');
  }
  const text: string = choice?.message?.content ?? '';
  const tasks = parseTasks(text);
  if (!tasks) {
    log(`openai: unparseable text ${brief(text, 300)}`);
    throw new OpenAIError('OpenAI returned an unreadable response.');
  }
  return tasks;
}

/** Checks the key and model with a free model lookup. */
export async function checkKey(apiKey: string, model: string): Promise<string> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
      { headers: { authorization: `Bearer ${apiKey}` } },
      20_000,
    );
  } catch (e) {
    return `✗ Can't reach OpenAI (${e instanceof Error ? e.message : 'network error'})`;
  }
  log(`checkKey(openai): HTTP ${res.status}`);
  if (res.ok) {
    return `✓ Key works (${model})`;
  }
  if (res.status === 401 || res.status === 403) {
    return '✗ OpenAI rejected this key';
  }
  if (res.status === 404) {
    return `✗ Key works, but model "${model}" wasn't found`;
  }
  return `✗ OpenAI error ${res.status}`;
}
