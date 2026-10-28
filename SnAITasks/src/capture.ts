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

export type NoteInfo = { notePath: string; currentPage: number; totalPages: number };

/** Saves pending strokes and returns the open note's path, current page, and page count. */
export async function getNoteInfo(): Promise<NoteInfo> {
  // Flush unsaved strokes so rendered pages match the screen.
  log(`saveCurrentNote -> ${brief(await PluginNoteAPI.saveCurrentNote())}`);
  const notePath = unwrap<string>(
    await PluginCommAPI.getCurrentFilePath(),
    'getCurrentFilePath',
  );
  const currentPage = unwrap<number>(
    await PluginCommAPI.getCurrentPageNum(),
    'getCurrentPageNum',
  );
  const totalPages = unwrap<number>(
    await PluginFileAPI.getNoteTotalPageNum(notePath),
    'getNoteTotalPageNum',
  );
  return { notePath, currentPage, totalPages };
}

/** Renders one page (0-based) of a note to a base64 PNG. */
export async function capturePage(notePath: string, page: number): Promise<string> {
  const pngPath = `${await workDir()}/page-${page}-${Date.now()}.png`;
  unwrap<boolean>(
    await PluginFileAPI.generateNotePng({
      notePath,
      page,
      times: 1,
      pngPath,
      type: 1, // white background
    }),
    `generateNotePng(page ${page + 1})`,
  );
  return readAndDelete(pngPath);
}

/**
 * Heading style used to mark items for Marvin. sn-plugin-lib numbers title
 * styles 1 black, 2 light gray, 3 dark gray, 4 "shadow"; on the device the
 * 4th style is drawn with diagonal lines.
 */
export const MARKED_TITLE_STYLE = 4;

export type MarkedHeadings = {
  /** Handwriting-recognized text of each marked heading. */
  items: { page: number; text: string }[];
  /** Pages with a marked heading whose text couldn't be recognized on the device. */
  unrecognizedPages: number[];
};

type Title = { page: number; style: number; controlTrailNums?: number[] };
type PageElement = { uuid?: string; type: number; numInPage: number };

/** Finds headings in the marked style and recognizes their handwriting on the device. */
export async function getMarkedHeadings(
  notePath: string,
  totalPages: number,
): Promise<MarkedHeadings> {
  const pages = Array.from({ length: totalPages }, (_, i) => i);
  const titles = unwrap<Title[]>(await PluginFileAPI.getTitles(notePath, pages), 'getTitles');
  const styles = titles.reduce<Record<number, number>>((acc, t) => {
    acc[t.style] = (acc[t.style] ?? 0) + 1;
    return acc;
  }, {});
  log(`headings by style: ${brief(styles)} (marked style = ${MARKED_TITLE_STYLE})`);

  const marked = titles.filter(t => t.style === MARKED_TITLE_STYLE);
  const result: MarkedHeadings = { items: [], unrecognizedPages: [] };
  const byPage = new Map<number, Title[]>();
  marked.forEach(t => byPage.set(t.page, [...(byPage.get(t.page) ?? []), t]));

  for (const [page, pageTitles] of byPage) {
    let elements: PageElement[] = [];
    try {
      const size = unwrap<{ width: number; height: number }>(
        await PluginFileAPI.getPageSize(notePath, page),
        `getPageSize(page ${page + 1})`,
      );
      elements = unwrap<PageElement[]>(
        await PluginFileAPI.getElements(page, notePath),
        `getElements(page ${page + 1})`,
      );
      for (const title of pageTitles) {
        const nums = new Set(title.controlTrailNums ?? []);
        const strokes = elements.filter(e => e.type === 0 && nums.has(e.numInPage));
        const text = strokes.length
          ? (unwrap<string>(
              await PluginCommAPI.recognizeElements(strokes, size),
              `recognizeElements(page ${page + 1})`,
            ) ?? '').trim()
          : '';
        if (text) {
          result.items.push({ page, text });
        } else if (!result.unrecognizedPages.includes(page)) {
          result.unrecognizedPages.push(page);
        }
      }
    } catch (e) {
      log(`heading recognition failed on page ${page + 1}: ${e instanceof Error ? e.message : String(e)}`);
      if (!result.unrecognizedPages.includes(page)) {
        result.unrecognizedPages.push(page);
      }
    } finally {
      elements.forEach(e => e.uuid && PluginCommAPI.recycleElement(e.uuid));
    }
  }
  log(`marked headings: ${result.items.length} recognized, pages needing images: ${brief(result.unrecognizedPages.map(p => p + 1))}`);
  return result;
}

/**
 * The tablet's own reading of the lasso selection (handwriting recognition
 * plus any typed text boxes). Best effort: '' if anything fails. Must run
 * while the lasso is active.
 */
export async function recognizeLasso(): Promise<string> {
  let elements: Array<PageElement & { textBox?: { textContentFull?: string } }> = [];
  try {
    elements = unwrap(await PluginCommAPI.getLassoElements(), 'getLassoElements');
    const typed = elements
      .map(e => e.textBox?.textContentFull?.trim() ?? '')
      .filter(Boolean);
    const strokes = elements.filter(e => e.type === 0);
    let handwritten = '';
    if (strokes.length) {
      const notePath = unwrap<string>(await PluginCommAPI.getCurrentFilePath(), 'getCurrentFilePath');
      const page = unwrap<number>(await PluginCommAPI.getCurrentPageNum(), 'getCurrentPageNum');
      const size = unwrap<{ width: number; height: number }>(
        await PluginFileAPI.getPageSize(notePath, page),
        'getPageSize',
      );
      handwritten = (
        unwrap<string>(await PluginCommAPI.recognizeElements(strokes, size), 'recognizeElements(lasso)') ?? ''
      ).trim();
    }
    return [handwritten, ...typed].filter(Boolean).join('\n');
  } catch (e) {
    log(`lasso recognition failed: ${e instanceof Error ? e.message : String(e)}`);
    return '';
  } finally {
    elements.forEach(e => e.uuid && PluginCommAPI.recycleElement(e.uuid));
  }
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
