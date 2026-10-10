// type-graphql decorators call `Reflect.getMetadata`, which only exists once this polyfill is
// loaded. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

/**
 * `RunAction` is a public mutation: any authenticated principal can call it with any action ID.
 * These tests pin who may run an action through it, and that the client cannot switch off the
 * action execution log.
 *
 * Policy under test:
 * - scope-limited sessions (anonymous magic-link guests, widget guests, resource-scoped links)
 *   are refused before anything loads;
 * - an Owner may run any action, decided before anything is read;
 * - any other user must hold one of the authorizations linked to the action through
 *   `MJ: Action Authorizations`; an action with none runs only when its class authorizes its
 *   caller itself (`BaseAction.AuthorizesCaller`), and is refused otherwise.
 */
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';

// As in RunDecisionResolver.test.ts: vitest's esbuild transform does not apply
// `emitDecoratorMetadata`, so the decorators are no-ops and the resolver runs as a plain class.
vi.mock('type-graphql', () => {
  const noopDecorator = () => () => undefined;
  return {
    Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
    ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
    Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
    Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
    createUnionType: () => class {},
    AuthorizationError: class AuthorizationError extends Error {
      constructor(message?: string) {
        super(message);
        this.name = 'AuthorizationError';
      }
    },
    Float: class {}, Int: class {}, ID: class {},
  };
});

import {
  AuthorizationInfo,
  AuthorizationRoleInfo,
  EntityInfo,
  Metadata,
  RunView,
  UserInfo,
  UserRoleInfo,
  type RunViewParams,
  type RunViewResult,
} from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJGlobal } from '@memberjunction/global';
import { ActionEngineServer, BaseAction } from '@memberjunction/actions';
import { MJActionEntityExtended, type ActionResult, type ActionResultSimple, type RunActionParams } from '@memberjunction/actions-base';
import { ActionResolver, type RunActionInput } from '../resolvers/ActionResolver.js';
import type { AppContext, UserPayload } from '../types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ACTION_ENTITY = new EntityInfo({
  ID: 'entity-actions', Name: 'MJ: Actions', SchemaName: '__mj', BaseTable: 'Action', BaseView: 'vwActions',
  Fields: ['ID', 'Name', 'Type', 'DriverClass'].map((field, index) => ({
    ID: `entity-actions-${field}`, EntityID: 'entity-actions', Sequence: index + 1, Name: field, Entity: 'MJ: Actions',
    Type: field === 'ID' ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: field === 'ID',
  })),
});

const makeAction = (fields: Pick<MJActionEntityExtended, 'ID' | 'Name'>): MJActionEntityExtended => {
  const action = new MJActionEntityExtended(ACTION_ENTITY);
  action.Hydrate({ Type: 'Custom', DriverClass: null, ...fields });
  return action;
};

/** The "Calculate Expression" action from metadata/actions: no Action Authorization rows ship for it. */
const UNGRANTED_ACTION = makeAction({ ID: '22F9505E-3BEB-400E-A49F-A74D135C5A93', Name: 'Calculate Expression' });
/** An action an administrator linked to the "Run Audience Actions" authorization. */
const GRANTED_ACTION = makeAction({ ID: 'A11C0000-0000-4000-8000-000000000002', Name: 'Send To Audience' });
/** An action linked only to an authorization that has been switched off. */
const INACTIVE_GRANT_ACTION = makeAction({ ID: 'A11C0000-0000-4000-8000-000000000003', Name: 'Archive Audience' });
/** The Database Designer's "Create Entity" from metadata/actions: no Action Authorization rows ship for it. */
const SELF_AUTHORIZING_ACTION = makeAction({ ID: 'F4CBD4ED-C258-468B-8F50-F12E4C74A431', Name: 'Create Entity' });

/**
 * Stands in for the Database Designer's Create Entity class, which checks the caller's Schema
 * Management authorization itself. Registered the way `@RegisterClass` registers the real one.
 */
class SelfAuthorizingCreateEntity extends BaseAction {
  public static readonly AuthorizesCaller = true;
  protected async InternalRunAction(): Promise<ActionResultSimple> {
    return { Success: true, ResultCode: 'SUCCESS' };
  }
}
MJGlobal.Instance.ClassFactory.Register(BaseAction, SelfAuthorizingCreateEntity, 'Create Entity');

const UI_ROLE_ID = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E';
const DEVELOPER_ROLE_ID = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E';
const OTHER_ROLE_ID = 'A11C0000-0000-4000-8000-0000000000F1';

const AUDIENCE_AUTH = new AuthorizationInfo({ ID: 'A11C0000-0000-4000-8000-0000000000A1', Name: 'Run Audience Actions', IsActive: true });
const INACTIVE_AUTH = new AuthorizationInfo({ ID: 'A11C0000-0000-4000-8000-0000000000A2', Name: 'Archive Audiences', IsActive: false });
const AUTHORIZATION_ROLES = [
  new AuthorizationRoleInfo({ ID: 'ar-1', AuthorizationID: AUDIENCE_AUTH.ID, RoleID: UI_ROLE_ID, Type: 'Allow' }),
  new AuthorizationRoleInfo({ ID: 'ar-2', AuthorizationID: INACTIVE_AUTH.ID, RoleID: UI_ROLE_ID, Type: 'Allow' }),
];

/** `MJ: Action Authorizations`, as ActionID → AuthorizationIDs. */
const ACTION_AUTHORIZATIONS: Record<string, string[]> = {
  [GRANTED_ACTION.ID]: [AUDIENCE_AUTH.ID],
  [INACTIVE_GRANT_ACTION.ID]: [INACTIVE_AUTH.ID],
};

const makeUser = (fields: Pick<UserInfo, 'ID' | 'Name' | 'Email' | 'Type'>, roleIDs: string[]): UserInfo =>
  new UserInfo(null, {
    ...fields,
    UserRoles: roleIDs.map((RoleID) => new UserRoleInfo({ UserID: fields.ID, RoleID })),
  });

const UI_USER = makeUser({ ID: 'user-ui', Name: 'Pat', Email: 'pat@example.com', Type: 'User' }, [UI_ROLE_ID]);
const OTHER_USER = makeUser({ ID: 'user-other', Name: 'Sam', Email: 'sam@example.com', Type: 'User' }, [OTHER_ROLE_ID]);
const DEVELOPER = makeUser({ ID: 'user-dev', Name: 'Dana', Email: 'dana@example.com', Type: 'User' }, [DEVELOPER_ROLE_ID]);
// `Type` is an nchar column, so the database pads it.
const OWNER = makeUser({ ID: 'user-owner', Name: 'Olive', Email: 'olive@example.com', Type: 'Owner          ' }, []);
const SYSTEM_USER = makeUser({ ID: 'user-system', Name: 'System', Email: 'system@example.com', Type: 'Owner' }, []);

const payloadFor = (user: UserInfo): UserPayload => ({ email: user.Email, userRecord: user, sessionId: `session-${user.ID}` });

/** The context the resolver reads: `userPayload` and `providers`. */
function context(user: UserInfo): AppContext {
  const partial: Pick<AppContext, 'userPayload' | 'providers'> = { userPayload: payloadFor(user), providers: [] };
  return partial as AppContext;
}

const runAction = (user: UserInfo, input: Partial<RunActionInput> & Pick<RunActionInput, 'ActionID'>) =>
  new ActionResolver().RunAction({ Params: [], ...input } as RunActionInput, context(user));

const ENGINE_RESULT: ActionResult = { Success: true, Message: 'ran', RunParams: null, Params: [] };

let engineRun: MockInstance<ActionEngineServer['RunAction']>;
let engineConfig: MockInstance<ActionEngineServer['Config']>;
let viewRun: MockInstance<RunView['RunView']>;
const sentParams = (): RunActionParams => engineRun.mock.calls[0][0];

beforeEach(() => {
  vi.restoreAllMocks();
  engineConfig = vi.spyOn(ActionEngineServer.prototype, 'Config').mockResolvedValue(undefined);
  vi.spyOn(ActionEngineServer.prototype, 'Actions', 'get').mockReturnValue([UNGRANTED_ACTION, GRANTED_ACTION, INACTIVE_GRANT_ACTION, SELF_AUTHORIZING_ACTION]);
  engineRun = vi.spyOn(ActionEngineServer.prototype, 'RunAction').mockResolvedValue(ENGINE_RESULT);
  vi.spyOn(UserCache.prototype, 'GetSystemUser').mockReturnValue(SYSTEM_USER);
  vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
    Authorizations: [AUDIENCE_AUTH, INACTIVE_AUTH],
    AuthorizationRoles: AUTHORIZATION_ROLES,
  } as unknown as ReturnType<typeof Metadata.Provider>);
  // No database: answer the `MJ: Action Authorizations` lookup from the fixture above.
  viewRun = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
    const actionID = Object.keys(ACTION_AUTHORIZATIONS).find((id) => params.ExtraFilter?.includes(id));
    const rows = params.EntityName === 'MJ: Action Authorizations' && actionID
      ? ACTION_AUTHORIZATIONS[actionID].map((AuthorizationID) => ({ ActionID: actionID, AuthorizationID }))
      : [];
    return { Success: true, Results: rows as T[], RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
  });
});

// ─── Scope-limited sessions ──────────────────────────────────────────────────

describe('RunAction: scope-limited sessions', () => {
  it.each([
    ['an anonymous magic-link or widget guest', { IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceID: 'widget-session-1', ResourceType: 'Widget Session' } }],
    ['a resource-scoped magic-link session', { IsMagicLinkAnonymous: false, MagicLinkScope: { ResourceID: 'dashboard-1', ResourceType: 'Dashboards' } }],
  ])('refuses %s before the action engine loads or runs anything', async (_label, limit) => {
    const guest = Object.assign(makeUser({ ID: 'user-guest', Name: 'Guest', Email: 'guest@example.com', Type: 'User' }, [UI_ROLE_ID]), limit);

    const result = await runAction(guest, { ActionID: GRANTED_ACTION.ID });

    expect(result.Success).toBe(false);
    expect(result.Message).toMatch(/not permitted for scope-limited sessions/);
    expect(engineConfig).not.toHaveBeenCalled();
    expect(engineRun).not.toHaveBeenCalled();
  });
});

// ─── Per-action authorization ────────────────────────────────────────────────

describe('RunAction: per-action authorization', () => {
  it('refuses an ordinary user for an action that no Action Authorization grants', async () => {
    const result = await runAction(UI_USER, {
      ActionID: UNGRANTED_ACTION.ID,
      Params: [{ Name: 'Expression', Type: 'Input', Value: '6*7' }],
    });

    expect(result.Success).toBe(false);
    expect(result.Message).toMatch(/not authorized to run action/i);
    expect(engineRun).not.toHaveBeenCalled();
  });

  it('refuses a user whose roles hold none of the action\'s authorizations', async () => {
    const result = await runAction(OTHER_USER, { ActionID: GRANTED_ACTION.ID });

    expect(result.Success).toBe(false);
    expect(result.Message).toMatch(/not authorized to run action/i);
    expect(engineRun).not.toHaveBeenCalled();
  });

  it('refuses when the only linked authorization is inactive', async () => {
    const result = await runAction(UI_USER, { ActionID: INACTIVE_GRANT_ACTION.ID });

    expect(result.Success).toBe(false);
    expect(engineRun).not.toHaveBeenCalled();
  });

  it('runs the action for a user whose role holds a linked authorization', async () => {
    const result = await runAction(UI_USER, { ActionID: GRANTED_ACTION.ID });

    expect(result.Success).toBe(true);
    expect(sentParams().Action).toBe(GRANTED_ACTION);
    expect(sentParams().ContextUser).toBe(UI_USER);
  });

  it('runs any action for an Owner, deciding before reading any Action Authorization', async () => {
    const result = await runAction(OWNER, { ActionID: UNGRANTED_ACTION.ID });

    expect(result.Success).toBe(true);
    expect(sentParams().Action).toBe(UNGRANTED_ACTION);
    expect(viewRun).not.toHaveBeenCalled();
  });

  it('runs an unlinked action whose class authorizes its caller, so the action decides: a Developer may run Create Entity', async () => {
    const result = await runAction(DEVELOPER, { ActionID: SELF_AUTHORIZING_ACTION.ID });

    expect(result.Success).toBe(true);
    expect(sentParams().Action).toBe(SELF_AUTHORIZING_ACTION);
    expect(sentParams().ContextUser).toBe(DEVELOPER);
  });

  it('still refuses that Developer an unlinked action whose class does not authorize its caller', async () => {
    const result = await runAction(DEVELOPER, { ActionID: UNGRANTED_ACTION.ID });

    expect(result.Success).toBe(false);
    expect(result.Message).toMatch(/not authorized to run action/i);
    expect(engineRun).not.toHaveBeenCalled();
  });

  it('still reports an unknown action ID as not found', async () => {
    const result = await runAction(OWNER, { ActionID: 'A11C0000-0000-4000-8000-0000000000FF' });

    expect(result.Success).toBe(false);
    expect(result.Message).toMatch(/not found/);
    expect(engineRun).not.toHaveBeenCalled();
  });
});

// ─── Action execution log ────────────────────────────────────────────────────

describe('RunAction: action execution log', () => {
  it('writes the execution log even when the client asks to skip it', async () => {
    const result = await runAction(OWNER, { ActionID: UNGRANTED_ACTION.ID, SkipActionLog: true });

    expect(result.Success).toBe(true);
    expect(sentParams().SkipActionLog).toBe(false);
  });
});
