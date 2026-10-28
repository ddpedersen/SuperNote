/**
 * Plugin configuration, read from a JSON file the user copies onto the
 * device over USB (typing API keys on the e-ink keyboard is painful).
 *
 *   MyStyle/SnMarvin/config.json
 *   {
 *     "anthropicApiKey": "sk-ant-...",
 *     "marvinApiToken": "...",
 *     "model": "claude-opus-5-5",   // optional
 *     "titleSuffix": "+today"       // optional, Marvin autocomplete syntax
 *   }
 */
import { PluginManager } from 'sn-plugin-lib';

export const CONFIG_PATH = '/storage/emulated/0/MyStyle/SnMarvin/config.json';

export type Config = {
  anthropicApiKey: string;
  marvinApiToken: string;
  model: string;
  titleSuffix: string;
};

const DEFAULT_MODEL = 'claude-opus-5-5';
const DEFAULT_TITLE_SUFFIX = '+today';

export class ConfigError extends Error {}

/** Asks for a runtime permission; true if granted (once or always). */
export async function ensurePermission(permission: string): Promise<boolean> {
  if ((await PluginManager.hasPermission(permission)) === 1) {
    return true;
  }
  const choice = await PluginManager.requestPermission(permission);
  return choice === 1 || choice === 2;
}

export async function loadConfig(): Promise<Config> {
  if (!(await ensurePermission('plugin.permission.FILE:READ'))) {
    throw new ConfigError('File access was denied, so config.json cannot be read.');
  }

  let raw: string;
  try {
    // fetch() on file:// works in the PluginHost; status is 0, so ignore res.ok.
    const res = await fetch('file://' + CONFIG_PATH);
    raw = await res.text();
  } catch {
    throw new ConfigError(`Missing ${CONFIG_PATH}`);
  }

  let json: Partial<Config>;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ConfigError('config.json is not valid JSON.');
  }

  const anthropicApiKey = (json.anthropicApiKey ?? '').trim();
  const marvinApiToken = (json.marvinApiToken ?? '').trim();
  if (!anthropicApiKey || !marvinApiToken) {
    throw new ConfigError('config.json needs anthropicApiKey and marvinApiToken.');
  }

  return {
    anthropicApiKey,
    marvinApiToken,
    model: (json.model ?? '').trim() || DEFAULT_MODEL,
    titleSuffix: (json.titleSuffix ?? DEFAULT_TITLE_SUFFIX).trim(),
  };
}
