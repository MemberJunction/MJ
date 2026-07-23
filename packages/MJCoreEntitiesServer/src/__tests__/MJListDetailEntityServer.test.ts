/**
 * Unit tests for `MJListDetailEntityServer` — the server-side List Details DELETE gate.
 *
 * The class enforces the SAME owner-or-privileged rule as Lists, but scoped through the parent
 * List's owner (a List Detail has no owner of its own — only a `ListID`). It resolves the parent
 * List's `UserID` via a read-only RunView, then defers the actual decision to the shared pure rule
 * `MJListEntityExtended.UserCanDelete`. When the owner can't be positively determined (no ListID,
 * parent not found, or the lookup threw) it FAILS OPEN — there's no owner to protect and the coarse
 * entity permission still applies.
 *
 * These tests exercise the server's ORCHESTRATION (parent lookup, fail-open branches, gating on the
 * rule result). The pure rule itself is covered by MJCoreEntities' MJListEntityExtended.test.ts, so
 * here `UserCanDelete` is a controllable spy — we assert it's called with the resolved owner id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Neutralize the class-factory registration decorator.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

// Controllable RunView + LogError. RunView's instance method is reassigned per-test.
const runViewMock = vi.fn();
const logErrorMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (...args: unknown[]) => logErrorMock(...args),
        RunView: class {
            public RunView(...args: unknown[]) {
                return runViewMock(...args);
            }
        },
    };
});

// Settable base standing in for the generated/extended List Detail, plus a controllable
// UserCanDelete rule. `Delete` on the base is the "super.Delete" the subclass calls when it allows.
const userCanDeleteMock = vi.fn();
const superDeleteMock = vi.fn(async () => true);
const registerResultMock = vi.fn();
vi.mock('@memberjunction/core-entities', () => {
    class MockMJListDetailEntityExtended {
        public ListID: string | null = null;
        public ContextCurrentUser: unknown = null;
        public RegisterResultHistoryEntry(result: unknown): void {
            registerResultMock(result);
        }
        public async Delete(options?: unknown): Promise<boolean> {
            return superDeleteMock(options);
        }
    }
    return {
        MJListDetailEntityExtended: MockMJListDetailEntityExtended,
        MJListEntityExtended: {
            UserCanDelete: (...args: unknown[]) => userCanDeleteMock(...args),
        },
    };
});

// Import AFTER the mocks are registered.
import { MJListDetailEntityServer } from '../custom/MJListDetailEntityServer.server';

const OWNER = 'AAAAAAAA-1111-2222-3333-444444444444';
const USER = { ID: 'BBBBBBBB-1111-2222-3333-444444444444', UserRoles: [] };

function makeDetail(listID: string | null): MJListDetailEntityServer {
    const d = new MJListDetailEntityServer();
    // The mock base exposes plain settable fields.
    (d as unknown as { ListID: string | null }).ListID = listID;
    (d as unknown as { ContextCurrentUser: unknown }).ContextCurrentUser = USER;
    return d;
}

function runViewReturns(rows: Array<{ ID: string; UserID: string }> | null, success = true) {
    runViewMock.mockResolvedValue({ Success: success, Results: rows ?? [] });
}

describe('MJListDetailEntityServer.Delete', () => {
    beforeEach(() => {
        runViewMock.mockReset();
        userCanDeleteMock.mockReset();
        superDeleteMock.mockClear();
        registerResultMock.mockClear();
        logErrorMock.mockReset();
    });

    it('resolves the parent List owner and passes it to the shared rule', async () => {
        runViewReturns([{ ID: 'LIST1', UserID: OWNER }]);
        userCanDeleteMock.mockReturnValue(true);

        await makeDetail('LIST1').Delete();

        expect(userCanDeleteMock).toHaveBeenCalledWith(OWNER, USER);
    });

    it('allows the delete (calls super) when the rule permits', async () => {
        runViewReturns([{ ID: 'LIST1', UserID: OWNER }]);
        userCanDeleteMock.mockReturnValue(true);

        const ok = await makeDetail('LIST1').Delete();

        expect(ok).toBe(true);
        expect(superDeleteMock).toHaveBeenCalledTimes(1);
        expect(registerResultMock).not.toHaveBeenCalled();
    });

    it('blocks the delete (no super, records a failure result) when the rule denies', async () => {
        runViewReturns([{ ID: 'LIST1', UserID: OWNER }]);
        userCanDeleteMock.mockReturnValue(false);

        const ok = await makeDetail('LIST1').Delete();

        expect(ok).toBe(false);
        expect(superDeleteMock).not.toHaveBeenCalled();
        expect(registerResultMock).toHaveBeenCalledTimes(1);
    });

    it('threads Delete options through to super when allowed', async () => {
        runViewReturns([{ ID: 'LIST1', UserID: OWNER }]);
        userCanDeleteMock.mockReturnValue(true);
        const options = { SkipEntityAIActions: true };

        await makeDetail('LIST1').Delete(options as never);

        expect(superDeleteMock).toHaveBeenCalledWith(options);
    });

    it('fails OPEN (allows) when the parent List is not found', async () => {
        runViewReturns([]); // no parent row
        userCanDeleteMock.mockReturnValue(false); // would deny if consulted

        const ok = await makeDetail('LIST1').Delete();

        expect(ok).toBe(true);
        expect(superDeleteMock).toHaveBeenCalledTimes(1);
        expect(userCanDeleteMock).not.toHaveBeenCalled(); // never consulted — no owner to protect
    });

    it('fails OPEN (allows) when there is no ListID — skips the lookup entirely', async () => {
        userCanDeleteMock.mockReturnValue(false);

        const ok = await makeDetail(null).Delete();

        expect(ok).toBe(true);
        expect(runViewMock).not.toHaveBeenCalled();
        expect(superDeleteMock).toHaveBeenCalledTimes(1);
    });

    it('fails OPEN (allows) and logs when the parent lookup throws', async () => {
        runViewMock.mockRejectedValue(new Error('transient read failure'));
        userCanDeleteMock.mockReturnValue(false);

        const ok = await makeDetail('LIST1').Delete();

        expect(ok).toBe(true);
        expect(superDeleteMock).toHaveBeenCalledTimes(1);
        expect(logErrorMock).toHaveBeenCalledTimes(1);
    });
});
