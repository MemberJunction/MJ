import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  InstallConfigDefaults,
  resolveFromEnvironment,
  loadConfigFile,
  mergeConfigs,
  type PartialInstallConfig,
} from '../models/InstallConfig.js';

/* ================================================================== */
/*  InstallConfigDefaults                                              */
/* ================================================================== */

describe('InstallConfigDefaults', () => {
  it('should set DatabaseHost to "localhost"', () => {
    expect(InstallConfigDefaults.DatabaseHost).toBe('localhost');
  });

  it('should set DatabasePort to 1433', () => {
    expect(InstallConfigDefaults.DatabasePort).toBe(1433);
  });

  it('should set DatabaseTrustCert to false', () => {
    expect(InstallConfigDefaults.DatabaseTrustCert).toBe(false);
  });

  it('should set APIPort to 4000', () => {
    expect(InstallConfigDefaults.APIPort).toBe(4000);
  });

  it('should set ExplorerPort to 4200', () => {
    expect(InstallConfigDefaults.ExplorerPort).toBe(4200);
  });

  it('should set AuthProvider to "none"', () => {
    expect(InstallConfigDefaults.AuthProvider).toBe('none');
  });

  it('should have exactly 6 keys', () => {
    const keys = Object.keys(InstallConfigDefaults);
    expect(keys).toHaveLength(6);
    expect(keys).toEqual(
      expect.arrayContaining([
        'DatabaseHost',
        'DatabasePort',
        'DatabaseTrustCert',
        'APIPort',
        'ExplorerPort',
        'AuthProvider',
      ])
    );
  });
});

/* ================================================================== */
/*  resolveFromEnvironment                                             */
/* ================================================================== */

describe('resolveFromEnvironment', () => {
  const ENV_KEYS = [
    'MJ_INSTALL_DB_HOST',
    'MJ_INSTALL_DB_PORT',
    'MJ_INSTALL_DB_NAME',
    'MJ_INSTALL_DB_TRUST_CERT',
    'MJ_INSTALL_CODEGEN_USER',
    'MJ_INSTALL_CODEGEN_PASSWORD',
    'MJ_INSTALL_API_USER',
    'MJ_INSTALL_API_PASSWORD',
    'MJ_INSTALL_API_PORT',
    'MJ_INSTALL_EXPLORER_PORT',
    'MJ_INSTALL_AUTH_PROVIDER',
    'MJ_INSTALL_OPENAI_KEY',
    'MJ_INSTALL_ANTHROPIC_KEY',
    'MJ_INSTALL_MISTRAL_KEY',
    'MJ_INSTALL_ENTRA_TENANT_ID',
    'MJ_INSTALL_ENTRA_CLIENT_ID',
    'MJ_INSTALL_AUTH0_DOMAIN',
    'MJ_INSTALL_AUTH0_CLIENT_ID',
    'MJ_INSTALL_AUTH0_CLIENT_SECRET',
  ];

  // Save and restore env vars so tests are isolated
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it('should return empty object when no env vars are set', () => {
    const config = resolveFromEnvironment();
    expect(Object.keys(config)).toHaveLength(0);
  });

  it('should resolve string fields from env vars', () => {
    process.env.MJ_INSTALL_DB_HOST = 'prod-sql.example.com';
    process.env.MJ_INSTALL_DB_NAME = 'MyMJ';
    process.env.MJ_INSTALL_CODEGEN_USER = 'MJ_CodeGen';
    process.env.MJ_INSTALL_CODEGEN_PASSWORD = 'secret123';
    process.env.MJ_INSTALL_API_USER = 'MJ_Connect';
    process.env.MJ_INSTALL_API_PASSWORD = 'secret456';

    const config = resolveFromEnvironment();
    expect(config.DatabaseHost).toBe('prod-sql.example.com');
    expect(config.DatabaseName).toBe('MyMJ');
    expect(config.CodeGenUser).toBe('MJ_CodeGen');
    expect(config.CodeGenPassword).toBe('secret123');
    expect(config.APIUser).toBe('MJ_Connect');
    expect(config.APIPassword).toBe('secret456');
  });

  it('should parse numeric fields from env vars', () => {
    process.env.MJ_INSTALL_DB_PORT = '5433';
    process.env.MJ_INSTALL_API_PORT = '8080';
    process.env.MJ_INSTALL_EXPLORER_PORT = '3000';

    const config = resolveFromEnvironment();
    expect(config.DatabasePort).toBe(5433);
    expect(config.APIPort).toBe(8080);
    expect(config.ExplorerPort).toBe(3000);
  });

  it('should parse boolean field (true variants)', () => {
    for (const truthyValue of ['true', 'TRUE', '1', 'yes', 'YES']) {
      process.env.MJ_INSTALL_DB_TRUST_CERT = truthyValue;
      const config = resolveFromEnvironment();
      expect(config.DatabaseTrustCert).toBe(true);
    }
  });

  it('should parse boolean field (false variants)', () => {
    for (const falsyValue of ['false', '0', 'no', 'anything']) {
      process.env.MJ_INSTALL_DB_TRUST_CERT = falsyValue;
      const config = resolveFromEnvironment();
      expect(config.DatabaseTrustCert).toBe(false);
    }
  });

  it('should resolve AuthProvider from env var', () => {
    process.env.MJ_INSTALL_AUTH_PROVIDER = 'entra';
    const config = resolveFromEnvironment();
    expect(config.AuthProvider).toBe('entra');
  });

  it('should resolve AI API keys from env vars', () => {
    process.env.MJ_INSTALL_OPENAI_KEY = 'sk-openai';
    process.env.MJ_INSTALL_ANTHROPIC_KEY = 'sk-ant';
    process.env.MJ_INSTALL_MISTRAL_KEY = 'sk-mistral';

    const config = resolveFromEnvironment();
    expect(config.OpenAIKey).toBe('sk-openai');
    expect(config.AnthropicKey).toBe('sk-ant');
    expect(config.MistralKey).toBe('sk-mistral');
  });

  it('should resolve Entra auth provider values into AuthProviderValues', () => {
    process.env.MJ_INSTALL_ENTRA_TENANT_ID = 'tenant-abc';
    process.env.MJ_INSTALL_ENTRA_CLIENT_ID = 'client-def';

    const config = resolveFromEnvironment();
    expect(config.AuthProviderValues).toEqual({
      TenantID: 'tenant-abc',
      ClientID: 'client-def',
    });
  });

  it('should resolve Auth0 provider values into AuthProviderValues', () => {
    process.env.MJ_INSTALL_AUTH0_DOMAIN = 'myapp.auth0.com';
    process.env.MJ_INSTALL_AUTH0_CLIENT_ID = 'auth0-client';
    process.env.MJ_INSTALL_AUTH0_CLIENT_SECRET = 'auth0-secret';

    const config = resolveFromEnvironment();
    expect(config.AuthProviderValues).toEqual({
      Domain: 'myapp.auth0.com',
      ClientID: 'auth0-client',
      ClientSecret: 'auth0-secret',
    });
  });

  it('should ignore empty string env vars', () => {
    process.env.MJ_INSTALL_DB_HOST = '';
    process.env.MJ_INSTALL_DB_NAME = '';

    const config = resolveFromEnvironment();
    expect(config.DatabaseHost).toBeUndefined();
    expect(config.DatabaseName).toBeUndefined();
  });

  it('should not include AuthProviderValues when no auth env vars are set', () => {
    process.env.MJ_INSTALL_DB_HOST = 'localhost';

    const config = resolveFromEnvironment();
    expect(config.AuthProviderValues).toBeUndefined();
  });

  it('should only include fields that have env vars set', () => {
    process.env.MJ_INSTALL_DB_HOST = 'myhost';

    const config = resolveFromEnvironment();
    expect(config.DatabaseHost).toBe('myhost');
    expect(Object.keys(config)).toEqual(['DatabaseHost']);
  });
});

/* ================================================================== */
/*  loadConfigFile                                                     */
/* ================================================================== */

describe('loadConfigFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should load a valid JSON config file', async () => {
    const filePath = path.join(tempDir, 'config.json');
    await fs.writeFile(filePath, JSON.stringify({
      DatabaseHost: 'prod-sql',
      DatabaseName: 'MyDB',
      APIPort: 8080,
    }));

    const config = await loadConfigFile(filePath);
    expect(config.DatabaseHost).toBe('prod-sql');
    expect(config.DatabaseName).toBe('MyDB');
    expect(config.APIPort).toBe(8080);
  });

  it('should load all known InstallConfig fields', async () => {
    const fullConfig = {
      DatabaseHost: 'host',
      DatabasePort: 1433,
      DatabaseName: 'db',
      DatabaseTrustCert: true,
      CodeGenUser: 'codegen',
      CodeGenPassword: 'pass1',
      APIUser: 'api',
      APIPassword: 'pass2',
      APIPort: 4000,
      ExplorerPort: 4200,
      AuthProvider: 'entra',
      AuthProviderValues: { TenantID: 't', ClientID: 'c' },
      OpenAIKey: 'ok',
      AnthropicKey: 'ak',
      MistralKey: 'mk',
      CreateNewUser: { Username: 'u', Email: 'e', FirstName: 'f', LastName: 'l' },
    };

    const filePath = path.join(tempDir, 'full.json');
    await fs.writeFile(filePath, JSON.stringify(fullConfig));

    const config = await loadConfigFile(filePath);
    expect(config).toEqual(fullConfig);
  });

  it('should ignore unknown keys in the config file', async () => {
    const filePath = path.join(tempDir, 'extra.json');
    await fs.writeFile(filePath, JSON.stringify({
      DatabaseHost: 'host',
      UnknownField: 'should-be-ignored',
      AnotherUnknown: 42,
    }));

    const config = await loadConfigFile(filePath);
    expect(config.DatabaseHost).toBe('host');
    expect(Object.keys(config)).toEqual(['DatabaseHost']);
  });

  it('should throw on invalid JSON', async () => {
    const filePath = path.join(tempDir, 'bad.json');
    await fs.writeFile(filePath, 'not valid json{{{');

    await expect(loadConfigFile(filePath)).rejects.toThrow();
  });

  it('should throw if file contains an array', async () => {
    const filePath = path.join(tempDir, 'array.json');
    await fs.writeFile(filePath, JSON.stringify([1, 2, 3]));

    await expect(loadConfigFile(filePath)).rejects.toThrow('JSON object');
  });

  it('should throw if file contains a primitive', async () => {
    const filePath = path.join(tempDir, 'prim.json');
    await fs.writeFile(filePath, '"just a string"');

    await expect(loadConfigFile(filePath)).rejects.toThrow('JSON object');
  });

  it('should throw if file does not exist', async () => {
    await expect(loadConfigFile(path.join(tempDir, 'missing.json'))).rejects.toThrow();
  });

  it('should handle empty object gracefully', async () => {
    const filePath = path.join(tempDir, 'empty.json');
    await fs.writeFile(filePath, '{}');

    const config = await loadConfigFile(filePath);
    expect(Object.keys(config)).toHaveLength(0);
  });
});

/* ================================================================== */
/*  mergeConfigs                                                       */
/* ================================================================== */

describe('mergeConfigs', () => {
  it('should return empty object with no sources', () => {
    const result = mergeConfigs();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('should return a copy of a single source', () => {
    const source: PartialInstallConfig = { DatabaseHost: 'host', APIPort: 8080 };
    const result = mergeConfigs(source);
    expect(result).toEqual(source);
    expect(result).not.toBe(source); // different object reference
  });

  it('should override earlier sources with later sources', () => {
    const defaults: PartialInstallConfig = { DatabaseHost: 'localhost', APIPort: 4000 };
    const envVars: PartialInstallConfig = { DatabaseHost: 'prod-sql' };

    const result = mergeConfigs(defaults, envVars);
    expect(result.DatabaseHost).toBe('prod-sql'); // overridden
    expect(result.APIPort).toBe(4000); // preserved from defaults
  });

  it('should not override with undefined values', () => {
    const base: PartialInstallConfig = { DatabaseHost: 'host', APIPort: 4000 };
    const overlay: PartialInstallConfig = { DatabaseHost: undefined };

    const result = mergeConfigs(base, overlay);
    expect(result.DatabaseHost).toBe('host'); // not overridden by undefined
  });

  it('should merge three layers in correct priority order', () => {
    const defaults: PartialInstallConfig = {
      DatabaseHost: 'localhost',
      DatabasePort: 1433,
      APIPort: 4000,
    };
    const envVars: PartialInstallConfig = {
      DatabaseHost: 'env-host',
      DatabaseName: 'env-db',
    };
    const cliFlags: PartialInstallConfig = {
      DatabaseHost: 'cli-host',
    };

    const result = mergeConfigs(defaults, envVars, cliFlags);
    expect(result.DatabaseHost).toBe('cli-host');   // CLI wins
    expect(result.DatabaseName).toBe('env-db');      // env layer
    expect(result.DatabasePort).toBe(1433);          // defaults layer
    expect(result.APIPort).toBe(4000);               // defaults layer
  });

  it('should shallow-merge AuthProviderValues', () => {
    const base: PartialInstallConfig = {
      AuthProviderValues: { TenantID: 'tenant-1', ClientID: 'client-1' },
    };
    const overlay: PartialInstallConfig = {
      AuthProviderValues: { ClientID: 'client-2', Domain: 'new-domain' },
    };

    const result = mergeConfigs(base, overlay);
    expect(result.AuthProviderValues).toEqual({
      TenantID: 'tenant-1',   // preserved from base
      ClientID: 'client-2',   // overridden by overlay
      Domain: 'new-domain',   // added from overlay
    });
  });

  it('should handle AuthProviderValues only in base', () => {
    const base: PartialInstallConfig = {
      AuthProviderValues: { TenantID: 'tenant-1' },
    };
    const overlay: PartialInstallConfig = { DatabaseHost: 'host' };

    const result = mergeConfigs(base, overlay);
    expect(result.AuthProviderValues).toEqual({ TenantID: 'tenant-1' });
  });

  it('should handle AuthProviderValues only in overlay', () => {
    const base: PartialInstallConfig = { DatabaseHost: 'host' };
    const overlay: PartialInstallConfig = {
      AuthProviderValues: { Domain: 'auth0.com' },
    };

    const result = mergeConfigs(base, overlay);
    expect(result.AuthProviderValues).toEqual({ Domain: 'auth0.com' });
  });
});
