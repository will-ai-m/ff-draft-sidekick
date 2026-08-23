import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PARAMETER_DEFAULTS } from '@sidekick/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from './loadConfig';

let dir: string;
const configPath = () => join(dir, 'config.local.json');

const writeConfig = (body: string): void => writeFileSync(configPath(), body, 'utf8');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sidekick-config-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns the parameter defaults when no local override file exists', () => {
    expect(loadConfig({ configPath: configPath() })).toEqual(PARAMETER_DEFAULTS);
  });

  it('applies local overrides on top of the defaults, leaving the rest alone', () => {
    writeConfig(JSON.stringify({ pollIntervalMs: 2000, candidateListDefaultRows: 12 }));

    const config = loadConfig({ configPath: configPath() });

    expect(config.pollIntervalMs).toBe(2000);
    expect(config.candidateListDefaultRows).toBe(12);
    expect(config.apiBudgetPerMin).toBe(PARAMETER_DEFAULTS.apiBudgetPerMin);
  });

  it('ignores "//"-prefixed comment keys, so the shipped example file can be copied verbatim', () => {
    writeConfig(JSON.stringify({ '// pollIntervalMs': 'poll cadence in ms', pollIntervalMs: 1500 }));

    expect(loadConfig({ configPath: configPath() }).pollIntervalMs).toBe(1500);
  });

  it('rejects an unrecognised key instead of silently ignoring a typo', () => {
    writeConfig(JSON.stringify({ pollIntervallMs: 2000 }));

    expect(() => loadConfig({ configPath: configPath() })).toThrow(/pollIntervallMs/);
  });

  it('rejects an override whose type does not match the default', () => {
    writeConfig(JSON.stringify({ pollIntervalMs: 'fast' }));

    expect(() => loadConfig({ configPath: configPath() })).toThrow(/pollIntervalMs/);
  });

  it('fails loudly on malformed JSON rather than falling back to defaults', () => {
    writeConfig('{ not json');

    expect(() => loadConfig({ configPath: configPath() })).toThrow(/config\.local\.json/);
  });

  it('does not mutate the shared defaults', () => {
    writeConfig(JSON.stringify({ pollIntervalMs: 9999 }));
    loadConfig({ configPath: configPath() });

    expect(PARAMETER_DEFAULTS.pollIntervalMs).toBe(1000);
  });
});
