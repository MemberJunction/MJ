import { describe, it, expect } from 'vitest';
import type { MJEnvironmentConfig } from '@memberjunction/ng-bootstrap';
import { ValidateExplorerEnvironment } from '../lib/environment-validation';

/** The fields every deployment needs, with placeholder values. */
const CORE = {
  GRAPHQL_URI: 'https://api.example.test/',
  GRAPHQL_WS_URI: 'wss://api.example.test/',
  MJ_CORE_SCHEMA_NAME: '__mj',
};

function env(fields: Record<string, string>): MJEnvironmentConfig {
  return { ...fields } as MJEnvironmentConfig;
}

const ids = (e: MJEnvironmentConfig, catalog: boolean): string[] => ValidateExplorerEnvironment(e, catalog).map((i) => i.id);

describe('ValidateExplorerEnvironment (#3836)', () => {
  it('passes a catalog-only deployment: provider resolved, compiled auth blank', () => {
    expect(ids(env({ ...CORE }), true)).toEqual([]);
  });

  it('still requires the GraphQL endpoints and core schema when the catalog resolved a provider', () => {
    expect(ids(env({ GRAPHQL_URI: CORE.GRAPHQL_URI }), true)).toEqual(['env-missing-GRAPHQL_WS_URI', 'env-missing-MJ_CORE_SCHEMA_NAME']);
  });

  it('ignores compiled provider fields when the catalog resolved a provider', () => {
    expect(ids(env({ ...CORE, AUTH_TYPE: 'msal' }), true)).toEqual([]);
  });

  it('keeps today\'s errors for compiled auth with no catalog provider', () => {
    expect(ids(env({ ...CORE, AUTH_TYPE: 'auth0' }), false)).toEqual(['env-missing-AUTH0_DOMAIN', 'env-missing-AUTH0_CLIENTID']);
    expect(ids(env({ ...CORE, AUTH_TYPE: 'msal' }), false)).toEqual(['env-missing-CLIENT_ID']);
  });

  it('fails with the AUTH_TYPE error when there is neither a catalog provider nor compiled auth', () => {
    const issues = ValidateExplorerEnvironment(env({ ...CORE }), false);
    expect(issues.map((i) => i.id)).toEqual(['env-missing-AUTH_TYPE']);
    expect(issues[0].message).toBe('Missing required environment variable: AUTH_TYPE');
  });

  it('accepts MSAL without TENANT_ID', () => {
    expect(ids(env({ ...CORE, AUTH_TYPE: 'msal', CLIENT_ID: '00000000-0000-0000-0000-000000000000' }), false)).toEqual([]);
  });
});
