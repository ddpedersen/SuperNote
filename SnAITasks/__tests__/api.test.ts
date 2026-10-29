import {extractTasks} from '../src/claude';
import {addTask} from '../src/marvin';

type Call = {url: string; init: RequestInit};
let calls: Call[];

function mockFetch(status: number, body: unknown) {
  calls = [];
  (globalThis as any).fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({url, init});
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  });
}

const claudeReply = (tasks: unknown, stop_reason = 'end_turn') => ({
  stop_reason,
  content: [
    {type: 'thinking', thinking: ''},
    {type: 'text', text: JSON.stringify({tasks})},
  ],
});

describe('extractTasks', () => {
  it('sends the image with structured output and parses tasks', async () => {
    mockFetch(200, claudeReply([{title: 'Call Dana', note: '', dueDate: ''}]));
    const tasks = await extractTasks(
      'sk-test',
      'claude-opus-5-5',
      {kind: 'image', base64: 'AAAA'},
      'tasks',
    );
    expect(tasks).toEqual([{title: 'Call Dana', note: '', dueDate: ''}]);

    const {url, init} = calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2026-10-21');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.fallbacks).toBe('default');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.messages[0].content[0].source).toEqual({
      type: 'base64',
      media_type: 'image/png',
      data: 'AAAA',
    });
  });

  it('drops blank titles and returns [] for no tasks', async () => {
    mockFetch(200, claudeReply([{title: '  ', note: '', dueDate: ''}]));
    await expect(
      extractTasks('k', 'm', {kind: 'text', text: 'hello'}, 'tasks'),
    ).resolves.toEqual([]);
  });

  it('reports refusals and HTTP errors', async () => {
    mockFetch(200, claudeReply([], 'refusal'));
    await expect(extractTasks('k', 'm', {kind: 'text', text: 'x'}, 'tasks')).rejects.toThrow(
      /declined/,
    );
    mockFetch(401, {error: {message: 'invalid x-api-key'}});
    await expect(extractTasks('k', 'm', {kind: 'text', text: 'x'}, 'tasks')).rejects.toThrow(
      /API key/,
    );
  });
});

describe('addTask', () => {
  it('posts to the Marvin inbox with +today and optional fields', async () => {
    mockFetch(200, {_id: 'abc'});
    await addTask('tok', {title: 'Buy filament', note: 'PETG', dueDate: '2026-11-02'}, '+today');
    const {url, init} = calls[0];
    expect(url).toBe('https://serv.amazingmarvin.com/api/addTask');
    expect((init.headers as Record<string, string>)['X-API-Token']).toBe('tok');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      title: 'Buy filament +today',
      note: 'PETG',
      dueDate: '2026-11-02',
    });
    expect(body.parentId).toBeUndefined();
    expect(typeof body.timeZoneOffset).toBe('number');
  });

  it('omits empty note and invalid dueDate', async () => {
    mockFetch(200, {});
    await addTask('tok', {title: 'X', note: '', dueDate: 'Friday'}, '+today');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.note).toBeUndefined();
    expect(body.dueDate).toBeUndefined();
  });

  it('sends task time and a reminder 30 minutes before for a written time', async () => {
    mockFetch(200, {_id: 'x', taskTime: '14:00'});
    await addTask('tok', {title: 'Pick up dog', note: '', dueDate: '2026-10-29', dueTime: '14:00'}, '+today');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({
      dueDate: '2026-10-29',
      day: '2026-10-29',
      taskTime: '14:00',
      reminderOffset: 30,
      reminderTime: String(new Date(2026, 9, 29, 14, 0).getTime() / 1000 - 30 * 60),
    });
  });

  it('ignores an invalid time', async () => {
    mockFetch(200, {});
    await addTask('tok', {title: 'X', note: '', dueDate: '', dueTime: '2pm'}, '+today');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.taskTime).toBeUndefined();
    expect(body.reminderTime).toBeUndefined();
  });

  it('surfaces auth failures', async () => {
    mockFetch(401, 'nope');
    await expect(addTask('bad', {title: 'X', note: '', dueDate: ''}, '')).rejects.toThrow(
      /token/,
    );
  });
});
