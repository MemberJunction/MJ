/**
 * `toggleUserStatus` must not report success when the save was refused.
 *
 * WHY THIS EXISTS. `BaseEntity.Save()` returns `false` on a validation failure — it does not throw
 * (MJ's documented Save/Delete contract). `toggleUserStatus` discarded that return value, so its
 * `catch` never ran: no revert, no console.error, and `calculateStats()` re-rendered the row as
 * toggled. The UI asserted success while nothing had been written.
 *
 * This became reachable with the #4260 privilege-elevation guard on `MJ: Users`
 * (`MJUserEntityServer`), which refuses a non-Owner's write to another user's row through
 * `Validate()`. Deactivating a user IS a write to another user's row, and it is this screen's
 * primary function — so for every non-Owner admin the toggle silently lies.
 *
 * The sibling `deleteUser` in the same component already handles this correctly (checks the
 * result, throws with `LatestResult?.Message`, catch sets `this.error`); these tests pin
 * `toggleUserStatus` to that same in-file convention.
 *
 * The component is exercised through its prototype with minimal stubs for the two things the
 * method touches (`ngZone`, `cdr`) rather than through TestBed: the behaviour under test is the
 * method's own control flow, and a full Angular harness would add setup without adding coverage.
 */
import { describe, it, expect, vi } from 'vitest';
import { UserManagementComponent } from './user-management.component';

interface ToggleHost {
    toggleUserStatus(user: unknown): Promise<void>;
    error: string | null;
    calculateStats(): void;
}

function makeComponent(): ToggleHost {
    const c = Object.create(UserManagementComponent.prototype) as ToggleHost & Record<string, unknown>;
    c['ngZone'] = { run: (fn: () => void) => fn() };
    c['cdr'] = { markForCheck: () => undefined };
    c['calculateStats'] = vi.fn();
    c.error = null;
    return c;
}

/** Minimal MJUserEntity stand-in: only IsActive, Save() and LatestResult are touched. */
function makeUser(saveReturns: boolean, message?: string) {
    return {
        IsActive: true,
        LatestResult: message ? { Message: message } : undefined,
        Save: vi.fn().mockResolvedValue(saveReturns),
    };
}

describe('UserManagementComponent.toggleUserStatus — a refused save must not look like success', () => {
    it('REVERTS IsActive when Save() returns false', async () => {
        const c = makeComponent();
        const user = makeUser(false, 'You may only modify your own user record.');
        await c.toggleUserStatus(user);
        expect(user.Save).toHaveBeenCalledOnce();
        expect(user.IsActive).toBe(true); // flipped to false, then reverted
    });

    it('SURFACES the refusal message to the user', async () => {
        const c = makeComponent();
        const user = makeUser(false, 'You may only modify your own user record.');
        await c.toggleUserStatus(user);
        expect(c.error).toBe('You may only modify your own user record.');
    });

    it('does NOT recalculate stats for a refused save — the row must not render as toggled', async () => {
        const c = makeComponent();
        await c.toggleUserStatus(makeUser(false, 'refused'));
        expect(c.calculateStats).not.toHaveBeenCalled();
    });

    it('falls back to a generic message when the entity carries no LatestResult', async () => {
        const c = makeComponent();
        await c.toggleUserStatus(makeUser(false));
        expect(c.error).toBeTruthy();
    });

    it('still succeeds normally when Save() returns true — the Owner path is untouched', async () => {
        const c = makeComponent();
        const user = makeUser(true);
        await c.toggleUserStatus(user);
        expect(user.IsActive).toBe(false); // stays toggled
        expect(c.calculateStats).toHaveBeenCalledOnce();
    });

    // Asserting `error === null` on a freshly built component proves nothing — makeComponent()
    // starts it null, so such a test stays green even if the success path never clears it. The
    // banner must be observed going from SET to CLEARED on ONE component instance.
    it('CLEARS a previous refusal banner on the next successful toggle', async () => {
        const c = makeComponent();
        await c.toggleUserStatus(makeUser(false, 'You may only modify your own user record.'));
        expect(c.error).toBe('You may only modify your own user record.');

        await c.toggleUserStatus(makeUser(true));
        expect(c.error).toBeNull();
    });
});
