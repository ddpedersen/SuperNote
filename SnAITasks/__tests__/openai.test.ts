import {checkKey, extractTasks} from '../src/openai';
import {aiFor} from '../src/providers';
import {normalize} from '../src/config';

jest.mock('sn-plugin-lib', () => ({}));

let calls: {url: string; init: RequestInit}[] = [];
function respond(status: number, body: unknown) {
  calls = [];
  (globalThis as any).fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({url, init});
    return {ok: status < 300, status, json: async () => body};
  });
}

const reply = (tasks: unknown, extra: Record<string, unknown> = {}) => ({
  model: 'gpt-x',
  usage: {prompt_tokens: 10, completion_tokens: 5},
  choices: [{finish_reason: 'stop', message: {content: JSON.stringify({tasks}), ...extra}}],
});

describe('OpenAI provider', () => {
  it('sends images as data URLs with a strict JSON schema', async () => {
    respond(200, reply([{title: 'Order PLA', note: '', dueDate: ''}]));
    const tasks = await extractTasks(
      'sk-oa',
      'gpt-x',
      {kind: 'pages', images: [{page: 1, base64: 'QQ'}]},
      'tasks',
    );
    expect(tasks).toEqual([{title: 'Order PLA', note: '', dueDate: ''}]);
    const {url, init} = calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-oa');
    const body = JSON.parse(init.body as string);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0].role).toBe('system');
    const parts = body.messages[1].content;
    expect(parts[0]).toEqual({type: 'text', text: 'Page 2:'});
    expect(parts[1].image_url.url).toBe('data:image/png;base64,QQ');
  });

  it('reports refusals, truncation, quota and bad keys', async () => {
    const text = {kind: 'text' as const, text: 'x'};
    respond(200, reply([], {refusal: 'no'}));
    await expect(extractTasks('k', 'm', text, 'tasks')).rejects.toThrow(/declined/);
    respond(200, {choices: [{finish_reason: 'length', message: {content: '{"ta'}}]});
    await expect(extractTasks('k', 'm', text, 'tasks')).rejects.toThrow(/cut off/);
    respond(429, {error: {code: 'insufficient_quota', message: 'quota'}});
    await expect(extractTasks('k', 'm', text, 'tasks')).rejects.toThrow(/out of credit/);
    respond(401, {error: {message: 'bad key'}});
    await expect(extractTasks('k', 'm', text, 'tasks')).rejects.toThrow(/rejected the API key/);
  });

  it('checks key and model', async () => {
    respond(200, {id: 'gpt-x'});
    await expect(checkKey('k', 'gpt-x')).resolves.toMatch(/✓/);
    respond(404, {});
    await expect(checkKey('k', 'nope')).resolves.toMatch(/wasn't found/);
  });

  it('is what the registry uses when OpenAI is selected', () => {
    const c = normalize({aiProvider: 'openai', openaiApiKey: 'sk-oa', openaiModel: 'gpt-y'});
    const ai = aiFor(c);
    expect(ai.label).toBe('OpenAI');
    expect(ai.apiKey(c)).toBe('sk-oa');
    expect(ai.model(c)).toBe('gpt-y');
    expect(aiFor(normalize({})).label).toBe('Claude');
  });
});
