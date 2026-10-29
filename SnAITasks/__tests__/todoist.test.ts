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

describe('Todoist with a written time', () => {
  it('sends a due date-time (local time to UTC), which gets reminders', async () => {
    respond(200);
    await addTask('td', {title: 'Pick up dog', note: '', dueDate: '2026-10-29', dueTime: '14:00'}, 'today');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.due_datetime).toBe(new Date(2026, 9, 29, 14, 0).toISOString());
    expect(body.due_date).toBeUndefined();
    expect(body.due_string).toBeUndefined();
  });

  it('treats a time without a date as today', async () => {
    respond(200);
    await addTask('td', {title: 'Call', note: '', dueDate: '', dueTime: '09:30'}, '');
    const due = new Date(JSON.parse(calls[0].init.body as string).due_datetime);
    const now = new Date();
    expect([due.getFullYear(), due.getMonth(), due.getDate(), due.getHours(), due.getMinutes()]).toEqual(
      [now.getFullYear(), now.getMonth(), now.getDate(), 9, 30],
    );
  });
});

describe('Todoist reminder', () => {
  it('adds a 30-minute relative reminder via sync for a timed task', async () => {
    calls = [];
    (globalThis as any).fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({url, init});
      if (url.endsWith('/tasks')) {
        return {ok: true, status: 200, json: async () => ({id: '123'})};
      }
      const cmds = JSON.parse(decodeURIComponent(String(init.body).replace('commands=', '')));
      return {ok: true, status: 200, json: async () => ({sync_status: {[cmds[0].uuid]: 'ok'}})};
    });
    await addTask('td', {title: 'Vet', note: '', dueDate: '2026-10-29', dueTime: '16:00'}, '');
    expect(calls[1].url).toBe('https://api.todoist.com/api/v1/sync');
    const cmds = JSON.parse(decodeURIComponent(String(calls[1].init.body).replace('commands=', '')));
    expect(cmds[0]).toMatchObject({
      type: 'reminder_add',
      args: {item_id: '123', type: 'relative', minute_offset: 30},
    });
  });

  it('keeps the task if the reminder is refused (free plan)', async () => {
    (globalThis as any).fetch = jest.fn(async (url: string) =>
      url.endsWith('/tasks')
        ? {ok: true, status: 200, json: async () => ({id: '9'})}
        : {ok: false, status: 403, json: async () => ({error: 'premium only'})},
    );
    await expect(
      addTask('td', {title: 'Vet', note: '', dueDate: '', dueTime: '16:00'}, ''),
    ).resolves.toBeUndefined();
  });

  it('skips the reminder when no time is written', async () => {
    respond(200, {id: '5'});
    await addTask('td', {title: 'No time', note: '', dueDate: '', dueTime: ''}, 'today');
    expect(calls).toHaveLength(1);
  });
});
