/**
 * `updateUserRoles` must not report success when a role write was refused.
 *
 * WHY THIS EXISTS. This is the single-user sibling of the bulk path fixed in
 * `UserManagementComponent.executeBulkRoleAssign` — same screen, same transaction-group idiom,
 * same defect. Both enrol `MJ: User Roles` rows in a group and defer the write to `Submit()`;
 * `updateUserRoles` discarded the return of BOTH `userRole.Delete()` and `userRole.Save()`.
 *
 * The failure that makes it matter is not obvious, so state it precisely. Inside a
 * TransactionGroup a client-side `Save()` returns `false` only for a CLIENT-side refusal — a
 * `CheckPermissions` denial or a field-rule failure — and that row is then never enrolled. With
 * the return discarded, an all-refused batch left the group EMPTY, and an empty group's
 * `Submit()` returns `true` for having nothing to do (`transactionGroup.ts` — "no transactions to
 * submit ... we just return true"). The dialog then emitted `{action:'save'}` and closed, having
 * changed no roles. A PARTIALLY refused batch is worse: the surviving rows submit, so the user
 * gets a silent partial write.
 *
 * The server-side #4282 guard is NOT what the first describe block covers — it lives in
 * `@memberjunction/core-entities-server`, never registers in the browser, and refuses only once
 * the group reaches the server. That refusal used to be swallowed by the resolver gap tracked as
 * issue #4309; since that fix it comes back as `Submit() === false` carrying a reason, which the
 * SECOND describe block below covers. The canonical explanation of the split lives once, on
 * `executeBulkRoleAssign`; it is not repeated here.
 *
 * Stubs mirror `user-management-toggle-status.dom.test.ts`: the component is exercised through
 * its prototype because the behaviour under test is the method's own control flow. `Provider` is
 * a plain @Input, and `ProviderToUse`/`metadata` resolve through it, so no module mocking is
 * needed. `tg.Submit()` returns `true` throughout — faithfully modelling the empty group that
 * made the original failure silent.
 */
import { describe, it, expect, vi } from 'vitest';
import { UserDialogComponent, UserDialogData } from './user-dialog.component';

interface RoleUpdateHost {
  updateUserRoles(userId: string): Promise<void>;
  existingUserRoles: unknown[];
  selectedRoleIds: Set<string>;
  data: UserDialogData | null;
  Provider: unknown;
}

const ROLES = [
  { ID: 'r1', Name: 'UI' },
  { ID: 'r2', Name: 'Integration' },
] as unknown as UserDialogData['availableRoles'];

/** Minimal MJUserRoleEntity stand-in: only the fields `updateUserRoles` touches. */
function makeExistingRole(roleId: string, deleteReturns: boolean, message?: string) {
  return {
    RoleID: roleId,
    TransactionGroup: null as unknown,
    LatestResult: message ? { CompleteMessage: message } : undefined,
    Delete: vi.fn().mockResolvedValue(deleteReturns),
  };
}

function makeNewRole(saveReturns: boolean, message?: string) {
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
  existing?: ReturnType<typeof makeExistingRole>[];
  selected?: string[];
  newRoles?: ReturnType<typeof makeNewRole>[];
  /** `false` models the SERVER refusing a row: every row enrolled, then the group came back failed. */
  submitReturns?: boolean;
}) {
  const tg = { Submit: vi.fn().mockResolvedValue(opts.submitReturns ?? true) };
  const queue = [...(opts.newRoles ?? [])];
  const c = Object.create(UserDialogComponent.prototype) as RoleUpdateHost;
  c.existingUserRoles = opts.existing ?? [];
  c.selectedRoleIds = new Set(opts.selected ?? []);
  c.data = { mode: 'edit', availableRoles: ROLES };
  c.Provider = {
    CreateTransactionGroup: vi.fn().mockResolvedValue(tg),
    GetEntityObject: vi.fn().mockImplementation(async () => queue.shift()),
  };
  return { c, tg };
}

describe('UserDialogComponent.updateUserRoles — a refused role write must not look like success', () => {
  it('THROWS when an added role is refused, instead of resolving silently', async () => {
    const refused = makeNewRole(false, 'You may only assign a role that you hold yourself.');
    const { c } = makeComponent({ selected: ['r2'], newRoles: [refused] });

    await expect(c.updateUserRoles('u1')).rejects.toThrow(/hold yourself/);
    expect(refused.Save).toHaveBeenCalledOnce();
  });

  it('does NOT submit the group when an added role is refused — an empty group submits as success', async () => {
    const { c, tg } = makeComponent({
      selected: ['r2'],
      newRoles: [makeNewRole(false, 'refused')],
    });

    await expect(c.updateUserRoles('u1')).rejects.toThrow();
    expect(tg.Submit).not.toHaveBeenCalled();
  });

  it('THROWS when a role REMOVAL is refused — Delete() is discarded the same way Save() was', async () => {
    const removal = makeExistingRole('r1', false, 'You may only revoke a role that you hold yourself.');
    const { c, tg } = makeComponent({ existing: [removal], selected: [] });

    await expect(c.updateUserRoles('u1')).rejects.toThrow(/revoke a role/);
    expect(removal.Delete).toHaveBeenCalledOnce();
    expect(tg.Submit).not.toHaveBeenCalled();
  });

  it('names the role in the refusal message, so the user knows WHICH one was refused', async () => {
    const { c } = makeComponent({
      selected: ['r2'],
      newRoles: [makeNewRole(false, 'You may only assign a role that you hold yourself.')],
    });

    await expect(c.updateUserRoles('u1')).rejects.toThrow(/Integration/);
  });

  it('writes NOTHING on a PARTIAL refusal — one accepted row must not submit alone', async () => {
    const accepted = makeNewRole(true);
    const refused = makeNewRole(false, 'refused');
    const { c, tg } = makeComponent({ selected: ['r1', 'r2'], newRoles: [accepted, refused] });

    await expect(c.updateUserRoles('u1')).rejects.toThrow();
    expect(tg.Submit).not.toHaveBeenCalled();
  });

  it('falls back to a generic reason when the entity carries no LatestResult', async () => {
    const { c } = makeComponent({ selected: ['r2'], newRoles: [makeNewRole(false)] });

    await expect(c.updateUserRoles('u1')).rejects.toThrow(/Integration/);
  });

  it('still submits normally when every write is accepted — the Owner path is untouched', async () => {
    const { c, tg } = makeComponent({ selected: ['r2'], newRoles: [makeNewRole(true)] });

    await expect(c.updateUserRoles('u1')).resolves.toBeUndefined();
    expect(tg.Submit).toHaveBeenCalledOnce();
  });

  it('does not create a transaction group at all when nothing changed', async () => {
    const { c, tg } = makeComponent({ existing: [makeExistingRole('r1', true)], selected: ['r1'] });

    await expect(c.updateUserRoles('u1')).resolves.toBeUndefined();
    expect(tg.Submit).not.toHaveBeenCalled();
  });
});

/**
 * A SERVER-side refusal is the other half, and it arrives by a different route than the cases
 * above. Every row passes client validation and enrols, so no `Save()`/`Delete()` returns false;
 * the group goes to the server, `MJUserRoleEntityServer` refuses a row there, and the whole group
 * comes back failed — `Submit()` returns `false`.
 *
 * Since #4309 the reason travels with it: the resolver reports which row it refused and why, and
 * `GraphQLTransactionGroup.recordServerFailure` copies that onto each item's
 * `BaseEntity.LatestResult`. Issue #4309's "Verify by" requires the screen to name the refused
 * row AND the rule, so reading it back is the half that makes the round trip worth anything.
 */
describe('UserDialogComponent.updateUserRoles — a SERVER refusal must reach the user', () => {
  it("names the server's reason, not just 'all changes have been rolled back'", async () => {
    const refused = makeNewRole(true, 'You may only assign a role that you hold yourself.');
    const { c } = makeComponent({ selected: ['r2'], newRoles: [refused], submitReturns: false });

    await expect(c.updateUserRoles('u1')).rejects.toThrow(/hold yourself/);
  });

  it('names WHICH role the server refused', async () => {
    const refused = makeNewRole(true, 'You may only assign a role that you hold yourself.');
    const { c } = makeComponent({ selected: ['r2'], newRoles: [refused], submitReturns: false });

    await expect(c.updateUserRoles('u1')).rejects.toThrow(/Integration/);
  });

  it('reports a refused REMOVAL with its reason too', async () => {
    const removal = makeExistingRole('r1', true, 'You may only revoke a role that you hold yourself.');
    const { c } = makeComponent({ existing: [removal], selected: [], submitReturns: false });

    await expect(c.updateUserRoles('u1')).rejects.toThrow(/revoke a role/);
  });

  it('keeps the generic message when the server named no row', async () => {
    // A rollback nobody attributed — a transport failure, a constraint the server could not tie to
    // one item. There is no reason to show, and inventing one would be worse than the generic line.
    const { c } = makeComponent({ selected: ['r2'], newRoles: [makeNewRole(true)], submitReturns: false });

    await expect(c.updateUserRoles('u1')).rejects.toThrow(/all changes have been rolled back/);
  });

  it("does NOT echo the provider's own placeholder as if it were a reason", async () => {
    // `GraphQLDataProvider`'s transaction callback stamps 'Transaction failed to commit' onto
    // EVERY item of a failed group — including rows the server accepted and then abandoned when a
    // sibling was refused. Surfacing that as this row's reason tells the operator nothing and
    // buries the row that actually was refused.
    const collateral = makeNewRole(true, 'Transaction failed to commit');
    const { c } = makeComponent({ selected: ['r2'], newRoles: [collateral], submitReturns: false });

    // Asserted on the caught message rather than with `rejects.not.toThrow(...)`, which passes
    // whenever the promise rejects at all and so cannot see the placeholder leaking through.
    const message = await c.updateUserRoles('u1').then(() => '', (e: Error) => e.message);
    expect(message).toMatch(/all changes have been rolled back/);
    expect(message).not.toMatch(/Transaction failed to commit/);
    expect(message).not.toMatch(/Integration/);
  });
});
