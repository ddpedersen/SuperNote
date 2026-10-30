import {addTask, checkToken, defaultDueDate, tickTickDate} from '../src/ticktick';
import {today} from '../src/prompt';

jest.mock('sn-plugin-lib', () => ({}));

let calls: {url: string; init: RequestInit}[] = [];
function respond(status: number, body: unknown = {}) {
  calls = [];
  (globalThis as any).fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({url, init});
    return {ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body)};
  });
}
const sent = () => JSON.parse(calls[0].init.body as string);
const midnight = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return tickTickDate(new Date(y, m - 1, d));
};

describe('TickTick', () => {
  it('creates an Inbox task, all-day on the default due date', async () => {
    respond(200, {id: '1'});
    await addTask('tt', {title: 'Order PLA', note: 'black, 2kg', dueDate: ''}, 'today');
    const {url, init} = calls[0];
    expect(url).toBe('https://api.ticktick.com/open/v1/task');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tt');
    const body = sent();
    expect(body).toMatchObject({
      title: 'Order PLA',
      content: 'black, 2kg',
      isAllDay: true,
      dueDate: midnight(today()),
      startDate: midnight(today()),
    });
    expect(body.projectId).toBeUndefined();
    expect(body.reminders).toBeUndefined();
  });

  it('prefers a written due date and allows no default', async () => {
    respond(200);
    await addTask('tt', {title: 'A', note: '', dueDate: '2026-11-03'}, 'today');
    expect(sent().dueDate).toBe(midnight('2026-11-03'));
    respond(200);
    await addTask('tt', {title: 'B', note: '', dueDate: ''}, '');
    expect(sent()).toEqual({title: 'B'});
  });

  it('sends a written time as a timed task with a reminder 30 min before', async () => {
    respond(200, {dueDate: 'x', reminders: ['TRIGGER:-PT30M']});
    await addTask('tt', {title: 'Pick up dog', note: '', dueDate: '2026-10-29', dueTime: '14:00'}, '');
    const body = sent();
    expect(body.dueDate).toBe(tickTickDate(new Date(2026, 9, 29, 14, 0)));
    expect(body.isAllDay).toBe(false);
    expect(body.reminders).toEqual(['TRIGGER:-PT30M']);
  });

  it('formats dates the way TickTick expects', () => {
    expect(tickTickDate(new Date(Date.UTC(2026, 9, 29, 21, 5)))).toBe('2026-10-29T21:05:00+0000');
    expect(defaultDueDate('Today')).toBe(today());
    expect(defaultDueDate('tomorrow')).not.toBe(today());
    expect(defaultDueDate('someday')).toBe('');
  });

  it('reports bad tokens', async () => {
    respond(401);
    await expect(addTask('bad', {title: 'A', note: '', dueDate: ''}, '')).rejects.toThrow(/rejected/);
    await expect(checkToken('bad')).resolves.toMatch(/rejected/);
    respond(200, []);
    await expect(checkToken('tt')).resolves.toMatch(/✓/);
    expect(calls[0].url).toBe('https://api.ticktick.com/open/v1/project');
  });
});
