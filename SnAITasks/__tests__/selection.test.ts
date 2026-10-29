/** Lasso / selected text: literal mode, recognition hint, and fallback. */
jest.mock('sn-plugin-lib', () => ({
  FileUtils: {makeDir: jest.fn(async () => true), deleteFile: jest.fn(async () => true), exists: jest.fn(async () => false), listFiles: jest.fn(async () => [])},
  PluginManager: {
    getDeviceType: jest.fn(async () => 7),
    getPluginDirPath: jest.fn(async () => '/plugin'),
    hasPermission: jest.fn(async () => 1),
    registerEventListener: jest.fn(),
  },
  PluginNoteAPI: {},
  PluginFileAPI: {getPageSize: jest.fn(async () => ({success: true, result: {width: 1920, height: 2560}}))},
  PluginCommAPI: {
    generateLassoPreview: jest.fn(async (p: string) => ({success: true, result: {imagePath: p}})),
    getLassoElements: jest.fn(async () => ({
      success: true,
      result: [{uuid: 's', type: 0, numInPage: 1}],
    })),
    getCurrentFilePath: jest.fn(async () => ({success: true, result: '/n.note'})),
    getCurrentPageNum: jest.fn(async () => ({success: true, result: 0})),
    recognizeElements: jest.fn(async () => ({success: true, result: 'Dentist friday'})),
    recycleElement: jest.fn(),
  },
}));

import {getState, startLasso, startText} from '../src/job';

const bodies: any[] = [];
let aiReplyTasks: unknown[] = [];

beforeEach(() => {
  bodies.length = 0;
  (globalThis as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('file://')) {
      // config.json lookup, or reading the captured PNG
      return {
        status: 0,
        text: async (): Promise<string> =>
          url.endsWith('config.json')
            ? JSON.stringify({anthropicApiKey: 'k', marvinApiToken: 't'})
            : '',
        blob: async () => ({size: 3, type: 'image/png'}),
      };
    }
    bodies.push({url, body: JSON.parse(init!.body as string)});
    if (url.includes('anthropic')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          stop_reason: 'end_turn',
          content: [{type: 'text', text: JSON.stringify({tasks: aiReplyTasks})}],
        }),
      };
    }
    return {ok: true, status: 200, text: async (): Promise<string> => '{}'}; // Marvin
  });
  (globalThis as any).FileReader = class {
    result = 'data:image/png;base64,QUJD';
    onload: () => void = () => {};
    readAsDataURL() {
      this.onload();
    }
  };
});

it('sends the lasso in literal mode with the tablet recognition as a hint', async () => {
  aiReplyTasks = [{title: 'Book dentist', note: '', dueDate: ''}];
  await startLasso();
  const claude = bodies.find(b => b.url.includes('anthropic')).body;
  const texts = claude.messages[0].content.filter((c: any) => c.type === 'text').map((c: any) => c.text);
  expect(texts[0]).toMatch(/recognition read this as: Dentist friday/);
  expect(texts[1]).toMatch(/must become at least one task/);
  expect(texts[1]).toMatch(/Keep everything the user wrote in the title/);
  expect(getState()).toMatchObject({
    status: 'done',
    added: [expect.objectContaining({title: 'Book dentist'})],
    appLabel: 'Amazing Marvin',
  });
});

it('still creates a task from the selection if the AI returns none', async () => {
  aiReplyTasks = [];
  await startText('Call the printer shop\nask about bed leveling');
  const marvin = bodies.find(b => b.url.includes('amazingmarvin')).body;
  expect(marvin.title).toBe('Call the printer shop +today');
  expect(marvin.note).toBe('ask about bed leveling');
  expect(getState()).toMatchObject({
    status: 'done',
    added: [{title: 'Call the printer shop', note: 'ask about bed leveling', dueDate: ''}],
  });
});
