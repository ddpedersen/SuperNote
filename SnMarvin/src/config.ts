/**
 * Plugin settings: entered on the in-plugin Settings screen and saved with
 * store.ts. As an alternative to typing keys on the device, a key file (any
 * .json file in MyStyle or a subfolder, see KEY_FILE_TEMPLATE) is used when
 * nothing is saved, and can be imported into Settings.
 */
import { FileUtils, PluginManager } from 'sn-plugin-lib';
import { log, mask } from './log';
import { readStored, writeStored } from './store';

export const MYSTYLE_DIR = '/storage/emulated/0/MyStyle';

export type Config = {
  anthropicApiKey: string;
  marvinApiToken: string;
  model: string;
  titleSuffix: string;
};

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const DEFAULT_TITLE_SUFFIX = '+today';

/** Shown on the Settings screen so users can create the key file on a phone or computer. */
export const KEY_FILE_TEMPLATE = `{
  "anthropicApiKey": "PASTE_ANTHROPIC_KEY",
  "marvinApiToken": "PASTE_MARVIN_TOKEN",
  "model": "${DEFAULT_MODEL}",
  "titleSuffix": "${DEFAULT_TITLE_SUFFIX}"
}`;

export class ConfigError extends Error {}
/** Thrown when keys are missing, so the UI can open the Settings screen. */
export class SetupNeeded extends ConfigError {}

let cached: Config | null = null;
/** Keys entered where no note is open (plugin-list gear); written on the next note use. */
let pendingSave: Config | null = null;
/** True when settings.note exists but couldn't be read (e.g. no note open). */
let storeUnreadable = false;

export const hasPendingSave = () => pendingSave !== null;
export const isStoreUnreadable = () => storeUnreadable;

/** Asks for a runtime permission; true if granted (once or always). */
export async function ensurePermission(permission: string): Promise<boolean> {
  const name = permission.replace('plugin.permission.', '');
  const has = await PluginManager.hasPermission(permission);
  if (has === 1) {
    log(`permission ${name}: already granted`);
    return true;
  }
  const choice = await PluginManager.requestPermission(permission);
  log(`permission ${name}: had=${has}, user chose ${choice} (0 deny, 1 once, 2 always, -1 cancel)`);
  return choice === 1 || choice === 2;
}

function normalize(json: Partial<Config>): Config {
  return {
    anthropicApiKey: (json.anthropicApiKey ?? '').trim(),
    marvinApiToken: (json.marvinApiToken ?? '').trim(),
    model: (json.model ?? '').trim() || DEFAULT_MODEL,
    titleSuffix: (json.titleSuffix ?? DEFAULT_TITLE_SUFFIX).trim(),
  };
}

const isComplete = (c: Config) => !!c.anthropicApiKey && !!c.marvinApiToken;

/** .json files in MyStyle and up to two folder levels down, likeliest names first. */
async function findJsonFiles(): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, depth: number) => {
    let entries: string[] = [];
    try {
      entries = (await FileUtils.listFiles(dir)) ?? [];
    } catch (e) {
      log(`listFiles ${dir} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    for (const entry of entries) {
      const path = entry.startsWith('/') ? entry : `${dir}/${entry}`;
      const name = path.slice(path.lastIndexOf('/') + 1);
      if (/\.json$/i.test(name)) {
        found.push(path);
      } else if (depth > 0 && !name.includes('.')) {
        await walk(path, depth - 1);
      }
    }
  };
  await walk(MYSTYLE_DIR, 2);
  const rank = (p: string) => (/marvin/i.test(p) ? 0 : /config|key/i.test(p) ? 1 : 2);
  return found.sort((a, b) => rank(a) - rank(b)).slice(0, 25);
}

const shortPath = (p: string) => p.replace(/^\/storage\/emulated\/0\//, '');

/** Where the key file was last found, for the Settings screen. */
export let keyFilePath: string | null = null;

/**
 * Finds the key file: the first .json in MyStyle (any name, any subfolder up
 * to two levels) that contains anthropicApiKey or marvinApiToken. Null if none.
 */
export async function readConfigFile(): Promise<Config | null> {
  const files = await findJsonFiles();
  log(`key file candidates: ${files.length ? files.map(shortPath).join(', ') : 'none'}`);
  for (const path of files) {
    let raw: string;
    try {
      // fetch() on file:// works in the PluginHost; status is 0, so ignore res.ok.
      raw = await (await fetch('file://' + path)).text();
    } catch (e) {
      log(`${shortPath(path)} not readable: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (!/anthropicApiKey|marvinApiToken/.test(raw)) {
      continue;
    }
    let json: Partial<Config>;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      log(`${shortPath(path)} JSON error: ${e instanceof Error ? e.message : String(e)}`);
      throw new ConfigError(
        /[\u201c\u201d\u2018\u2019]/.test(raw)
          ? `${shortPath(path)} has curly quotes (“ ”), usually from a phone keyboard. Replace them with straight quotes (").`
          : `${shortPath(path)} has a formatting error. Compare it with the format shown in Settings.`,
      );
    }
    keyFilePath = shortPath(path);
    log(`key file: ${keyFilePath}`);
    return normalize(json);
  }
  return null;
}

/** Saved settings, falling back to config.json; never throws for "not set up yet". */
export async function loadSettings(): Promise<Config> {
  if (cached) {
    return cached;
  }
  if (!(await ensurePermission('plugin.permission.FILE:READ'))) {
    throw new ConfigError('File access was denied, so settings cannot be read.');
  }

  let config: Config | null = null;
  storeUnreadable = false;
  try {
    const stored = await readStored();
    config = stored ? normalize(JSON.parse(stored)) : null;
  } catch (e) {
    storeUnreadable = true;
    log(`settings read failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!config || !isComplete(config)) {
    config = (await readConfigFile()) ?? config;
  }
  config = config ?? normalize({});

  log(`settings: anthropic ${mask(config.anthropicApiKey)}, marvin ${mask(config.marvinApiToken)}, model ${config.model}`);
  if (isComplete(config)) {
    cached = config;
  }
  return config;
}

/** Settings for a send; throws SetupNeeded if keys are missing. */
export async function loadConfig(): Promise<Config> {
  const config = await loadSettings();
  if (!isComplete(config)) {
    throw new SetupNeeded('Add your Anthropic API key and Marvin token in Settings.');
  }
  return config;
}

/**
 * Saves settings. With `deferIfNoNote` (opened from the plugin-list gear,
 * where the note APIs don't work), a failed write keeps the settings in
 * memory and returns 'deferred'; flushPendingSave() writes them later.
 */
export async function saveSettings(
  input: Partial<Config>,
  deferIfNoNote = false,
): Promise<'saved' | 'deferred'> {
  const config = normalize(input);
  if (!isComplete(config)) {
    throw new ConfigError('Both the Anthropic API key and the Marvin token are required.');
  }
  if (!(await ensurePermission('plugin.permission.FILE:WRITE'))) {
    throw new ConfigError('File write access was denied, so settings cannot be saved.');
  }
  try {
    await writeStored(JSON.stringify(config));
  } catch (e) {
    if (!deferIfNoNote) {
      throw e;
    }
    log(`settings write deferred: ${e instanceof Error ? e.message : String(e)}`);
    cached = config;
    pendingSave = config;
    return 'deferred';
  }
  cached = config;
  pendingSave = null;
  log(`settings saved: anthropic ${mask(config.anthropicApiKey)}, marvin ${mask(config.marvinApiToken)}`);
  return 'saved';
}

/** Writes settings entered from the gear, now that a note is open. Never throws. */
export async function flushPendingSave(trigger: string): Promise<void> {
  const config = pendingSave;
  if (!config) {
    return;
  }
  try {
    await writeStored(JSON.stringify(config));
    if (pendingSave === config) {
      pendingSave = null;
    }
    log(`settings saved (deferred, on ${trigger})`);
  } catch (e) {
    log(`deferred save still pending (${trigger}): ${e instanceof Error ? e.message : String(e)}`);
  }
}
