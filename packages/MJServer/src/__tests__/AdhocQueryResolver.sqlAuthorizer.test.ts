// type-graphql decorators call `Reflect.getMetadata`, which only exists once this polyfill is
// loaded. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

/**
 * MJServer registers an ad-hoc SQL authorizer with the action engine so that Run Ad-hoc Query, which
 * agents run as the calling user, applies the same checks as the ExecuteAdhocQuery resolver: the
 * rendered SQL must be one read statement, every table it reads must be an entity base view the
 * caller may read in full (no row-level filter, no denied field), and the timeout is limited by the
 * server's request timeout.
 *
 * Every SQL statement below is harmless.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('type-graphql', () => {
  const noopDecorator = () => () => undefined;
  return {
    Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
    ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
    Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
    Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
    createUnionType: () => class {},
    AuthorizationError: class AuthorizationError extends Error {},
    Float: class {}, Int: class {}, ID: class {},
  };
});

// The server config is read from mj.config at import; the authorizer takes its timeout as an argument.
vi.mock('../config.js', () => ({ configInfo: { databaseSettings: { requestTimeout: 120_000 } } }));

import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { CreateAdhocSQLAuthorizer } from '../resolvers/AdhocQueryResolver.js';
import { ClampAdhocTimeoutSeconds } from '../resolvers/adhocTimeout.js';

type EntityShape = { Name: string; SchemaName: string; BaseView: string; rowFilter?: string };

/** A read-only provider with the entity metadata the table check reads. */
function readOnlyProvider(entities: EntityShape[]): DatabaseProviderBase {
  return {
    PlatformKey: 'sqlserver',
    Entities: entities.map((e) => ({
      Name: e.Name,
      SchemaName: e.SchemaName,
      BaseView: e.BaseView,
      GetUserPermisions: () => ({ CanRead: true }),
      GetEffectiveRowFilterWhereClause: () => e.rowFilter ?? '',
      GetDeniedReadFields: () => new Set<string>(),
    })),
  } as unknown as DatabaseProviderBase;
}

const USER = { ID: 'user-1', Email: 'user@example.com' } as unknown as UserInfo;
const RUBRIC_EVALUATIONS: EntityShape = { Name: 'MJ: Rubric Evaluations', SchemaName: '__mj', BaseView: 'vwRubricEvaluations' };
const REQUEST_TIMEOUT_MS = 120_000;

describe('CreateAdhocSQLAuthorizer', () => {
  const authorizer = CreateAdhocSQLAuthorizer(REQUEST_TIMEOUT_MS);

  it('admits SQL that reads only entity views the user may read in full', () => {
    const refusal = authorizer.Authorize('SELECT ID FROM [__mj].[vwRubricEvaluations]', readOnlyProvider([RUBRIC_EVALUATIONS]), USER);

    expect(refusal).toBeNull();
  });

  it('refuses SQL that reads an entity the user may read only through a row filter', () => {
    const filtered = { ...RUBRIC_EVALUATIONS, rowFilter: "EvaluatorUserID='user-1'" };

    const refusal = authorizer.Authorize('SELECT * FROM __mj.vwRubricEvaluations', readOnlyProvider([filtered]), USER);

    expect(refusal).toMatch(/row-level-security filtered/);
  });

  it('refuses SQL that reads a table that is not an entity view', () => {
    const refusal = authorizer.Authorize('SELECT * FROM [__mj].[User]', readOnlyProvider([RUBRIC_EVALUATIONS]), USER);

    expect(refusal).toMatch(/entity base view/);
  });

  it('refuses a stacked batch hidden behind a bracket identifier', () => {
    const refusal = authorizer.Authorize("SELECT 1 AS [a'] ; SELECT 2 AS [b']", readOnlyProvider([RUBRIC_EVALUATIONS]), USER);

    expect(refusal).toMatch(/single read query/);
  });

  it('limits the timeout the way ExecuteAdhocQuery does', () => {
    for (const requested of [undefined, 5, 600]) {
      expect(authorizer.ClampTimeoutSeconds(requested)).toBe(ClampAdhocTimeoutSeconds(requested, REQUEST_TIMEOUT_MS));
    }
    expect(authorizer.ClampTimeoutSeconds(600)).toBe(120);
  });
});

describe('MJServer startup', () => {
  // Startup needs a database, so this one assertion reads the source.
  it('registers the read-only provider factory and this authorizer with the action engine', () => {
    const src = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');

    expect(/ActionEngineServer\.Instance\.SetReadOnlyProviderFactory\(\s*\(\)\s*=>\s*CreateReadOnlyProvider\(dataSources\)\s*\)/.test(src)).toBe(true);
    expect(/ActionEngineServer\.Instance\.SetAdhocSQLAuthorizer\(\s*CreateAdhocSQLAuthorizer\(configInfo\.databaseSettings\.requestTimeout\)\s*\)/.test(src)).toBe(true);
  });
});
