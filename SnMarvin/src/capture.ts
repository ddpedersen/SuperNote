/**
 * Turns what the user picked (whole page or lasso selection) into a base64
 * PNG that can be sent to Claude.
 */
import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import { log, brief } from './log';

type Resp<T> = { success: boolean; result: T; error?: { message?: string } };

function unwrap<T>(res: unknown, what: string): T {
  const r = res as Resp<T> | null | undefined;
  log(`${what} -> ${brief(r)}`);
  if (!r || !r.success) {
    throw new Error(`${what} failed: ${r?.error?.message ?? 'no response'}`);
  }
  return r.result;
}

let cachedDir: string | null = null;

async function workDir(): Promise<string> {
  if (!cachedDir) {
    const base = await PluginManager.getPluginDirPath();
    if (!base) {
      throw new Error('Could not get the plugin directory.');
    }
    cachedDir = `${base}/capture`;
    const made = await FileUtils.makeDir(cachedDir);
    log(`workDir ${cachedDir} (makeDir=${made})`);
  }
  return cachedDir;
}

/** Reads a local file as base64 via fetch(file://) + FileReader. */
async function readBase64(path: string): Promise<string> {
  const res = await fetch('file://' + path);
  const blob = await res.blob();
  log(`read ${path.split('/').pop()}: status ${res.status}, ${blob.size} bytes, ${blob.type || 'no type'}`);
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the captured image.'));
    reader.readAsDataURL(blob);
  });
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  if (!b64) {
    throw new Error('Captured image was empty.');
  }
  return b64;
}

async function readAndDelete(path: string): Promise<string> {
  try {
    return await readBase64(path);
  } finally {
    FileUtils.deleteFile(path).catch(() => {});
  }
}

/** Renders the current NOTE page to PNG. */
export async function capturePage(): Promise<string> {
  // Flush unsaved strokes so the rendered page matches the screen.
  log(`saveCurrentNote -> ${brief(await PluginNoteAPI.saveCurrentNote())}`);

  const notePath = unwrap<string>(
    await PluginCommAPI.getCurrentFilePath(),
    'getCurrentFilePath',
  );
  const page = unwrap<number>(
    await PluginCommAPI.getCurrentPageNum(),
    'getCurrentPageNum',
  );
  const pngPath = `${await workDir()}/page-${Date.now()}.png`;

  unwrap<boolean>(
    await PluginFileAPI.generateNotePng({
      notePath,
      page,
      times: 1,
      pngPath,
      type: 1, // white background
    }),
    'generateNotePng',
  );
  return readAndDelete(pngPath);
}

/** Renders the current lasso selection to PNG. Must run while the lasso is active. */
export async function captureLasso(): Promise<string> {
  const pngPath = `${await workDir()}/lasso-${Date.now()}.png`;
  const preview = unwrap<{ imagePath?: string }>(
    await PluginCommAPI.generateLassoPreview(pngPath),
    'generateLassoPreview',
  );
  return readAndDelete(preview?.imagePath || pngPath);
}
