/**
 * The scoped level of notification resolution (MJ#4946): which rows are in scope, which wins, and how the recipient's
 * own preference and a locked Deny combine.
 */
import { describe, it, expect } from 'vitest';
import {
  ResolveChannel,
  ScopedNotificationConfigResolver,
  type ScopedNotificationConfigRow,
} from '../scoped-notification-config-resolver';

const TYPE = '11111111-1111-1111-1111-111111111111';
const OTHER_TYPE = '22222222-2222-2222-2222-222222222222';
const APP = 'AAAAAAAA-0000-0000-0000-000000000001';
const ROLE_UI = 'BBBBBBBB-0000-0000-0000-000000000001';
const ROLE_DEV = 'BBBBBBBB-0000-0000-0000-000000000002';
const USER = 'CCCCCCCC-0000-0000-0000-000000000001';
const ENTITY_APPLICATIONS = 'DDDDDDDD-0000-0000-0000-000000000001';

let n = 0;
function row(overrides: Partial<ScopedNotificationConfigRow>): ScopedNotificationConfigRow {
  return {
    ID: `row-${++n}`,
    NotificationTypeID: TYPE,
    PrimaryScopeEntityID: null,
    PrimaryScopeRecordID: null,
    SecondaryScopes: null,
    InApp: null,
    Email: null,
    SMS: null,
    IsLocked: false,
    Priority: 0,
    Status: 'Active',
    ...overrides,
  };
}

const resolver = new ScopedNotificationConfigResolver();
const recipient = { userId: USER, roleIds: [ROLE_UI, ROLE_DEV] };

describe('ScopedNotificationConfigResolver', () => {
  it('says nothing when no row is in scope, so the type default stands', () => {
    const r = resolver.Resolve([row({ NotificationTypeID: OTHER_TYPE, Email: 'Deny' })], TYPE, undefined, recipient);
    expect(r.email).toEqual({ value: null, lockedOff: false });
    expect(r.rows).toHaveLength(0);
  });

  it('applies a global row to everyone, and ignores Archived rows', () => {
    const rows = [row({ Email: 'Deny' }), row({ Email: 'Allow', Status: 'Archived', Priority: 99 })];
    expect(resolver.Resolve(rows, TYPE, undefined, recipient).email.value).toBe('Deny');
  });

  it('narrows by origin through the secondary scopes: the system user is quiet, a person is not', () => {
    const rows = [row({ SecondaryScopes: JSON.stringify({ origin: 'System' }), InApp: 'Deny', Email: 'Deny', SMS: 'Deny', IsLocked: true })];
    const system = resolver.Resolve(rows, TYPE, { secondaryScopes: { origin: 'System' } }, recipient);
    const person = resolver.Resolve(rows, TYPE, { secondaryScopes: { origin: 'Person' } }, recipient);
    const none = resolver.Resolve(rows, TYPE, undefined, recipient);
    expect(system.email).toEqual({ value: 'Deny', lockedOff: true });
    expect(person.email.value).toBeNull();
    expect(none.email.value).toBeNull();
  });

  it('lets the more specific row win: an application row over a global row, a secondary-scoped row over both', () => {
    const rows = [
      row({ Email: 'Deny' }),
      row({ PrimaryScopeEntityID: ENTITY_APPLICATIONS, PrimaryScopeRecordID: APP, Email: 'Allow' }),
      row({ PrimaryScopeEntityID: ENTITY_APPLICATIONS, PrimaryScopeRecordID: APP, SecondaryScopes: JSON.stringify({ origin: 'Automation' }), Email: 'Deny' }),
    ];
    const scope = { primaryScopeEntityId: ENTITY_APPLICATIONS, primaryScopeRecordId: APP };
    expect(resolver.Resolve(rows, TYPE, scope, recipient).email.value).toBe('Allow');
    expect(resolver.Resolve(rows, TYPE, { ...scope, secondaryScopes: { origin: 'Automation' } }, recipient).email.value).toBe('Deny');
    expect(resolver.Resolve(rows, TYPE, undefined, recipient).email.value).toBe('Deny');
  });

  it("takes the recipient's roles and the recipient as primary scopes without the caller naming them", () => {
    const rows = [row({ PrimaryScopeRecordID: ROLE_DEV, SMS: 'Allow' }), row({ PrimaryScopeRecordID: USER, InApp: 'Deny' })];
    const r = resolver.Resolve(rows, TYPE, undefined, recipient);
    expect(r.sms.value).toBe('Allow');
    expect(r.inApp.value).toBe('Deny');
    expect(resolver.Resolve(rows, TYPE, undefined, { userId: 'someone-else', roleIds: [ROLE_UI] }).sms.value).toBeNull();
  });

  it('at equal specificity one Deny beats any Allow, the permission rule, with Priority only breaking ties otherwise', () => {
    const twoRoles = [row({ PrimaryScopeRecordID: ROLE_UI, Email: 'Allow', Priority: 10 }), row({ PrimaryScopeRecordID: ROLE_DEV, Email: 'Deny' })];
    expect(resolver.Resolve(twoRoles, TYPE, undefined, recipient).email.value).toBe('Deny');
    const twoAllows = [row({ PrimaryScopeRecordID: ROLE_UI, Email: 'Allow', Priority: 1 }), row({ PrimaryScopeRecordID: ROLE_DEV, Email: null, Priority: 10 })];
    expect(resolver.Resolve(twoAllows, TYPE, undefined, recipient).email.value).toBe('Allow');
  });

  it('leaves a channel a row does not speak to for the next level', () => {
    const rows = [row({ PrimaryScopeRecordID: ROLE_UI, Email: 'Deny' }), row({ InApp: 'Allow' })];
    const r = resolver.Resolve(rows, TYPE, undefined, recipient);
    expect(r.email.value).toBe('Deny');
    expect(r.inApp.value).toBe('Allow');
    expect(r.sms.value).toBeNull();
  });

  it('reports a locked Deny even when a more specific Allow would otherwise win', () => {
    const rows = [row({ Email: 'Deny', IsLocked: true }), row({ PrimaryScopeRecordID: USER, Email: 'Allow' })];
    expect(resolver.Resolve(rows, TYPE, undefined, recipient).email).toEqual({ value: 'Allow', lockedOff: true });
  });
});

describe('ResolveChannel', () => {
  const scoped = (value: 'Allow' | 'Deny' | null, lockedOff = false) => ({ value, lockedOff });

  it('falls back to the type default when nothing above speaks', () => {
    expect(ResolveChannel({ typeDefault: true, scoped: scoped(null), userPreference: null })).toBe(true);
    expect(ResolveChannel({ typeDefault: false, scoped: scoped(null), userPreference: null })).toBe(false);
  });

  it('lets a scoped row override the type default, and the recipient override the scoped row', () => {
    expect(ResolveChannel({ typeDefault: true, scoped: scoped('Deny'), userPreference: null })).toBe(false);
    expect(ResolveChannel({ typeDefault: false, scoped: scoped('Allow'), userPreference: null })).toBe(true);
    expect(ResolveChannel({ typeDefault: true, scoped: scoped('Deny'), userPreference: true })).toBe(true);
    expect(ResolveChannel({ typeDefault: true, scoped: scoped('Allow'), userPreference: false })).toBe(false);
  });

  it('a locked Deny caps everything below it, the recipient included', () => {
    expect(ResolveChannel({ typeDefault: true, scoped: scoped('Deny', true), userPreference: true })).toBe(false);
    expect(ResolveChannel({ typeDefault: true, scoped: scoped('Allow', true), userPreference: true })).toBe(false);
  });
});
