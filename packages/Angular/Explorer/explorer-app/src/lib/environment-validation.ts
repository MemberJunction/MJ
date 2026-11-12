import type { MJEnvironmentConfig } from '@memberjunction/ng-bootstrap';
import type { SystemValidationIssue } from '@memberjunction/ng-explorer-core';

/** An environment problem to surface on the validation screen (the service stamps the time). */
export type EnvironmentIssue = Omit<SystemValidationIssue, 'timestamp'>;

/** One field the compiled environment must carry. */
interface RequiredField {
  Key: keyof MJEnvironmentConfig;
  Label: string;
}

const CORE_FIELDS: RequiredField[] = [
  { Key: 'GRAPHQL_URI', Label: 'GraphQL HTTP endpoint URL' },
  { Key: 'GRAPHQL_WS_URI', Label: 'GraphQL WebSocket endpoint URL' },
  { Key: 'MJ_CORE_SCHEMA_NAME', Label: 'MJ Core schema name' },
];

const AUTH_TYPE_FIELD: RequiredField = { Key: 'AUTH_TYPE', Label: 'Authentication provider type (msal or auth0)' };

/**
 * Checks the compiled environment Explorer boots with and returns what is missing. Pure.
 *
 * When the server's authentication-provider catalog resolved a provider (`catalogProviderResolved`),
 * the catalog row supplies the provider type and its settings, so `AUTH_TYPE` and the
 * provider-specific fields are not required; the GraphQL endpoints and core schema still are.
 * Without a catalog provider, the compiled environment must name one, as before.
 *
 * `TENANT_ID` is never required: nothing at runtime reads it (the MSAL driver takes its tenant from
 * the optional `CLIENT_AUTHORITY`).
 *
 * @param env The compiled environment.
 * @param catalogProviderResolved Whether the catalog resolved an active provider for this page load.
 */
export function ValidateExplorerEnvironment(env: MJEnvironmentConfig, catalogProviderResolved: boolean): EnvironmentIssue[] {
  const required = catalogProviderResolved
    ? CORE_FIELDS
    : [CORE_FIELDS[0], CORE_FIELDS[1], AUTH_TYPE_FIELD, CORE_FIELDS[2]];
  const issues: EnvironmentIssue[] = required.filter((field) => !env[field.Key]).map((field) => missingField(field));

  if (catalogProviderResolved) {
    return issues;
  }
  const authType = env.AUTH_TYPE?.toLowerCase();
  if (authType === 'msal') {
    issues.push(...msalIssues(env));
  } else if (authType === 'auth0') {
    issues.push(...auth0Issues(env));
  }
  return issues;
}

function missingField(field: RequiredField): EnvironmentIssue {
  const key = String(field.Key);
  return {
    id: `env-missing-${key}`,
    message: `Missing required environment variable: ${key}`,
    severity: 'error',
    details: `The "${key}" property is empty or missing in your environment configuration file.`,
    help: `Add ${key} (${field.Label}) to your environment.ts file. Example files are in src/environments/.`,
  };
}

function msalIssues(env: MJEnvironmentConfig): EnvironmentIssue[] {
  if (env.CLIENT_ID) {
    return [];
  }
  return [{
    id: 'env-missing-CLIENT_ID',
    message: 'Missing required environment variable: CLIENT_ID',
    severity: 'error',
    details: 'MSAL authentication requires CLIENT_ID (Azure AD/Entra Application Client ID).',
    help: 'Add your Azure AD Application (client) ID to the environment file.',
  }];
}

function auth0Issues(env: MJEnvironmentConfig): EnvironmentIssue[] {
  const issues: EnvironmentIssue[] = [];
  if (!env.AUTH0_DOMAIN) {
    issues.push({
      id: 'env-missing-AUTH0_DOMAIN',
      message: 'Missing required environment variable: AUTH0_DOMAIN',
      severity: 'error',
      details: 'Auth0 authentication requires AUTH0_DOMAIN.',
      help: 'Add your Auth0 domain (e.g. myapp.us.auth0.com) to the environment file.',
    });
  }
  if (!env.AUTH0_CLIENTID) {
    issues.push({
      id: 'env-missing-AUTH0_CLIENTID',
      message: 'Missing required environment variable: AUTH0_CLIENTID',
      severity: 'error',
      details: 'Auth0 authentication requires AUTH0_CLIENTID.',
      help: 'Add your Auth0 Client ID to the environment file.',
    });
  }
  return issues;
}
