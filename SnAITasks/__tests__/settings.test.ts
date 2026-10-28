/**
 * Settings persistence through a mocked note file (store.ts) and the
 * key/token checks.
 */
const mockFiles = new Map<string, any[]>(); // note path -> page-0 elements
const mockDirs = new Map<string, string[]>(); // dir -> entries (full paths)
const mockText = new Map<string, string>(); // file path -> contents (read via fetch)

jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    hasPermission: jest.fn(async () => 1),
    requestPermission: jest.fn(async () => 2),
  },
  FileUtils: {
    exists: jest.fn(async (p: string) => mockFiles.has(p)),
    makeDir: jest.fn(async () => true),
    // Like the device: { path, type } objects, type 0 = folder, 1 = file.
    listFiles: jest.fn(async (dir: string) =>
      (mockDirs.get(dir) ?? []).map(path => ({path, type: mockDirs.has(path) ? 0 : 1})),
    ),
  },
  PluginCommAPI: {
    getNoteSystemTemplates: jest.fn(async () => [{name: 'style_white'}]),
    createElement: jest.fn(async (type: number) => ({
      success: true,
      result: {uuid: 'u1', type, numInPage: 1},
    })),
    recycleElement: jest.fn(),
  },
  PluginFileAPI: {
    createNote: jest.fn(async ({notePath}: {notePath: string}) => {
      mockFiles.set(notePath, []);
      return {success: true, result: true};
    }),
    insertElements: jest.fn(async (p: string, _page: number, els: any[]) => {
      mockFiles.get(p)!.push(...els);
      return {success: true, result: true};
    }),
    replaceElements: jest.fn(async (p: string, _page: number, els: any[]) => {
      mockFiles.set(p, [...els]);
      return {success: true, result: true};
    }),
    getElements: jest.fn(async (_page: number, p: string) => ({
      success: true,
      result: JSON.parse(JSON.stringify(mockFiles.get(p) ?? [])),
    })),
  },
}));

import {PluginFileAPI} from 'sn-plugin-lib';
import {decode, encode, readStored, STORE_PATH} from '../src/store';
import {checkKey} from '../src/claude';
import {checkToken} from '../src/marvin';

function freshConfig() {
  let mod: typeof import('../src/config');
  jest.isolateModules(() => {
    mod = require('../src/config');
  });
  return mod!;
}

const MS = '/storage/emulated/0/MyStyle';

function useFileFetch() {
  (globalThis as any).fetch = jest.fn(async (url: string) => ({
    status: 0,
    text: async () => mockText.get(url.replace('file://', '')) ?? '',
  }));
}

beforeEach(() => {
  mockFiles.clear();
  mockDirs.clear();
  mockText.clear();
  jest.clearAllMocks();
  useFileFetch();
});

describe('store encoding', () => {
  it('round-trips and hides ASCII keys', () => {
    const s = '{"anthropicApiKey":"sk-ant-SECRET"}';
    expect(encode(s)).not.toContain('SECRET');
    expect(decode(encode(s))).toBe(s);
  });
  it('passes non-ASCII through unchanged', () => {
    expect(decode(encode('+heute ü'))).toBe('+heute ü');
  });
});

describe('settings persistence', () => {
  const input = {
    anthropicApiKey: ' sk-ant-abc ',
    marvinApiToken: 'tok',
    model: '',
    titleSuffix: '+today',
  };

  it('creates the note on first save, then replaces on later saves', async () => {
    const {saveSettings} = freshConfig();
    await saveSettings(input);
    expect(PluginFileAPI.createNote).toHaveBeenCalledTimes(1);
    expect(PluginFileAPI.insertElements).toHaveBeenCalledTimes(1);
    const el = mockFiles.get(STORE_PATH)![0];
    expect(el.type).toBe(500);
    expect(el.layerNum).toBe(0);
    expect(el.textBox.textContentFull).not.toContain('sk-ant');

    await saveSettings({...input, marvinApiToken: 'tok2'});
    expect(PluginFileAPI.createNote).toHaveBeenCalledTimes(1);
    expect(PluginFileAPI.replaceElements).toHaveBeenCalledTimes(1);
    expect(mockFiles.get(STORE_PATH)).toHaveLength(1);
  });

  it('loads saved settings in a fresh session, trimmed with defaults', async () => {
    await freshConfig().saveSettings(input);
    const cfg = await freshConfig().loadConfig();
    expect(cfg).toEqual({
      anthropicApiKey: 'sk-ant-abc',
      marvinApiToken: 'tok',
      model: 'claude-opus-5-5',
      titleSuffix: '+today',
    });
    expect(JSON.parse((await readStored())!).marvinApiToken).toBe('tok');
  });

  it('asks for setup when nothing is saved', async () => {
    const {loadConfig, SetupNeeded} = freshConfig();
    await expect(loadConfig()).rejects.toBeInstanceOf(SetupNeeded);
  });

  it('finds a key file with any name in a MyStyle subfolder', async () => {
    mockDirs.set(MS, [`${MS}/stickers`, `${MS}/template.png`, `${MS}/other.json`]);
    mockDirs.set(`${MS}/stickers`, [`${MS}/stickers/my keys.json`]);
    mockText.set(`${MS}/other.json`, '{"unrelated": true}');
    mockText.set(
      `${MS}/stickers/my keys.json`,
      JSON.stringify({anthropicApiKey: 'k', marvinApiToken: 't'}),
    );
    const cfg = freshConfig();
    expect((await cfg.loadConfig()).anthropicApiKey).toBe('k');
    expect(cfg.keyFilePath).toBe('MyStyle/stickers/my keys.json');
  });

  it('still finds MyStyle/SnMarvin/config.json when listing fails', async () => {
    const {FileUtils} = require('sn-plugin-lib');
    (FileUtils.listFiles as jest.Mock).mockRejectedValueOnce(new Error('Dir is not exists'));
    mockText.set(`${MS}/SnMarvin/config.json`, JSON.stringify({anthropicApiKey: 'k', marvinApiToken: 't'}));
    const cfg = freshConfig();
    expect((await cfg.loadConfig()).marvinApiToken).toBe('t');
    expect(cfg.keyFilePath).toBe('MyStyle/SnMarvin/config.json');
  });

  it('accepts plain string paths from listFiles too', async () => {
    const {FileUtils} = require('sn-plugin-lib');
    (FileUtils.listFiles as jest.Mock).mockResolvedValueOnce([`${MS}/keys.json`]);
    mockText.set(`${MS}/keys.json`, JSON.stringify({anthropicApiKey: 'k2', marvinApiToken: 't'}));
    expect((await freshConfig().loadConfig()).anthropicApiKey).toBe('k2');
  });

  it('explains curly quotes from a phone keyboard', async () => {
    mockDirs.set(MS, [`${MS}/marvin.json`]);
    mockText.set(`${MS}/marvin.json`, '{ “anthropicApiKey”: “k” }');
    await expect(freshConfig().readConfigFile()).rejects.toThrow(/curly quotes/);
  });

  it('accepts the on-screen template once filled in', async () => {
    const {KEY_FILE_TEMPLATE} = freshConfig();
    mockDirs.set(MS, [`${MS}/marvin-keys.json`]);
    mockText.set(
      `${MS}/marvin-keys.json`,
      KEY_FILE_TEMPLATE.replace('PASTE_ANTHROPIC_KEY', 'sk-ant-x').replace('PASTE_MARVIN_TOKEN', 'm'),
    );
    const cfg = await freshConfig().loadConfig();
    expect(cfg).toMatchObject({anthropicApiKey: 'sk-ant-x', marvinApiToken: 'm', titleSuffix: '+today'});
  });

  it('refuses to save without both keys', async () => {
    await expect(freshConfig().saveSettings({...input, marvinApiToken: ' '})).rejects.toThrow(
      /required/,
    );
    expect(mockFiles.size).toBe(0);
  });
});

describe('saving from the plugin-list gear (no note open)', () => {
  const keys = {anthropicApiKey: 'sk-ant-abc', marvinApiToken: 'tok'};
  const noNote = () =>
    (PluginFileAPI.createNote as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: {code: 102, message: 'no note context'},
    });

  it('defers the write, keeps keys usable, and flushes on next note use', async () => {
    noNote();
    const cfg = freshConfig();
    await expect(cfg.saveSettings(keys, true)).resolves.toBe('deferred');
    expect(mockFiles.size).toBe(0);
    expect(cfg.hasPendingSave()).toBe(true);
    await expect(cfg.loadConfig()).resolves.toMatchObject(keys); // in memory

    await cfg.flushPendingSave('plugin button');
    expect(cfg.hasPendingSave()).toBe(false);
    expect(JSON.parse((await readStored())!)).toMatchObject(keys);
  });

  it('keeps the pending save if the flush still has no note', async () => {
    noNote();
    const cfg = freshConfig();
    await cfg.saveSettings(keys, true);
    noNote();
    await cfg.flushPendingSave('pen stroke');
    expect(cfg.hasPendingSave()).toBe(true);
  });

  it('saves immediately when the write works from the gear', async () => {
    const cfg = freshConfig();
    await expect(cfg.saveSettings(keys, true)).resolves.toBe('saved');
    expect(cfg.hasPendingSave()).toBe(false);
  });

  it('still throws write errors when opened from a note', async () => {
    noNote();
    await expect(freshConfig().saveSettings(keys)).rejects.toThrow(/note open/);
  });
});

describe('key checks', () => {
  const respond = (status: number, body: unknown = {}) =>
    ((globalThis as any).fetch = jest.fn(async () => ({
      ok: status < 300,
      status,
      json: async () => body,
    })));

  it('reports Anthropic results', async () => {
    respond(200, {display_name: 'Claude Opus 5.5'});
    await expect(checkKey('k', 'claude-opus-5-5')).resolves.toMatch(/✓.*Opus 5.5/);
    respond(401);
    await expect(checkKey('k', 'm')).resolves.toMatch(/rejected/);
    respond(404);
    await expect(checkKey('k', 'nope')).resolves.toMatch(/not found|wasn't found/);
  });

  it('reports Marvin results', async () => {
    respond(200);
    await expect(checkToken('t')).resolves.toMatch(/✓/);
    respond(403);
    await expect(checkToken('t')).resolves.toMatch(/rejected/);
  });
});
