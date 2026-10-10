/**
 * `Template.Run` renders a stored template on demand for whoever invokes it. The generic remote
 * operation resolver only checks API-key scope (a no-op for JWT, magic-link and widget sessions)
 * and the operation's own `Authorize` hook. These tests pin that the hook refuses scope-limited
 * sessions and callers who cannot read templates, before the operation loads anything.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityInfo, Metadata, UserInfo, UserRoleInfo, type IMetadataProvider } from '@memberjunction/core';
import { TemplateRunServerOperation } from '../operations/TemplateRunOperation';

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
 * Metadata plus the one data call the operation makes first. The data call fails on purpose, so
 * a test can tell whether the operation got past authorization without needing a database.
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

async function runAs(user: UserInfo, provider: FakeProvider) {
    // Authorize receives no provider, so the operation reads entity permissions from the global metadata.
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(provider as unknown as IMetadataProvider);
    return new TemplateRunServerOperation().ExecuteServer(
        { templateID: TEMPLATE_ID },
        { provider: provider as unknown as IMetadataProvider, user, emitProgress: () => undefined },
    );
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('Template.Run authorization', () => {
    it('refuses an anonymous magic-link guest before loading the template', async () => {
        const provider = new FakeProvider(readableEverywhere());
        const guest = makeUser([UI_ROLE_ID]);
        guest.IsMagicLinkAnonymous = true;

        const result = await runAs(guest, provider);

        expect(result).toMatchObject({ Success: false, ResultCode: 'FORBIDDEN' });
        expect(provider.EntityObjectRequests).toEqual([]);
    });

    it('refuses a resource-scoped magic-link session before loading the template', async () => {
        const provider = new FakeProvider(readableEverywhere());
        const scoped = makeUser([UI_ROLE_ID]);
        scoped.MagicLinkScope = { ResourceID: '0b9b7b55-0000-4000-8000-0000000000d1', ResourceType: 'Dashboards' };

        const result = await runAs(scoped, provider);

        expect(result).toMatchObject({ Success: false, ResultCode: 'FORBIDDEN' });
        expect(provider.EntityObjectRequests).toEqual([]);
    });

    it('refuses a user without read permission on MJ: Templates', async () => {
        const provider = new FakeProvider(readableEverywhere());

        const result = await runAs(makeUser([]), provider);

        expect(result).toMatchObject({ Success: false, ResultCode: 'FORBIDDEN' });
        expect(provider.EntityObjectRequests).toEqual([]);
    });

    it('refuses a user who can read templates but not template content', async () => {
        const provider = new FakeProvider([
            entityReadableBy('MJ: Templates', [UI_ROLE_ID]),
            entityReadableBy('MJ: Template Contents', []),
        ]);

        const result = await runAs(makeUser([UI_ROLE_ID]), provider);

        expect(result).toMatchObject({ Success: false, ResultCode: 'FORBIDDEN' });
        expect(provider.EntityObjectRequests).toEqual([]);
    });

    it('lets a user who can read templates and their content through to the template load', async () => {
        const provider = new FakeProvider(readableEverywhere());

        const result = await runAs(makeUser([UI_ROLE_ID]), provider);

        expect(result).toMatchObject({ Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: 'reached data access for MJ: Templates' });
        expect(provider.EntityObjectRequests).toEqual(['MJ: Templates']);
    });
});
