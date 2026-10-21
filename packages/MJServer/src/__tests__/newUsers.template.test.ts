/**
 * Tests for userHandling.newUserTemplate: NewUserBase.createNewUser builds the new user as a copy of a
 * template user through the record-cloning engine, and falls back to a plain user whenever the template
 * can't be used (missing, not flagged IsTemplate, or the copy fails), so sign-in never breaks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    mockConfig,
    mockClone,
    mockRunView,
    mockLogError,
    mockProvider,
    savedUsers,
} = vi.hoisted(() => {
    const savedUsers: Array<Record<string, unknown>> = [];
    const makeUser = () => {
        const user: Record<string, unknown> & { NewRecord: () => void; Load: (id: string) => Promise<boolean>; Save: () => Promise<boolean> } = {
            NewRecord: vi.fn(() => {
                user.ID = 'plain-user-id';
                user.Created = 'plain';
            }),
            Load: vi.fn(async (id: string) => {
                user.ID = id;
                user.Created = 'template';
                return true;
            }),
            Save: vi.fn(async () => {
                savedUsers.push({ ...user });
                return true;
            }),
            LatestResult: null,
        };
        return user;
    };
    return {
        mockConfig: {
            userHandling: {
                newUserRoles: [] as string[],
                CreateUserApplicationRecords: false,
                UserApplications: [] as string[],
                contextUserForNewUserCreation: '',
                newUserTemplate: { email: 'demo@example.org', preset: 'template' } as { email: string; preset: string } | undefined,
            },
        },
        mockClone: vi.fn(),
        mockRunView: vi.fn(),
        mockLogError: vi.fn(),
        mockProvider: {
            GetEntityObject: vi.fn(async () => makeUser()),
            BeginTransaction: vi.fn(),
            CommitTransaction: vi.fn(),
            RollbackTransaction: vi.fn(),
            Roles: [],
            Applications: [],
        },
        savedUsers,
    };
});

vi.mock('../config.js', () => ({ configInfo: mockConfig }));
vi.mock('../isolatedProvider.js', () => ({ CreateIsolatedProvider: vi.fn(async () => mockProvider) }));
vi.mock('../auth/principals.js', () => ({ ResolveConfiguredPrincipal: vi.fn(() => ({ ID: 'system-id', Type: 'Owner' })) }));
vi.mock('@memberjunction/record-cloning', () => ({
    RecordCloneEngine: class {
        Clone = mockClone;
    },
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: { FromMetadataProvider: () => ({ RunView: mockRunView }) },
        LogError: mockLogError,
        LogStatus: vi.fn(),
    };
});
vi.mock('@memberjunction/core-entities', () => ({ UserInfoEngine: { GetDefaultApplicationsForNewUser: () => [] } }));

import { NewUserBase } from '../auth/newUsers.js';

const templateRow = (isTemplate: boolean) => ({ Success: true, Results: [{ ID: 'tpl-id', IsTemplate: isTemplate }] });
const cloned = { Success: true, ResultCode: 'SUCCESS', Warnings: [], RecordsCloned: 120, Roots: [{ EntityName: 'MJ: Users', SourceKey: { KeyValuePairs: [] }, TargetKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'new-user-id' }] } }] };

describe('NewUserBase.createNewUser with newUserTemplate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        savedUsers.length = 0;
        mockConfig.userHandling.newUserTemplate = { email: 'demo@example.org', preset: 'template' };
    });

    it('creates the user as an active copy of the template', async () => {
        mockRunView.mockResolvedValue(templateRow(true));
        mockClone.mockResolvedValue(cloned);

        const user = await new NewUserBase().createNewUser('Jane', 'Doe', 'jane@example.com');

        expect(mockClone).toHaveBeenCalledWith(
            expect.objectContaining({
                EntityName: 'MJ: Users',
                SourceRecordKey: expect.objectContaining({ KeyValuePairs: [expect.objectContaining({ FieldName: 'ID', Value: 'tpl-id' })] }),
                Preset: 'template',
                PromptedValues: { Email: 'jane@example.com', FirstName: 'Jane', LastName: 'Doe' },
            }),
            expect.objectContaining({ ID: 'system-id' })
        );
        expect(user?.ID).toBe('new-user-id');
        expect(savedUsers).toEqual([expect.objectContaining({ ID: 'new-user-id', Created: 'template', IsActive: true, LinkedRecordType: 'None' })]);
        expect(mockProvider.BeginTransaction).not.toHaveBeenCalled();
    });

    it('falls back to a plain user when the template user is not flagged IsTemplate', async () => {
        mockRunView.mockResolvedValue(templateRow(false));

        const user = await new NewUserBase().createNewUser('Jane', 'Doe', 'jane@example.com');

        expect(mockClone).not.toHaveBeenCalled();
        expect(mockLogError.mock.calls.flat().join(' ')).toContain('not marked as a template user');
        expect(user?.ID).toBe('plain-user-id');
        expect(savedUsers[0]).toEqual(expect.objectContaining({ Created: 'plain', Email: 'jane@example.com', IsActive: true }));
    });

    it('falls back to a plain user when no user has the template email', async () => {
        mockRunView.mockResolvedValue({ Success: true, Results: [] });

        const user = await new NewUserBase().createNewUser('Jane', 'Doe', 'jane@example.com');

        expect(mockClone).not.toHaveBeenCalled();
        expect(user?.ID).toBe('plain-user-id');
    });

    it('falls back to a plain user when the copy is blocked', async () => {
        mockRunView.mockResolvedValue(templateRow(true));
        mockClone.mockResolvedValue({ Success: false, ResultCode: 'BLOCKED', Warnings: [{ Severity: 'Error', Code: 'FORBIDDEN', Message: 'needs Clone Records' }] });

        const user = await new NewUserBase().createNewUser('Jane', 'Doe', 'jane@example.com');

        expect(mockLogError.mock.calls.flat().join(' ')).toContain('needs Clone Records');
        expect(user?.ID).toBe('plain-user-id');
    });

    it('creates a plain user, as before, when no template is configured', async () => {
        mockConfig.userHandling.newUserTemplate = undefined;

        const user = await new NewUserBase().createNewUser('Jane', 'Doe', 'jane@example.com');

        expect(mockRunView).not.toHaveBeenCalled();
        expect(mockClone).not.toHaveBeenCalled();
        expect(user?.ID).toBe('plain-user-id');
    });
});
