/**
 * `CreateQueryExtended` / `UpdateQueryExtended`: a query-permission row that is not saved or not
 * deleted fails the mutation with the entity's own reason, instead of reporting success.
 *
 * The provider is a stub; permission rows are stubs whose Save / Delete report failure on demand.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunViewParams } from '@memberjunction/core';
import { QueryEngine } from '@memberjunction/core-entities';

vi.mock('type-graphql', () => {
    const decoratorFactory = (..._args: unknown[]) => (..._decorated: unknown[]) => undefined;
    const exportNames = ['Arg', 'Ctx', 'Field', 'InputType', 'Mutation', 'ObjectType', 'Resolver', 'PubSub', 'Int', 'Float'];
    return { ...Object.fromEntries(exportNames.map((name) => [name, decoratorFactory])), registerEnumType: () => undefined };
});
vi.mock('@memberjunction/core-entities-server', () => ({ MJQueryEntityServer: class {} }));
vi.mock('../generic/DeleteOptionsInput.js', () => ({ DeleteOptionsInput: class {} }));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, AssertClientInputWritableForUser: () => undefined, LogStatus: () => undefined, LogError: () => undefined };
});
vi.mock('../generated/generated.js', () => ({
    MJQuery_: class {}, MJQueryField_: class {}, MJQueryParameter_: class {}, MJQueryEntity_: class {}, MJQueryPermission_: class {},
    MJQueryResolver: class {
        protected async CheckAPIKeyScopeAuthorization(): Promise<void> { /* authorized */ }
        protected async AfterCreate(): Promise<void> { /* no event */ }
        protected ListenForEntityMessages(): void { /* no pub/sub */ }
        protected async MapFieldNamesToCodeNames(_entityName: string, values: Record<string, unknown>) { return values; }
    },
}));

import { MJQueryResolverExtended, CreateQuerySystemUserInput, UpdateQuerySystemUserInput } from '../resolvers/QuerySystemUserResolver.js';
import type { AppContext } from '../types.js';

const QUERY_ID = 'Q0000000-0000-0000-0000-000000000001';
const ROLE = 'R0000000-0000-0000-0000-000000000001';
const REFUSED = 'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_QueryPermission_Role".';

/** A query or permission row as the stub provider hands out. */
class StubRecord {
    public ID = '';
    public Name = 'Revenue';
    public CategoryID: string | null = null;
    public QueryID = '';
    public RoleID = '';
    public EntityInfo = {};
    public LatestResult: { Message: string; CompleteMessage: string } | null = null;
    public QueryFields = [];
    public QueryParameters = [];
    public QueryEntities = [];
    public QueryPermissions = [];
    constructor(private readonly entityName: string) {}
    SetMany(): void { /* fields are not inspected */ }
    async Load(id: string): Promise<boolean> { this.ID = id; return true; }
    async Save(): Promise<boolean> {
        if (this.entityName === 'MJ: Query Permissions' && failPermissionSave) {
            this.LatestResult = { Message: REFUSED, CompleteMessage: REFUSED };
            return false;
        }
        if (!this.ID) this.ID = QUERY_ID;
        permissionWrites.push(`${this.entityName}:save`);
        return true;
    }
    GetAll(): Record<string, unknown> { return { ID: this.ID, Name: this.Name }; }
}

let failPermissionSave: boolean;
let permissionWrites: string[];

const provider = {
    async GetEntityObject(entityName: string): Promise<StubRecord> { return new StubRecord(entityName); },
    async RunView(_params: RunViewParams) {
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
    },
    async RunViews(params: RunViewParams[]) {
        return params.map(() => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' }));
    },
};

const context = {
    providers: [{ provider, type: 'Read-Write' }],
    userPayload: { userRecord: { ID: 'user-1', Email: 'u@example.com', UserRoles: [] } },
} as unknown as AppContext;
const pubSub = { publish: async () => undefined } as unknown as Parameters<MJQueryResolverExtended['CreateQueryExtended']>[2];

/** A stored permission row whose Delete fails with the entity's reason. */
function undeletablePermission() {
    return {
        RoleID: ROLE,
        LatestResult: { Message: 'Delete refused by row-level security', CompleteMessage: 'Delete refused by row-level security' },
        Delete: async () => false,
    };
}

beforeEach(() => {
    failPermissionSave = false;
    permissionWrites = [];
    vi.restoreAllMocks();
    vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue({ GetQueryPermissions: () => [] } as unknown as QueryEngine);
});

describe('query permission writes report their failures', () => {
    it('a create whose permission row is not saved fails, naming the query, the role and the reason', async () => {
        failPermissionSave = true;
        const input = Object.assign(new CreateQuerySystemUserInput(), { Name: 'Revenue', SQL: 'SELECT 1 AS One', Permissions: [{ RoleID: ROLE }] });
        const result = await new MJQueryResolverExtended().CreateQueryExtended(input, context, pubSub);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(`Query 'Revenue' (ID ${QUERY_ID}) was created, but its permissions were not`);
        expect(result.ErrorMessage).toContain(`role ${ROLE}: ${REFUSED}`);
    });

    it('an update whose new permission row is not saved fails with the reason', async () => {
        failPermissionSave = true;
        const input = Object.assign(new UpdateQuerySystemUserInput(), { ID: QUERY_ID, Permissions: [{ RoleID: ROLE }] });
        const result = await new MJQueryResolverExtended().UpdateQueryExtended(input, context, pubSub);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe(`Failed to update query permissions: Failed to save the query permission for role ${ROLE}: ${REFUSED}`);
    });

    it('an update whose old permission row is not deleted fails with the reason and saves no new row', async () => {
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue({ GetQueryPermissions: () => [undeletablePermission()] } as unknown as QueryEngine);
        const input = Object.assign(new UpdateQuerySystemUserInput(), { ID: QUERY_ID, Permissions: [{ RoleID: ROLE }] });
        const result = await new MJQueryResolverExtended().UpdateQueryExtended(input, context, pubSub);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe(`Failed to update query permissions: Failed to delete the query permission for role ${ROLE}: Delete refused by row-level security`);
        expect(permissionWrites).not.toContain('MJ: Query Permissions:save');
    });
});
