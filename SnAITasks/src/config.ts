/**
 * Plugin settings: entered on the in-plugin Settings screen and saved with
 * store.ts. As an alternative to typing keys on the device, a key file (any
 * .json file in MyStyle or a subfolder, see KEY_FILE_TEMPLATE) is used when
 * nothing is saved, and can be imported into Settings.
 */
import { FileUtils, PluginManager } from 'sn-plugin-lib';
import { brief, log, mask } from './log';
import { readStored, writeStored } from './store';

export const MYSTYLE_DIR = '/storage/emulated/0/MyStyle';

export type AiProviderId = 'anthropic' | 'openai';
export type TaskAppId = 'marvin' | 'todoist';

/**
 * Keys for every provider/app are kept, so switching back and forth in
 * Settings doesn't lose them. Saved as JSON; see normalize() for older shapes.
 */
export type Config = {
  aiProvider: AiProviderId;
  anthropicApiKey: string;
  anthropicModel: string;
  openaiApiKey: string;
  openaiModel: string;
  taskApp: TaskAppId;
  marvinApiToken: string;
  /** Marvin autocomplete text added to titles, e.g. "+today". */
  titleSuffix: string;
  todoistApiToken: string;
  /** Todoist due date for tasks with none written, e.g. "today"; "" for none. */
  todoistDefaultDue: string;
};

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
export const DEFAULT_OPENAI_MODEL = 'gpt-6-astra';
export const DEFAULT_TITLE_SUFFIX = '+today';
export const DEFAULT_TODOIST_DUE = 'today';

/** Shown on the Settings screen so users can create the key file on a phone or computer. */
export const KEY_FILE_TEMPLATE = `{
  "aiProvider": "anthropic",
  "anthropicApiKey": "PASTE_ANTHROPIC_KEY",
  "openaiApiKey": "",
  "taskApp": "marvin",
  "marvinApiToken": "PASTE_MARVIN_TOKEN",
  "titleSuffix": "${DEFAULT_TITLE_SUFFIX}",
  "todoistApiToken": ""
}`;
const KEY_FILE_FIELDS = /anthropicApiKey|openaiApiKey|marvinApiToken|todoistApiToken/;

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

/** Settings as saved by v0.1-v0.5 (Claude + Marvin only). */
type LegacyConfig = { model?: string };

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Fills defaults and upgrades older saved settings/key files (single `model` field). */
export function normalize(json: Partial<Config> & LegacyConfig): Config {
  const aiProvider: AiProviderId = json.aiProvider === 'openai' ? 'openai' : 'anthropic';
  const legacyModel = str(json.model);
  return {
    aiProvider,
    anthropicApiKey: str(json.anthropicApiKey),
    anthropicModel:
      str(json.anthropicModel) || (aiProvider === 'anthropic' && legacyModel) || DEFAULT_ANTHROPIC_MODEL,
    openaiApiKey: str(json.openaiApiKey),
    openaiModel:
      str(json.openaiModel) || (aiProvider === 'openai' && legacyModel) || DEFAULT_OPENAI_MODEL,
    taskApp: json.taskApp === 'todoist' ? 'todoist' : 'marvin',
    marvinApiToken: str(json.marvinApiToken),
    titleSuffix: json.titleSuffix === undefined ? DEFAULT_TITLE_SUFFIX : str(json.titleSuffix),
    todoistApiToken: str(json.todoistApiToken),
    todoistDefaultDue:
      json.todoistDefaultDue === undefined ? DEFAULT_TODOIST_DUE : str(json.todoistDefaultDue),
  };
}

/** What's still missing for the selected AI and task app, e.g. ["OpenAI API key"]. */
export function missingKeys(c: Config): string[] {
  const missing: string[] = [];
  if (c.aiProvider === 'anthropic' && !c.anthropicApiKey) {
    missing.push('Anthropic API key');
  }
  if (c.aiProvider === 'openai' && !c.openaiApiKey) {
    missing.push('OpenAI API key');
  }
  if (c.taskApp === 'marvin' && !c.marvinApiToken) {
    missing.push('Marvin API token');
  }
  if (c.taskApp === 'todoist' && !c.todoistApiToken) {
    missing.push('Todoist API token');
  }
  return missing;
}

const isComplete = (c: Config) => missingKeys(c).length === 0;

/** For the diagnostic log; keys masked. */
function describeConfig(c: Config): string {
  const ai =
    c.aiProvider === 'openai'
      ? `openai ${c.openaiModel} key ${mask(c.openaiApiKey)}`
      : `anthropic ${c.anthropicModel} key ${mask(c.anthropicApiKey)}`;
  const app =
    c.taskApp === 'todoist'
      ? `todoist token ${mask(c.todoistApiToken)}, default due "${c.todoistDefaultDue}"`
      : `marvin token ${mask(c.marvinApiToken)}, suffix "${c.titleSuffix}"`;
  return `${ai}; ${app}`;
}

/** Where earlier versions told users to put the key file; always checked first. */
const LEGACY_KEY_FILE = `${MYSTYLE_DIR}/SnMarvin/config.json`;

/**
 * FileUtils.listFiles is typed as string[], but the device returns
 * { path, type } objects (type 0 = folder, 1 = file). Accept both.
 */
function toEntry(raw: unknown, dir: string): { path: string; isDir: boolean | null } | null {
  const path =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object' && typeof (raw as { path?: unknown }).path === 'string'
        ? (raw as { path: string }).path
        : null;
  if (!path) {
    return null;
  }
  const type = typeof raw === 'object' ? (raw as { type?: unknown }).type : undefined;
  return {
    path: path.startsWith('/') ? path : `${dir}/${path}`,
    isDir: type === 0 ? true : type === 1 ? false : null,
  };
}

/** .json files in MyStyle and up to two folder levels down, likeliest names first. */
async function findJsonFiles(): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, depth: number) => {
    let entries: unknown[] = [];
    try {
      entries = ((await FileUtils.listFiles(dir)) as unknown[] | null) ?? [];
    } catch (e) {
      log(`listFiles ${shortPath(dir)} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    for (const raw of entries) {
      const entry = toEntry(raw, dir);
      if (!entry) {
        log(`listFiles: unexpected entry ${brief(raw, 80)}`);
        continue;
      }
      const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
      const isDir = entry.isDir ?? !name.includes('.');
      if (!isDir && /\.json$/i.test(name)) {
        found.push(entry.path);
      } else if (isDir && depth > 0) {
        await walk(entry.path, depth - 1);
      }
    }
  };
  try {
    await walk(MYSTYLE_DIR, 2);
  } catch (e) {
    log(`key file search failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const rank = (p: string) => (/marvin/i.test(p) ? 0 : /config|key/i.test(p) ? 1 : 2);
  const sorted = found.sort((a, b) => rank(a) - rank(b)).slice(0, 25);
  return [LEGACY_KEY_FILE, ...sorted.filter(p => p !== LEGACY_KEY_FILE)];
}

function shortPath(p: string): string {
  return p.replace(/^\/storage\/emulated\/0\//, '');
}

/** Where the key file was last found, for the Settings screen. */
export let keyFilePath: string | null = null;

/**
 * Finds the key file: the first .json in MyStyle (any name, any subfolder up
 * to two levels) that contains an API key or token field. Null if none.
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
    if (!KEY_FILE_FIELDS.test(raw)) {
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
    try {
      config = (await readConfigFile()) ?? config;
    } catch (e) {
      // A malformed key file is worth reporting; any other failure just means "no key file".
      if (e instanceof ConfigError) {
        throw e;
      }
      log(`key file lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  config = config ?? normalize({});

  log(`settings: ${describeConfig(config)}`);
  if (isComplete(config)) {
    cached = config;
  }
  return config;
}

/** Settings for a send; throws SetupNeeded if keys are missing. */
export async function loadConfig(): Promise<Config> {
  const config = await loadSettings();
  if (!isComplete(config)) {
    throw new SetupNeeded(`Add your ${missingKeys(config).join(' and ')} in Settings.`);
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
    throw new ConfigError(`Missing: ${missingKeys(config).join(', ')}.`);
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
  log(`settings saved: ${describeConfig(config)}`);
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
