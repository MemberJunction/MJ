// type-graphql decorators call `Reflect.getMetadata`, which only exists once this polyfill is
// loaded. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

/**
 * `RunTemplate` renders a stored template on demand. Its API-key scope check is a no-op for JWT,
 * magic-link and widget sessions, so the resolver applies its own rule. These tests pin that it
 * refuses scope-limited sessions and callers who cannot read templates before it loads anything.
 */
import { describe, it, expect, vi } from 'vitest';

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

import { EntityInfo, UserInfo, UserRoleInfo } from '@memberjunction/core';
import { RunTemplateResolver } from '../resolvers/RunTemplateResolver.js';
import type { AppContext, UserPayload } from '../types.js';

const UI_ROLE_ID = '0b9b7b55-0000-4000-8000-0000000000a1';
const TEMPLATE_ID = '0b9b7b55-0000-4000-8000-0000000000c1';

/** An entity whose read permission is granted to the given roles. */
function entityReadableBy(name: string, roleIds: string[]): EntityInfo {
  const entityId = `entity-${name}`;
  return new EntityInfo({
    ID: entityId, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: `vw${name}`, IncludeInAPI: true,
    EntityPermissions: roleIds.map((roleId, index) => ({
      ID: `${entityId}-permission-${index}`, EntityID: entityId, RoleID: roleId,
      CanCreate: false, CanRead: true, CanUpdate: false, CanDelete: false, Type: 'Allow',
    })),
  });
}

/**
 * Metadata plus the one data call the resolver makes first. The data call fails on purpose, so a
 * test can tell whether the resolver got past authorization without needing a database.
 */
class FakeProvider {
  public readonly EntityObjectRequests: string[] = [];

  constructor(private readonly entities: EntityInfo[]) {}

  public EntityByName(name: string): EntityInfo | undefined {
    return this.entities.find((e) => e.Name.trim().toLowerCase() === name.trim().toLowerCase());
  }

  public async GetEntityObject(entityName: string): Promise<never> {
    this.EntityObjectRequests.push(entityName);
    throw new Error(`reached data access for ${entityName}`);
  }
}

function makeUser(roleIds: string[]): UserInfo {
  const userId = '0b9b7b55-0000-4000-8000-0000000000b1';
  return new UserInfo(null, {
    ID: userId, Name: 'Template Runner', Email: 'runner@example.com',
    UserRoles: roleIds.map((roleId) => new UserRoleInfo({ UserID: userId, RoleID: roleId })),
  });
}

const readableEverywhere = () => [
  entityReadableBy('MJ: Templates', [UI_ROLE_ID]),
  entityReadableBy('MJ: Template Contents', [UI_ROLE_ID]),
];

/** A JWT-style session (no API key), so the API-key scope check is a no-op. */
function contextFor(user: UserInfo, provider: FakeProvider): AppContext {
  const userPayload: UserPayload = { email: user.Email, userRecord: user, sessionId: 'session-1' };
  return { userPayload, providers: [{ type: 'Read-Write', provider }] } as unknown as AppContext;
}

const runTemplate = (user: UserInfo, provider: FakeProvider) =>
  new RunTemplateResolver().RunTemplate(TEMPLATE_ID, contextFor(user, provider));

describe('RunTemplate authorization', () => {
  it('refuses an anonymous magic-link guest before loading the template', async () => {
    const provider = new FakeProvider(readableEverywhere());
    const guest = makeUser([UI_ROLE_ID]);
    guest.IsMagicLinkAnonymous = true;

    const result = await runTemplate(guest, provider);

    expect(result).toMatchObject({ success: false, error: 'Running templates is not permitted for scope-limited sessions' });
    expect(provider.EntityObjectRequests).toEqual([]);
  });

  it('refuses a resource-scoped magic-link session before loading the template', async () => {
    const provider = new FakeProvider(readableEverywhere());
    const scoped = makeUser([UI_ROLE_ID]);
    scoped.MagicLinkScope = { ResourceID: '0b9b7b55-0000-4000-8000-0000000000d1', ResourceType: 'Dashboards' };

    const result = await runTemplate(scoped, provider);

    expect(result).toMatchObject({ success: false, error: 'Running templates is not permitted for scope-limited sessions' });
    expect(provider.EntityObjectRequests).toEqual([]);
  });

  it('refuses a user without read permission on MJ: Templates before loading the template', async () => {
    const provider = new FakeProvider(readableEverywhere());

    const result = await runTemplate(makeUser([]), provider);

    expect(result).toMatchObject({ success: false, error: 'You do not have permission to read MJ: Templates' });
    expect(provider.EntityObjectRequests).toEqual([]);
  });

  it('lets a user who can read templates and their content through to the template load', async () => {
    const provider = new FakeProvider(readableEverywhere());

    const result = await runTemplate(makeUser([UI_ROLE_ID]), provider);

    expect(result).toMatchObject({ success: false, error: 'reached data access for MJ: Templates' });
    expect(provider.EntityObjectRequests).toEqual(['MJ: Templates']);
  });
});
