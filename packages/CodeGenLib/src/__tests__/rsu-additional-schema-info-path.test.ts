/**
 * The additionalSchemaInfo path must resolve the same way no matter which directory the process
 * starts in (#5858). RSU writes the file and CodeGen reads it; when one resolved a relative path
 * against process.cwd() and the other against a different directory, CodeGen read an empty or
 * missing file, found no soft primary keys and created 0 entities while every step reported success.
 */
import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import {
  ResolveAdditionalSchemaInfoPathFrom,
  ResolveAdditionalSchemaInfoPath,
  ADDITIONAL_SCHEMA_INFO_PATH_ENV,
  configInfo,
} from '../Config/config';

const CONFIG_DIR = path.resolve('/repo/root');
const CONFIG_FILE = path.join(CONFIG_DIR, 'mj.config.cjs');
const OTHER_CWD = path.resolve('/somewhere/else/packages/MJAPI');

describe('ResolveAdditionalSchemaInfoPathFrom', () => {
  it('resolves a relative configured path against the config file directory, not the working directory', () => {
    const resolved = ResolveAdditionalSchemaInfoPathFrom({
      ConfiguredPath: './config/additionalSchemaInfo.json',
      ConfigFilePath: CONFIG_FILE,
      WorkingDirectory: OTHER_CWD,
    });
    expect(resolved).toBe(path.join(CONFIG_DIR, 'config', 'additionalSchemaInfo.json'));
  });

  it('gives the same answer from two different working directories', () => {
    const fromRoot = ResolveAdditionalSchemaInfoPathFrom({
      ConfiguredPath: 'additionalSchemaInfo.json', ConfigFilePath: CONFIG_FILE, WorkingDirectory: CONFIG_DIR,
    });
    const fromPackage = ResolveAdditionalSchemaInfoPathFrom({
      ConfiguredPath: 'additionalSchemaInfo.json', ConfigFilePath: CONFIG_FILE, WorkingDirectory: OTHER_CWD,
    });
    expect(fromPackage).toBe(fromRoot);
  });

  it('keeps an absolute configured path as-is', () => {
    const absolute = path.resolve('/etc/mj/additionalSchemaInfo.json');
    const resolved = ResolveAdditionalSchemaInfoPathFrom({
      ConfiguredPath: absolute, ConfigFilePath: CONFIG_FILE, WorkingDirectory: OTHER_CWD,
    });
    expect(resolved).toBe(absolute);
  });

  it('lets the env override win over the configured path', () => {
    const override = path.resolve('/override/asi.json');
    const resolved = ResolveAdditionalSchemaInfoPathFrom({
      ConfiguredPath: 'additionalSchemaInfo.json', ConfigFilePath: CONFIG_FILE, EnvOverride: override, WorkingDirectory: OTHER_CWD,
    });
    expect(resolved).toBe(override);
  });

  it('resolves a relative env override against the working directory', () => {
    const resolved = ResolveAdditionalSchemaInfoPathFrom({
      EnvOverride: 'rsu/asi.json', WorkingDirectory: OTHER_CWD,
    });
    expect(resolved).toBe(path.join(OTHER_CWD, 'rsu', 'asi.json'));
  });

  it('falls back to the working directory when no config file was found', () => {
    const resolved = ResolveAdditionalSchemaInfoPathFrom({
      ConfiguredPath: 'asi.json', WorkingDirectory: OTHER_CWD,
    });
    expect(resolved).toBe(path.join(OTHER_CWD, 'asi.json'));
  });

  it('returns undefined when neither the config nor the env sets a path', () => {
    expect(ResolveAdditionalSchemaInfoPathFrom({ WorkingDirectory: OTHER_CWD })).toBeUndefined();
    expect(ResolveAdditionalSchemaInfoPathFrom({ ConfiguredPath: '  ', EnvOverride: '', WorkingDirectory: OTHER_CWD })).toBeUndefined();
  });
});

describe('ResolveAdditionalSchemaInfoPath (loaded config)', () => {
  const previousEnv = process.env[ADDITIONAL_SCHEMA_INFO_PATH_ENV];
  const previousConfigured = configInfo.additionalSchemaInfo;

  afterEach(() => {
    if (previousEnv === undefined) delete process.env[ADDITIONAL_SCHEMA_INFO_PATH_ENV];
    else process.env[ADDITIONAL_SCHEMA_INFO_PATH_ENV] = previousEnv;
    configInfo.additionalSchemaInfo = previousConfigured;
  });

  it('reads the env override', () => {
    const override = path.resolve('/override/from-env.json');
    process.env[ADDITIONAL_SCHEMA_INFO_PATH_ENV] = override;
    expect(ResolveAdditionalSchemaInfoPath()).toBe(override);
  });

  it('returns an absolute path for a relative configured value', () => {
    delete process.env[ADDITIONAL_SCHEMA_INFO_PATH_ENV];
    configInfo.additionalSchemaInfo = 'config/additionalSchemaInfo.json';
    const resolved = ResolveAdditionalSchemaInfoPath();
    expect(resolved).toBeDefined();
    expect(path.isAbsolute(resolved!)).toBe(true);
    expect(resolved!.endsWith(path.join('config', 'additionalSchemaInfo.json'))).toBe(true);
  });

  it('returns undefined when not configured', () => {
    delete process.env[ADDITIONAL_SCHEMA_INFO_PATH_ENV];
    configInfo.additionalSchemaInfo = undefined;
    expect(ResolveAdditionalSchemaInfoPath()).toBeUndefined();
  });
});
