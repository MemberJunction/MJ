/**
 * Tests for OfferTemplateUser (manifest `templateUser`): after install, the installer gets their own
 * copy of the app's template user, and optionally every later first sign-in does too. Never throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRunView, mockClone, mockSetNewUserTemplate, savedUser } = vi.hoisted(() => ({
    mockRunView: vi.fn(),
    mockClone: vi.fn(),
    mockSetNewUserTemplate: vi.fn(),
    savedUser: { current: null as Record<string, unknown> | null },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, RunView: { FromMetadataProvider: () => ({ RunView: mockRunView }) } };
});
vi.mock('@memberjunction/record-cloning', () => ({
    RecordCloneEngine: class {
        Clone = mockClone;
    },
}));
vi.mock('../install/config-manager.js', () => ({ SetNewUserTemplate: mockSetNewUserTemplate }));

import { OfferTemplateUser, NamesFromEmail, TEMPLATE_USER_ENV, type TemplateUserContext } from '../install/template-user.js';
import type { MJAppManifest } from '../manifest/manifest-schema.js';

const manifest = (templateUser?: MJAppManifest['templateUser']) =>
    ({ name: 'more-cheese-demo', displayName: 'More Cheese', templateUser }) as MJAppManifest;

function makeContext(callbacks: TemplateUserContext['Callbacks'] = {}): TemplateUserContext & { Callbacks: NonNullable<TemplateUserContext['Callbacks']> } {
    const user: Record<string, unknown> = {};
    const entity = {
        Load: vi.fn(async (id: string) => {
            user.ID = id;
            return true;
        }),
        Save: vi.fn(async () => {
            savedUser.current = { ...user, IsActive: (entity as { IsActive?: boolean }).IsActive };
            return true;
        }),
        LatestResult: null,
    };
    return {
        DatabaseProvider: { GetEntityObject: vi.fn(async () => entity) } as unknown as TemplateUserContext['DatabaseProvider'],
        ContextUser: { ID: 'system', Type: 'Owner' } as TemplateUserContext['ContextUser'],
        RepoRoot: '/repo',
        Callbacks: { OnWarn: vi.fn(), OnLog: vi.fn(), OnSuccess: vi.fn(), OnProgress: vi.fn(), ...callbacks },
    };
}

/** RunView answers: the template row, and whether the installer's email is already taken. */
function users({ template = { ID: 'tpl-id', IsTemplate: true }, taken = false }: { template?: { ID: string; IsTemplate: boolean } | null; taken?: boolean } = {}) {
    mockRunView.mockImplementation(async (params: { ExtraFilter: string }) => {
        if (params.ExtraFilter.includes('demo.user@morecheese.org')) return { Success: true, Results: template ? [template] : [] };
        return { Success: true, Results: taken ? [{ ID: 'existing', IsTemplate: false }] : [] };
    });
}

const cloned = { Success: true, Warnings: [], RecordsCloned: 175, Roots: [{ TargetKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'new-id' }] } }] };
const spec = { email: 'demo.user@morecheese.org', description: 'dashboards and conversations' };

describe('OfferTemplateUser', () => {
    const savedEnv = { ...process.env };
    beforeEach(() => {
        vi.clearAllMocks();
        savedUser.current = null;
        for (const key of Object.values(TEMPLATE_USER_ENV)) delete process.env[key];
        mockClone.mockResolvedValue(cloned);
        mockSetNewUserTemplate.mockReturnValue({ Success: true });
    });
    afterEach(() => {
        process.env = { ...savedEnv };
    });

    it('does nothing for an app without a template user', async () => {
        const ctx = makeContext();
        await OfferTemplateUser(manifest(undefined), ctx);
        expect(mockRunView).not.toHaveBeenCalled();
    });

    it('creates an active copy for the installer named in the environment', async () => {
        users();
        process.env[TEMPLATE_USER_ENV.Email] = 'jane.doe@example.com';
        const ctx = makeContext();

        await OfferTemplateUser(manifest(spec), ctx);

        expect(mockClone).toHaveBeenCalledWith(
            expect.objectContaining({
                EntityName: 'MJ: Users',
                Preset: 'template',
                PromptedValues: { Email: 'jane.doe@example.com', FirstName: 'Jane', LastName: 'Doe' },
            }),
            ctx.ContextUser
        );
        expect(savedUser.current).toEqual(expect.objectContaining({ ID: 'new-id', IsActive: true }));
        expect(ctx.Callbacks.OnSuccess).toHaveBeenCalled();
    });

    it('asks for the email, first and last name in an interactive install', async () => {
        users();
        const OnPromptInput = vi.fn()
            .mockResolvedValueOnce('sam@example.com')
            .mockResolvedValueOnce('Sam')
            .mockResolvedValueOnce('Rivera');
        const ctx = makeContext({ OnPromptInput, OnPromptConfirm: vi.fn(async () => false) });

        await OfferTemplateUser(manifest(spec), ctx);

        expect(OnPromptInput.mock.calls[0][0]).toContain('dashboards and conversations');
        expect(mockClone.mock.calls[0][0].PromptedValues).toEqual({ Email: 'sam@example.com', FirstName: 'Sam', LastName: 'Rivera' });
    });

    it('skips the copy, with a hint, when the installer leaves the email empty', async () => {
        users();
        const ctx = makeContext({ OnPromptInput: vi.fn(async () => ''), OnPromptConfirm: vi.fn(async () => false) });

        await OfferTemplateUser(manifest(spec), ctx);

        expect(mockClone).not.toHaveBeenCalled();
        expect(ctx.Callbacks.OnLog?.mock.calls.flat().join(' ')).toContain('mj user clone --from demo.user@morecheese.org');
    });

    it('never copies onto an existing user', async () => {
        users({ taken: true });
        process.env[TEMPLATE_USER_ENV.Email] = 'jane@example.com';
        const ctx = makeContext();

        await OfferTemplateUser(manifest(spec), ctx);

        expect(mockClone).not.toHaveBeenCalled();
        expect(ctx.Callbacks.OnWarn?.mock.calls.flat().join(' ')).toContain('already has a user');
    });

    it('warns and skips when the template user is missing or not flagged', async () => {
        users({ template: { ID: 'tpl-id', IsTemplate: false } });
        process.env[TEMPLATE_USER_ENV.Email] = 'jane@example.com';
        const ctx = makeContext();

        await OfferTemplateUser(manifest(spec), ctx);

        expect(mockClone).not.toHaveBeenCalled();
        expect(ctx.Callbacks.OnWarn?.mock.calls.flat().join(' ')).toContain('not marked IsTemplate');
    });

    it('warns instead of throwing when the copy fails', async () => {
        users();
        process.env[TEMPLATE_USER_ENV.Email] = 'jane@example.com';
        mockClone.mockResolvedValue({ Success: false, ResultCode: 'BLOCKED', Warnings: [{ Severity: 'Error', Message: 'needs Clone Records' }] });
        const ctx = makeContext();

        await expect(OfferTemplateUser(manifest(spec), ctx)).resolves.toBeUndefined();
        expect(ctx.Callbacks.OnWarn?.mock.calls.flat().join(' ')).toContain('needs Clone Records');
    });

    describe('template for later sign-ins', () => {
        beforeEach(() => users());

        it('sets it when the installer agrees to the offer', async () => {
            const ctx = makeContext({ OnPromptInput: vi.fn(async () => ''), OnPromptConfirm: vi.fn(async () => true) });
            await OfferTemplateUser(manifest(spec), ctx);
            expect(mockSetNewUserTemplate).toHaveBeenCalledWith('/repo', 'demo.user@morecheese.org', 'template', undefined);
        });

        it('leaves it unset in a non-interactive install that did not ask for it', async () => {
            await OfferTemplateUser(manifest(spec), makeContext());
            expect(mockSetNewUserTemplate).not.toHaveBeenCalled();
        });

        it('follows MJ_INSTALL_TEMPLATE_FOR_NEW_USERS in a non-interactive install', async () => {
            process.env[TEMPLATE_USER_ENV.ForNewUsers] = '1';
            await OfferTemplateUser(manifest(spec), makeContext());
            expect(mockSetNewUserTemplate).toHaveBeenCalled();
        });

        it("honours the manifest's newUsers: always / never", async () => {
            await OfferTemplateUser(manifest({ ...spec, newUsers: 'always' }), makeContext());
            expect(mockSetNewUserTemplate).toHaveBeenCalledTimes(1);
            const confirm = vi.fn(async () => true);
            await OfferTemplateUser(manifest({ ...spec, newUsers: 'never' }), makeContext({ OnPromptInput: vi.fn(async () => ''), OnPromptConfirm: confirm }));
            expect(confirm).not.toHaveBeenCalled();
            expect(mockSetNewUserTemplate).toHaveBeenCalledTimes(1);
        });
    });
});

describe('NamesFromEmail', () => {
    it('guesses names from the local part', () => {
        expect(NamesFromEmail('jane.doe@example.com')).toEqual({ FirstName: 'Jane', LastName: 'Doe' });
        expect(NamesFromEmail('sam@example.com')).toEqual({ FirstName: 'Sam', LastName: 'User' });
    });
});
