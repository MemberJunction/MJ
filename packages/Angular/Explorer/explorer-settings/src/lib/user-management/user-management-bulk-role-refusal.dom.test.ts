/**
 * `executeBulkRoleAssign` must tell the operator WHY the server refused, not just that something
 * failed.
 *
 * This is the surface issue #4309 was written against: an administrator bulk-assigns a role, the
 * server refuses it, and the screen has to say which user and which rule. #4309's "Verify by" is
 * explicit — *"step 5 must now show an error naming the refused user(s) and the rule"*.
 *
 * WHY A SERVER REFUSAL ARRIVES DIFFERENTLY FROM A CLIENT ONE. Inside a TransactionGroup a
 * client-side `Save()` returns `false` only for a CLIENT-side refusal, and that row is then never
 * enrolled — the `refusals` guard in the method catches those before `Submit()` is reached. A
 * SERVER-side refusal (`MJUserRoleEntityServer`, issue #4282) cannot work that way: the guard
 * lives in `@memberjunction/core-entities-server`, which no browser package depends on, so the
 * browser's `Validate()` passes, every row enrols, and the refusal only happens once the group is
 * on the server. The whole group then comes back failed and `Submit()` returns `false`.
 *
 * Since #4309 the reason travels with that failure — the resolver reports which row it refused and
 * why, and `GraphQLTransactionGroup.recordServerFailure` copies it onto each item's
 * `BaseEntity.LatestResult`. These tests pin the last hop: this component reading it back.
 *
 * Stub style mirrors `user-dialog-role-refusal.dom.test.ts` — the component is exercised through
 * its prototype, because the behaviour under test is the method's own control flow. Note
 * `executeBulkRoleAssign` catches its own errors and assigns `this.error`, which the template
 * renders verbatim, so that field IS the user-visible string and is what these assert on.
 */
import { describe, it, expect, vi } from 'vitest';
import { UserManagementComponent } from './user-management.component';

interface BulkAssignHost {
  executeBulkRoleAssign(): Promise<void>;
  bulkRoleId: string;
  selectedUserIds: Set<string>;
  userRoleMap: Map<string, string[]>;
  users: unknown[];
  error: string;
  Provider: unknown;
  ClearSelection(): void;
  LoadInitialData(): Promise<void>;
}

/** Minimal MJUserRoleEntity stand-in: only what `executeBulkRoleAssign` touches. */
function makeUserRole(saveReturns: boolean, message?: string) {
  return {
    UserID: '',
    RoleID: '',
    TransactionGroup: null as unknown,
    LatestResult: message ? { CompleteMessage: message } : undefined,
    NewRecord: vi.fn(),
    Save: vi.fn().mockResolvedValue(saveReturns),
  };
}

function makeComponent(opts: {
  roles?: ReturnType<typeof makeUserRole>[];
  /** `false` models the server refusing a row after every row enrolled cleanly. */
  submitReturns?: boolean;
  selected?: string[];
}) {
  const tg = { Submit: vi.fn().mockResolvedValue(opts.submitReturns ?? true) };
  const queue = [...(opts.roles ?? [])];
  const c = Object.create(UserManagementComponent.prototype) as BulkAssignHost;
  c.bulkRoleId = 'role-integration';
  c.selectedUserIds = new Set(opts.selected ?? ['u1']);
  c.userRoleMap = new Map();
  c.users = [
    { ID: 'u1', Email: 'ada@example.test', Name: 'Ada Lovelace' },
    { ID: 'u2', Email: 'grace@example.test', Name: 'Grace Hopper' },
  ];
  c.error = '';
  c.Provider = {
    CreateTransactionGroup: vi.fn().mockResolvedValue(tg),
    GetEntityObject: vi.fn().mockImplementation(async () => queue.shift()),
  };
  // Stubbed on the instance so the real implementations (which reload from the server and touch
  // Angular change detection) never run.
  // Stubbed under the CANONICAL names. The camelCase spellings are now @deprecated aliases that
  // forward to these, and the component calls the canonical ones internally — so a stub on an alias
  // intercepts nothing and the real LoadInitialData runs against an unconfigured provider.
  c.ClearSelection = vi.fn();
  c.LoadInitialData = vi.fn().mockResolvedValue(undefined);
  Object.assign(c, {
    isLoading: false,
    showBulkRoleAssign: true,
    ngZone: { run: (fn: () => void) => fn() },
    cdr: { markForCheck: vi.fn() },
  });
  return { c, tg };
}

describe('UserManagementComponent.executeBulkRoleAssign — a SERVER refusal must reach the operator', () => {
  it("names the server's rule, not just 'all changes have been rolled back'", async () => {
    const { c } = makeComponent({
      roles: [makeUserRole(true, 'You may only assign a role that you hold yourself.')],
      submitReturns: false,
    });

    await c.executeBulkRoleAssign();

    expect(c.error).toMatch(/hold yourself/);
  });

  it('names WHICH user was refused, so a bulk operation is diagnosable', async () => {
    const { c } = makeComponent({
      roles: [makeUserRole(true, 'You may only assign a role that you hold yourself.')],
      submitReturns: false,
    });

    await c.executeBulkRoleAssign();

    expect(c.error).toMatch(/ada@example\.test/);
  });

  it('reports every refused row in a multi-user batch, not just the first', async () => {
    const { c } = makeComponent({
      selected: ['u1', 'u2'],
      roles: [
        makeUserRole(true, 'You may only assign a role that you hold yourself.'),
        makeUserRole(true, 'You may only assign a role that you hold yourself.'),
      ],
      submitReturns: false,
    });

    await c.executeBulkRoleAssign();

    expect(c.error).toMatch(/ada@example\.test/);
    expect(c.error).toMatch(/grace@example\.test/);
  });

  it('does NOT clear the selection when the assignment failed — the operator retries from it', async () => {
    const { c } = makeComponent({
      roles: [makeUserRole(true, 'You may only assign a role that you hold yourself.')],
      submitReturns: false,
    });

    await c.executeBulkRoleAssign();

    expect(c.ClearSelection).not.toHaveBeenCalled();
  });

  it('keeps the generic message when the server named no row', async () => {
    const { c } = makeComponent({ roles: [makeUserRole(true)], submitReturns: false });

    await c.executeBulkRoleAssign();

    expect(c.error).toMatch(/all changes have been rolled back/);
  });

  it("does NOT echo the provider's own placeholder as if it were a reason", async () => {
    // 'Transaction failed' is stamped onto EVERY item of a failed group by
    // `GraphQLDataProvider`'s transaction callback, including rows the server accepted and then
    // abandoned. Showing it as this user's reason buries the row that actually was refused.
    const { c } = makeComponent({
      roles: [makeUserRole(true, 'Transaction failed')],
      submitReturns: false,
    });

    await c.executeBulkRoleAssign();

    expect(c.error).toMatch(/all changes have been rolled back/);
    expect(c.error).not.toMatch(/ada@example\.test/);
  });

  it('still succeeds when the server accepts everything — the Owner path is untouched', async () => {
    const { c, tg } = makeComponent({ roles: [makeUserRole(true)] });

    await c.executeBulkRoleAssign();

    expect(tg.Submit).toHaveBeenCalledOnce();
    expect(c.error).toBe('');
    expect(c.ClearSelection).toHaveBeenCalledOnce();
  });

  it('still reports a CLIENT-side refusal before the group is ever submitted', async () => {
    const { c, tg } = makeComponent({ roles: [makeUserRole(false, 'Permission denied')] });

    await c.executeBulkRoleAssign();

    expect(c.error).toMatch(/Permission denied/);
    expect(tg.Submit).not.toHaveBeenCalled();
  });
});
