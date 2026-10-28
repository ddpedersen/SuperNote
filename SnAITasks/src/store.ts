/**
 * Persistent settings storage without native code.
 *
 * sn-plugin-lib has no writeFile, so settings are kept as a text box inside
 * a small .note file (createNote + insertElements/replaceElements, read back
 * with getElements), a pattern community plugins have confirmed on-device.
 * The file lives in MyStyle/SnMarvin/ so it survives plugin updates.
 *
 * The note write APIs need an open note, so saving only works when the
 * plugin view was opened from a note.
 *
 * The text is base64-encoded so opening the note doesn't show keys at a
 * glance. That is obfuscation, not encryption.
 */
import { FileUtils, PluginCommAPI, PluginFileAPI } from 'sn-plugin-lib';
import { log, brief } from './log';

export const STORE_DIR = '/storage/emulated/0/MyStyle/SnMarvin';
export const STORE_PATH = `${STORE_DIR}/settings.note`;

const PREFIX = 'snm1:';
const TEXT_TYPE = 500;

type Resp<T> = { success: boolean; result: T; error?: { code?: number; message?: string } };

function check<T>(res: unknown, what: string): T {
  const r = res as Resp<T> | null | undefined;
  if (!r || !r.success) {
    log(`${what} -> ${brief(r)}`);
    const code = r?.error?.code;
    throw new Error(
      code === 102
        ? 'Settings can only be saved with a note open. Open a note, then the plugin.'
        : `${what} failed: ${r?.error?.message ?? 'no response'}`,
    );
  }
  return r.result;
}

/** Base64 for ASCII text (API keys); anything else is stored as-is. */
export function encode(text: string): string {
  return /^[\x20-\x7e]*$/.test(text) ? PREFIX + btoa(text) : text;
}

export function decode(stored: string): string {
  return stored.startsWith(PREFIX) ? atob(stored.slice(PREFIX.length)) : stored;
}

/** Returns the stored text, or null if nothing has been saved yet. */
export async function readStored(): Promise<string | null> {
  if (!(await FileUtils.exists(STORE_PATH))) {
    log('store: no settings.note yet');
    return null;
  }
  const elements = check<Array<{ uuid?: string; type: number; textBox?: { textContentFull?: string } }>>(
    await PluginFileAPI.getElements(0, STORE_PATH),
    'getElements(settings)',
  );
  const text = elements.find(e => e.type === TEXT_TYPE)?.textBox?.textContentFull ?? null;
  elements.forEach(e => e.uuid && PluginCommAPI.recycleElement(e.uuid));
  log(`store: read ${text ? text.length : 0} chars from ${elements.length} element(s)`);
  return text ? decode(text) : null;
}

export async function writeStored(text: string): Promise<void> {
  await FileUtils.makeDir(STORE_DIR);
  const isNew = !(await FileUtils.exists(STORE_PATH));
  if (isNew) {
    const templates = (await PluginCommAPI.getNoteSystemTemplates()) as
      | Array<{ name: string }>
      | { result?: Array<{ name: string }> }
      | null;
    const list = Array.isArray(templates) ? templates : templates?.result ?? [];
    if (!list.length) {
      throw new Error('No note templates available to create settings.note.');
    }
    check<boolean>(
      await PluginFileAPI.createNote({
        notePath: STORE_PATH,
        template: list[0].name,
        mode: 0,
        isPortrait: true,
      }),
      'createNote(settings)',
    );
    log(`store: created settings.note (template "${list[0].name}")`);
  }

  const element = check<Record<string, unknown>>(
    await PluginCommAPI.createElement(TEXT_TYPE),
    'createElement(text)',
  );
  element.pageNum = 0;
  element.layerNum = 0;
  element.textBox = {
    fontSize: 24,
    textContentFull: encode(text),
    textRect: { left: 100, top: 100, right: 1300, bottom: 600 },
    textAlign: 0,
    textBold: 0,
    textItalics: 0,
    textFrameWidthType: 0,
    textFrameStyle: 0,
    textEditable: 0,
  };

  check<unknown>(
    isNew
      ? await PluginFileAPI.insertElements(STORE_PATH, 0, [element])
      : await PluginFileAPI.replaceElements(STORE_PATH, 0, [element]),
    isNew ? 'insertElements(settings)' : 'replaceElements(settings)',
  );
  if (typeof element.uuid === 'string') {
    PluginCommAPI.recycleElement(element.uuid);
  }
  log('store: saved');
}
