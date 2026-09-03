import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PARAMETER_DEFAULTS, RANKINGS_FORMATS, isParameterKey, isRankingsFormat } from '@sidekick/shared';
import type { ParameterKey, ParameterValues } from '@sidekick/shared';

/**
 * Merges `config.local.json` over the AS-N defaults in `@sidekick/shared`'s `parameters.ts`.
 *
 * This is the "configurable, not hardcoded" mechanism the constitution requires: overriding a
 * default is a file edit plus a server restart, never a code change. `config.local.json` is
 * gitignored; `config.local.json.example` at the repo root documents every key.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export const DEFAULT_CONFIG_PATH = resolve(REPO_ROOT, 'config.local.json');

export interface LoadConfigOptions {
  /** Override file location. Defaults to `config.local.json` at the repo root. */
  configPath?: string;
}

export type SidekickConfig = Readonly<ParameterValues>;

const typeOf = (value: unknown): string => (Array.isArray(value) ? 'array' : typeof value);

const readOverrides = (configPath: string): Record<string, unknown> => {
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Could not parse ${configPath}: ${(error as Error).message}. ` +
        'Fix the JSON or delete the file to fall back to the built-in defaults.',
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected ${configPath} to contain a JSON object of parameter overrides.`);
  }

  return parsed as Record<string, unknown>;
};

/**
 * Loads the effective configuration.
 *
 * A key the parameter module doesn't recognise, or a value whose type doesn't match its
 * default, is a hard error rather than a silent no-op — a typo in a config file must not
 * quietly leave the app running on a default the user thought they had changed.
 * Keys beginning with `//` are treated as comments so the shipped example file, which
 * annotates every key that way, can be copied verbatim.
 */
export function loadConfig(options: LoadConfigOptions = {}): SidekickConfig {
  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
  const overrides = readOverrides(configPath);

  const merged: ParameterValues = { ...PARAMETER_DEFAULTS };
  const unknownKeys: string[] = [];

  for (const [key, value] of Object.entries(overrides)) {
    if (key.startsWith('//') || key === '$schema') continue;

    if (!isParameterKey(key)) {
      unknownKeys.push(key);
      continue;
    }

    const expected = typeOf(PARAMETER_DEFAULTS[key as ParameterKey]);
    if (typeOf(value) !== expected) {
      throw new Error(
        `Invalid override for "${key}" in ${configPath}: expected ${expected}, got ${typeOf(value)}.`,
      );
    }

    Object.assign(merged, { [key]: value });
  }

  if (unknownKeys.length > 0) {
    throw new Error(
      `Unrecognised parameter key(s) in ${configPath}: ${unknownKeys.join(', ')}. ` +
        'See config.local.json.example for every supported key.',
    );
  }

  // A string-typed key with a closed vocabulary: the type check above passes any string, and a
  // misspelt format must not reach an attach as a URL lookup that finds nothing.
  if (!isRankingsFormat(merged.defaultRankingsFormat)) {
    throw new Error(
      `Invalid override for "defaultRankingsFormat" in ${configPath}: expected one of ` +
        `${RANKINGS_FORMATS.map((format) => `"${format}"`).join(', ')}, got "${String(merged.defaultRankingsFormat)}".`,
    );
  }

  return Object.freeze(merged);
}
