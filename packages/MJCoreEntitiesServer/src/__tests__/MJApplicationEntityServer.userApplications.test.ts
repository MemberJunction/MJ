/**
 * Unit tests for `MJApplicationEntityServer.CreateUserApplicationsForAllUsers` — the step that gives
 * every active user a `MJ: User Applications` row when an application becomes a default for new users.
 *
 * A user who already has the application is skipped, and everyone else gets a row whose Sequence is
 * worked out from that user's OTHER applications. Both checks must find a user's rows whatever case
 * the IDs arrive in (SQL Server returns UUIDs upper-case).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJApplicationEntity: class {},
    MJUserApplicationEntity: class {},
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogStatus: vi.fn(),
    LogError: vi.fn(),
}));

import { MJApplicationEntityServer } from '../custom/MJApplicationEntityServer.server';

const APP = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_APP = 'bbbbbbbb-0000-0000-0000-000000000002';
const ANN = 'cccccccc-0000-0000-0000-000000000003';
const BEN = 'dddddddd-0000-0000-0000-000000000004';
const CAT = 'eeeeeeee-0000-0000-0000-000000000005';

interface SavedUserApp { UserID: string; ApplicationID: string; Sequence: number; IsActive: boolean }

/** Runs the step against canned users and user applications, returning the rows it saved. */
async function createFor(users: Array<{ ID: string; Name: string }>, userApps: Array<{ ID: string; UserID: string; ApplicationID: string; Sequence: number }>): Promise<SavedUserApp[]> {
    const saved: SavedUserApp[] = [];
    const provider = {
        Dialect: { BooleanLiteral: () => '1' },
        GetEntityObject: async () => {
            const row = {
                UserID: '', ApplicationID: '', Sequence: 0, IsActive: false,
                NewRecord: () => undefined,
                Save: async () => { saved.push({ UserID: row.UserID, ApplicationID: row.ApplicationID, Sequence: row.Sequence, IsActive: row.IsActive }); return true; },
            };
            return row;
        },
    };
    const app = Object.create(MJApplicationEntityServer.prototype) as MJApplicationEntityServer;
    Object.defineProperties(app, {
        ID: { value: APP },
        Name: { value: 'Reports' },
        DefaultSequence: { value: 20 },
        ContextCurrentUser: { value: { ID: 'admin' } },
        ProviderToUse: { value: provider },
        RunViewProviderToUse: { value: { RunViews: async () => [{ Success: true, Results: users }, { Success: true, Results: userApps }] } },
    });
    await (app as unknown as { CreateUserApplicationsForAllUsers(): Promise<void> }).CreateUserApplicationsForAllUsers();
    return saved;
}

describe('MJApplicationEntityServer.CreateUserApplicationsForAllUsers', () => {
    it('skips users who already have the app and sequences the rest from their own apps, in any ID case', async () => {
        const saved = await createFor(
            [{ ID: ANN, Name: 'Ann' }, { ID: BEN, Name: 'Ben' }, { ID: CAT, Name: 'Cat' }],
            [
                { ID: 'ann-reports', UserID: ANN.toUpperCase(), ApplicationID: APP.toUpperCase(), Sequence: 5 },
                { ID: 'ben-other', UserID: BEN.toUpperCase(), ApplicationID: OTHER_APP, Sequence: 20 },
                { ID: 'ben-other-2', UserID: BEN, ApplicationID: OTHER_APP, Sequence: 30 },
                { ID: 'cat-other', UserID: CAT, ApplicationID: OTHER_APP, Sequence: 10 },
            ],
        );

        // Ann already has it. Ben's 20 is taken, so his goes after his highest (30). Cat's 20 is free.
        expect(saved).toEqual([
            { UserID: BEN, ApplicationID: APP, Sequence: 31, IsActive: true },
            { UserID: CAT, ApplicationID: APP, Sequence: 20, IsActive: true },
        ]);
    });
});
