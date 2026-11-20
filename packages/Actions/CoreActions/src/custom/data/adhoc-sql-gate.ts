import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { ActionEngineServer } from '@memberjunction/actions';
import type { UserInfo } from '@memberjunction/core';
import { SQLExpressionValidator } from '@memberjunction/global';

import { AgentDataPolicyGuard } from '../crud/agent-data-policy-guard';

/** The read-only provider caller SQL runs on. */
export type AdhocSQLProvider = NonNullable<Awaited<ReturnType<ActionEngineServer['GetReadOnlyProvider']>>>;

/** SQL that passed every check, and how to run it. */
export interface AdhocSQLRun {
  /** The SQL as it will run (literal escape sequences normalized). */
  SQL: string;
  Provider: AdhocSQLProvider;
  TimeoutSeconds: number;
  /** Column patterns the calling agent's data policy masks in results. */
  DeniedFieldPatterns: string[];
}

/**
 * The checks every action that runs caller-written SQL applies before running it, the same as the
 * ExecuteAdhocQuery resolver's:
 * - a scope-limited session (magic-link or widget guest, resource-scoped link) is refused, since raw
 *   SQL never applies the row-level filters that confine it;
 * - a host ad-hoc SQL authorizer and a read-only database login must be configured;
 * - the dangerous-keyword screen ({@link SQLExpressionValidator}) must accept the SQL;
 * - the host's authorizer must accept it: one read statement, reading only entity views the caller
 *   may read in full;
 * - the calling agent's data policy, if any, must allow it.
 *
 * Run the SQL that comes back with `Provider.RunQuery({ SQL, TimeoutSeconds, ... }, contextUser)`.
 * `actionName` names the calling action in refusals.
 */
export async function CheckAdhocSQL(
  params: RunActionParams,
  actionName: string,
  rawSQL: string,
  requestedTimeoutSeconds?: number,
): Promise<{ Allowed: AdhocSQLRun } | { Blocked: ActionResultSimple }> {
  if (isScopeLimitedPrincipal(params.ContextUser)) {
    return { Blocked: permissionDenied(`${actionName} is not permitted for scope-limited sessions.`) };
  }
  const authorizer = ActionEngineServer.Instance.AdhocSQLAuthorizer;
  if (!authorizer) {
    return { Blocked: permissionDenied('Ad-hoc query execution is not configured on this server: no ad-hoc SQL authorizer is registered.') };
  }
  const provider = await ActionEngineServer.Instance.GetReadOnlyProvider();
  if (!provider) {
    return { Blocked: permissionDenied('No read-only data source is available for ad-hoc query execution: the read-only database login is not configured on this server.') };
  }

  const sql = NormalizeSQLWhitespace(rawSQL);
  const screen = SQLExpressionValidator.Instance.validateFullQuery(sql);
  if (!screen.valid) {
    return { Blocked: { Success: false, ResultCode: 'DANGEROUS_QUERY', Message: screen.error || 'SQL validation failed' } };
  }
  const refusal = authorizer.Authorize(sql, provider, params.ContextUser);
  if (refusal) return { Blocked: authorizationRefusal(refusal) };

  const policy = await AgentDataPolicyGuard.EvaluateAdhocQuery(params, sql, provider);
  if ('Blocked' in policy) return { Blocked: policy.Blocked };

  const timeout = authorizer.ClampTimeoutSeconds(requestedTimeoutSeconds && requestedTimeoutSeconds > 0 ? requestedTimeoutSeconds : undefined);
  return { Allowed: { SQL: sql, Provider: provider, TimeoutSeconds: timeout, DeniedFieldPatterns: policy.Allowed.DeniedFieldPatterns } };
}

/** Maps a failed run of caller SQL to a result code. */
export function AdhocQueryFailure(errorMessage: string, timeoutSeconds: number): ActionResultSimple {
  if (/time(d)?\s?out/i.test(errorMessage)) {
    return {
      Success: false,
      ResultCode: 'QUERY_TIMEOUT',
      Message: `Query execution exceeded ${timeoutSeconds} second timeout. Consider optimizing query or increasing timeout parameter.`,
    };
  }
  const statementCode = statementRefusalCode(errorMessage);
  if (statementCode) return { Success: false, ResultCode: statementCode, Message: errorMessage };
  if (/permission|denied/i.test(errorMessage)) {
    return { Success: false, ResultCode: 'PERMISSION_DENIED', Message: `Insufficient permissions to execute query: ${errorMessage}` };
  }
  return { Success: false, ResultCode: 'DATABASE_ERROR', Message: `Database error occurred: ${errorMessage}` };
}

/**
 * Turns literal escape sequences into real whitespace. Agent-generated SQL sometimes arrives with a
 * literal \n (backslash + n) instead of a newline, from double-escaped JSON.
 */
export function NormalizeSQLWhitespace(sql: string): string {
  return sql
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

/**
 * True when the session's read authority is narrower than its roles: an anonymous magic-link or
 * widget guest, or a session pinned to one shared resource. The same test as MJServer's
 * `IsScopeLimitedPrincipal`; a missing user fails closed.
 */
function isScopeLimitedPrincipal(user: UserInfo | undefined): boolean {
  if (!user) return true;
  if (user.IsMagicLinkAnonymous) return true;
  const scope = user.MagicLinkScope;
  return !!(scope?.ResourceID || scope?.ResourceType);
}

function permissionDenied(message: string): ActionResultSimple {
  return { Success: false, ResultCode: 'PERMISSION_DENIED', Message: message };
}

/** Maps the host's refusal of the SQL to a result code. */
function authorizationRefusal(message: string): ActionResultSimple {
  const statementCode = statementRefusalCode(message);
  return statementCode
    ? { Success: false, ResultCode: statementCode, Message: message }
    : { Success: false, ResultCode: 'PERMISSION_DENIED', Message: `Not permitted to run this query: ${message}` };
}

/** The result code for SQL refused for its shape or for a function it calls; null for any other refusal. */
function statementRefusalCode(message: string): 'NOT_SELECT_STATEMENT' | 'DANGEROUS_QUERY' | null {
  if (/single read query|read-only statement|write statement|write\/DDL|multiple statements/i.test(message)) {
    return 'NOT_SELECT_STATEMENT';
  }
  return /may not call/i.test(message) ? 'DANGEROUS_QUERY' : null;
}
