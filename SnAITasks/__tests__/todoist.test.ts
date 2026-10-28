import {addTask, checkToken} from '../src/todoist';

jest.mock('sn-plugin-lib', () => ({}));

let calls: {url: string; init: RequestInit}[] = [];
function respond(status: number, body: unknown = {}) {
  calls = [];
  (globalThis as any).fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({url, init});
    return {ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body)};
  });
}

describe('Todoist', () => {
  it('creates an Inbox task with the default due date', async () => {
    respond(200, {id: '1'});
    await addTask('td', {title: 'Order PLA', note: 'black, 2kg', dueDate: ''}, 'today');
    const {url, init} = calls[0];
    expect(url).toBe('https://api.todoist.com/api/v1/tasks');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer td');
    expect(JSON.parse(init.body as string)).toEqual({
      content: 'Order PLA',
      description: 'black, 2kg',
      due_string: 'today',
    });
  });

  it('prefers a written due date and allows no default', async () => {
    respond(200);
    await addTask('td', {title: 'A', note: '', dueDate: '2026-11-03'}, 'today');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({content: 'A', due_date: '2026-11-03'});
    respond(200);
    await addTask('td', {title: 'B', note: '', dueDate: ''}, '');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({content: 'B'});
  });

  it('reports bad tokens', async () => {
    respond(401);
    await expect(addTask('bad', {title: 'A', note: '', dueDate: ''}, '')).rejects.toThrow(/rejected/);
    await expect(checkToken('bad')).resolves.toMatch(/rejected/);
    respond(200, {results: []});
    await expect(checkToken('td')).resolves.toMatch(/✓/);
  });
});
