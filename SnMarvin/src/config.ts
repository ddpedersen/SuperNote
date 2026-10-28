/**
 * Plugin settings: entered on the in-plugin Settings screen and saved with
 * store.ts. A MyStyle/SnMarvin/config.json file (same keys) can be imported
 * as an alternative to typing keys on the device:
 *
 *   {
 *     "anthropicApiKey": "sk-ant-...",
 *     "marvinApiToken": "...",
 *     "model": "claude-opus-5-5",   // optional
 *     "titleSuffix": "+today"       // optional, Marvin autocomplete syntax
 *   }
 */
import { PluginManager } from 'sn-plugin-lib';
import { log, mask } from './log';
import { readStored, writeStored, STORE_DIR } from './store';

export const CONFIG_PATH = `${STORE_DIR}/config.json`;

export type Config = {
  anthropicApiKey: string;
  marvinApiToken: string;
  model: string;
  titleSuffix: string;
};

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const DEFAULT_TITLE_SUFFIX = '+today';

export class ConfigError extends Error {}
/** Thrown when keys are missing, so the UI can open the Settings screen. */
export class SetupNeeded extends ConfigError {}

let cached: Config | null = null;

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

/** Reads MyStyle/SnMarvin/config.json, or null if it doesn't exist. */
export async function readConfigFile(): Promise<Config | null> {
  let raw: string;
  try {
    // fetch() on file:// works in the PluginHost; status is 0, so ignore res.ok.
    const res = await fetch('file://' + CONFIG_PATH);
    raw = await res.text();
    log(`config.json: status ${res.status}, ${raw.length} chars`);
  } catch (e) {
    log(`config.json not readable: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  if (!raw.trim()) {
    return null;
  }
  try {
    return normalize(JSON.parse(raw));
  } catch (e) {
    log(`config.json JSON error: ${e instanceof Error ? e.message : String(e)}`);
    throw new ConfigError('config.json is not valid JSON.');
  }
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
  try {
    const stored = await readStored();
    config = stored ? normalize(JSON.parse(stored)) : null;
  } catch (e) {
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

export async function saveSettings(input: Partial<Config>): Promise<Config> {
  const config = normalize(input);
  if (!isComplete(config)) {
    throw new ConfigError('Both the Anthropic API key and the Marvin token are required.');
  }
  if (!(await ensurePermission('plugin.permission.FILE:WRITE'))) {
    throw new ConfigError('File write access was denied, so settings cannot be saved.');
  }
  await writeStored(JSON.stringify(config));
  cached = config;
  log(`settings saved: anthropic ${mask(config.anthropicApiKey)}, marvin ${mask(config.marvinApiToken)}`);
  return config;
}
