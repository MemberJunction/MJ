/**
 * Tests for the REST router layer (rest/RESTEndpointHandler.ts).
 *
 * Covers:
 *  - entity resolution + allow/deny listing (isEntityAllowed): wildcards,
 *    schema filters, precedence, and fail-closed behavior for unknown entities,
 *  - the auth guard (extractMJUser → 401) and entity-access middleware (403),
 *  - HTTP status mapping per verb (200/201/204/400/403/404/500),
 *  - batch runViews pre-filtering (no handler call when everything is blocked),
 *  - the error-handling middleware.
 *
 * The CRUD/View implementation modules are mocked at their module boundary
 * (they have their own dedicated suites); @memberjunction/core's Metadata is
 * mocked for entity metadata. Private router methods are reached through the
 * codebase's established narrowly-typed `as unknown as` view pattern
 * (see OAuthCallbackHandler.xss.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type express from 'express';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const {
    mockCrudCreate, mockCrudGet, mockCrudUpdate, mockCrudDelete,
    mockOpsRunView, mockOpsRunViews, mockOpsListEntities,
    mockLogError, mockEntityList,
} = vi.hoisted(() => ({
    mockCrudCreate: vi.fn(),
    mockCrudGet: vi.fn(),
    mockCrudUpdate: vi.fn(),
    mockCrudDelete: vi.fn(),
    mockOpsRunView: vi.fn(),
    mockOpsRunViews: vi.fn(),
    mockOpsListEntities: vi.fn(),
    mockLogError: vi.fn(),
    mockEntityList: [] as Array<{
        Name: string;
        SchemaName: string;
        GetUserPermisions: (u: unknown) => { CanRead: boolean };
        Fields: Array<Record<string, unknown>>;
    }>,
}));

vi.mock('../rest/EntityCRUDHandler.js', () => ({
    EntityCRUDHandler: {
        createEntity: mockCrudCreate,
        getEntity: mockCrudGet,
        updateEntity: mockCrudUpdate,
        deleteEntity: mockCrudDelete,
    },
}));

vi.mock('../rest/ViewOperationsHandler.js', () => ({
    ViewOperationsHandler: {
        runView: mockOpsRunView,
        runViews: mockOpsRunViews,
        listEntities: mockOpsListEntities,
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockMetadata {
        public get Entities() {
            return mockEntityList;
        }
    }
    return {
        ...actual,
        Metadata: MockMetadata,
        LogError: mockLogError,
    };
});

import type { EntityDeleteOptions, RunViewParams, UserInfo } from '@memberjunction/core';
import { RESTEndpointHandler, RESTEndpointHandlerOptions } from '../rest/RESTEndpointHandler.js';

// ─── Internals view + req/res doubles ───────────────────────────────────────

interface HandlerInternals {
    isEntityAllowed(entityName: string): boolean;
    checkEntityAccess(req: express.Request, res: express.Response, next: express.NextFunction): void;
    extractMJUser(req: express.Request, res: express.Response, next: express.NextFunction): void;
    errorHandler(err: Error, req: express.Request, res: express.Response, next: express.NextFunction): void;
    getCurrentUser(req: express.Request, res: express.Response): Promise<void>;
    getEntityList(req: express.Request, res: express.Response): Promise<void>;
    getEntity(req: express.Request, res: express.Response): Promise<void>;
    createEntity(req: express.Request, res: express.Response): Promise<void>;
    updateEntity(req: express.Request, res: express.Response): Promise<void>;
    deleteEntity(req: express.Request, res: express.Response): Promise<void>;
    runView(req: express.Request, res: express.Response): Promise<void>;
    runViews(req: express.Request, res: express.Response): Promise<void>;
    getEntityFieldMetadata(req: express.Request, res: express.Response): Promise<void>;
}

function makeHandler(options: RESTEndpointHandlerOptions = {}): HandlerInternals {
    return new RESTEndpointHandler(options) as unknown as HandlerInternals;
}

const MJ_USER = {
    ID: 'user-1',
    Name: 'Testy',
    Email: 't@example.com',
    FirstName: 'Testy',
    LastName: 'McTester',
    UserRoles: [{ RoleID: 'r1', Role: 'UI', UserID: 'user-1', InternalFlag: 'secret' }],
} as unknown as UserInfo;

interface ReqShape {
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
    mjUser?: UserInfo;
}

function makeReq(shape: ReqShape = {}): express.Request {
    return {
        params: shape.params ?? {},
        query: shape.query ?? {},
        body: shape.body ?? {},
        mjUser: shape.mjUser ?? MJ_USER,
    } as unknown as express.Request;
}

interface CapturedRes {
    res: express.Response;
    statusCode: () => number;
    jsonBody: () => unknown;
    sendCalled: () => boolean;
}

function makeRes(): CapturedRes {
    let status = 200;
    let body: unknown;
    let sent = false;
    const res = {
        status(code: number) {
            status = code;
            return res;
        },
        json(data: unknown) {
            body = data;
            return res;
        },
        send(data?: unknown) {
            sent = true;
            if (data !== undefined) body = data;
            return res;
        },
    };
    return {
        res: res as unknown as express.Response,
        statusCode: () => status,
        jsonBody: () => body,
        sendCalled: () => sent,
    };
}

function registerEntity(name: string, schemaName = 'crm', canRead = true): void {
    mockEntityList.push({
        Name: name,
        SchemaName: schemaName,
        GetUserPermisions: () => ({ CanRead: canRead }),
        Fields: [],
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockEntityList.length = 0;
    registerEntity('Users', 'crm');
    registerEntity('UserRoles', 'crm');
    registerEntity('Secrets', 'vault');
});

// ─── isEntityAllowed: entity resolution + allow/deny lists ─────────────────

describe('RESTEndpointHandler.isEntityAllowed', () => {
    it('fails closed for entities that do not exist in metadata', () => {
        const handler = makeHandler();
        expect(handler.isEntityAllowed('NotARealEntity')).toBe(false);
    });

    it('resolves entities case-insensitively against metadata and allows all by default', () => {
        const handler = makeHandler();
        expect(handler.isEntityAllowed('users')).toBe(true);
        expect(handler.isEntityAllowed('USERS')).toBe(true);
        expect(handler.isEntityAllowed('Secrets')).toBe(true); // no options → everything allowed
    });

    it('blocks entities in excluded schemas (case-insensitive), with schema exclusion taking top precedence', () => {
        const schemaOnly = makeHandler({ excludeSchemas: ['VAULT'] });
        expect(schemaOnly.isEntityAllowed('Secrets')).toBe(false);
        expect(schemaOnly.isEntityAllowed('Users')).toBe(true); // other schemas unaffected

        // Even an explicit entity include cannot override a schema exclusion
        const withInclude = makeHandler({ excludeSchemas: ['vault'], includeEntities: ['secrets'] });
        expect(withInclude.isEntityAllowed('Secrets')).toBe(false);
    });

    it('restricts to included schemas when includeSchemas is set', () => {
        const handler = makeHandler({ includeSchemas: ['crm'] });
        expect(handler.isEntityAllowed('Users')).toBe(true);
        expect(handler.isEntityAllowed('Secrets')).toBe(false);
    });

    it('blocks lowercase exact-name exclusions and wildcard exclusions of any case', () => {
        const lowercase = makeHandler({ excludeEntities: ['secrets'] });
        expect(lowercase.isEntityAllowed('Secrets')).toBe(false);

        const wildcard = makeHandler({ excludeEntities: ['Secret*'] });
        expect(wildcard.isEntityAllowed('Secrets')).toBe(false);
        expect(wildcard.isEntityAllowed('Users')).toBe(true);
    });

    it('SECURITY GAP: a mixed-case exact exclusion silently fails to exclude', () => {
        // isEntityAllowed lowercases the entity name but compares it with === against
        // the RAW configured pattern (only the wildcard branch lowercases patterns).
        // An operator writing excludeEntities: ['Secrets'] — the natural casing —
        // gets NO exclusion. Pinned so a normalization fix flips this test.
        const handler = makeHandler({ excludeEntities: ['Secrets'] });
        expect(handler.isEntityAllowed('Secrets')).toBe(true); // exclusion ineffective!
    });

    it('exclusions override inclusions for the same entity', () => {
        const handler = makeHandler({ includeEntities: ['user*'], excludeEntities: ['userroles'] });
        expect(handler.isEntityAllowed('Users')).toBe(true);
        expect(handler.isEntityAllowed('UserRoles')).toBe(false);
    });

    it('an include list denies everything not on it, with wildcard support', () => {
        const handler = makeHandler({ includeEntities: ['user*'] });
        expect(handler.isEntityAllowed('Users')).toBe(true);
        expect(handler.isEntityAllowed('UserRoles')).toBe(true);
        expect(handler.isEntityAllowed('Secrets')).toBe(false);
    });

    it('SECURITY GAP: a mixed-case exact inclusion fails to include (same raw-pattern comparison)', () => {
        const handler = makeHandler({ includeEntities: ['Users'] });
        expect(handler.isEntityAllowed('Users')).toBe(false); // include list active, but never matches
    });
});

// ─── Middleware ─────────────────────────────────────────────────────────────

describe('RESTEndpointHandler middleware', () => {
    describe('extractMJUser (auth guard)', () => {
        it('returns 401 and stops the chain when upstream auth attached no mjUser', () => {
            const handler = makeHandler();
            const req = { params: {}, query: {}, body: {} } as unknown as express.Request; // no mjUser
            const { res, statusCode, jsonBody } = makeRes();
            const next = vi.fn();

            handler.extractMJUser(req, res, next);

            expect(statusCode()).toBe(401);
            expect(jsonBody()).toEqual({ error: 'Authentication required' });
            expect(next).not.toHaveBeenCalled();
        });

        it('continues without overwriting an existing mjUser', () => {
            const handler = makeHandler();
            const req = makeReq();
            const next = vi.fn();

            handler.extractMJUser(req, makeRes().res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect((req as unknown as Record<string, unknown>)['mjUser']).toBe(MJ_USER);
        });
    });

    describe('checkEntityAccess', () => {
        it('rejects blocked entities with 403 before any handler runs', () => {
            const handler = makeHandler({ excludeEntities: ['secrets'] });
            const req = makeReq({ params: { entityName: 'Secrets' } });
            const { res, statusCode, jsonBody } = makeRes();
            const next = vi.fn();

            handler.checkEntityAccess(req, res, next);

            expect(statusCode()).toBe(403);
            expect(jsonBody()).toMatchObject({
                error: `Access to entity 'Secrets' is not allowed through the REST API`,
            });
            expect(next).not.toHaveBeenCalled();
        });

        it('passes allowed entities through', () => {
            const handler = makeHandler({ excludeEntities: ['secrets'] });
            const next = vi.fn();

            handler.checkEntityAccess(makeReq({ params: { entityName: 'Users' } }), makeRes().res, next);

            expect(next).toHaveBeenCalledTimes(1);
        });

        it('passes through when no entityName param is present', () => {
            const handler = makeHandler({ includeEntities: ['nothing'] });
            const next = vi.fn();

            handler.checkEntityAccess(makeReq({ params: {} }), makeRes().res, next);

            expect(next).toHaveBeenCalledTimes(1);
        });
    });

    describe('errorHandler', () => {
        it('maps UnauthorizedError to 401 Invalid token', () => {
            const handler = makeHandler();
            const err = new Error('bad creds');
            err.name = 'UnauthorizedError';
            const { res, statusCode, jsonBody } = makeRes();

            handler.errorHandler(err, makeReq(), res, vi.fn());

            expect(statusCode()).toBe(401);
            expect(jsonBody()).toEqual({ error: 'Invalid token' });
            expect(mockLogError).toHaveBeenCalledWith(err);
        });

        it('maps any other error to 500 with its message (or a generic fallback)', () => {
            const handler = makeHandler();
            const { res, statusCode, jsonBody } = makeRes();

            handler.errorHandler(new Error('kaboom'), makeReq(), res, vi.fn());
            expect(statusCode()).toBe(500);
            expect(jsonBody()).toEqual({ error: 'kaboom' });

            const bare = makeRes();
            handler.errorHandler(new Error(''), makeReq(), bare.res, vi.fn());
            expect(bare.statusCode()).toBe(500);
            expect(bare.jsonBody()).toEqual({ error: 'Internal server error' });
        });
    });
});

// ─── Verb routes: status mapping + delegation ───────────────────────────────

describe('RESTEndpointHandler entity routes', () => {
    describe('getEntity', () => {
        it('returns the entity JSON on success, forwarding the include list', async () => {
            mockCrudGet.mockResolvedValue({ success: true, entity: { ID: '1', Name: 'Row' } });
            const handler = makeHandler();
            const req = makeReq({ params: { entityName: 'Users', id: '1' }, query: { include: 'Orders,Notes' } });
            const { res, jsonBody, statusCode } = makeRes();

            await handler.getEntity(req, res);

            expect(statusCode()).toBe(200);
            expect(jsonBody()).toEqual({ ID: '1', Name: 'Row' });
            expect(mockCrudGet).toHaveBeenCalledWith('Users', '1', ['Orders', 'Notes'], MJ_USER);
        });

        it('maps "not found" failures to 404 and other failures to 400', async () => {
            const handler = makeHandler();

            mockCrudGet.mockResolvedValue({ success: false, error: 'Users with ID 9 not found' });
            const missing = makeRes();
            await handler.getEntity(makeReq({ params: { entityName: 'Users', id: '9' } }), missing.res);
            expect(missing.statusCode()).toBe(404);

            mockCrudGet.mockResolvedValue({ success: false, error: 'User Testy does not have permission to read Users records' });
            const denied = makeRes();
            await handler.getEntity(makeReq({ params: { entityName: 'Users', id: '9' } }), denied.res);
            expect(denied.statusCode()).toBe(400);
            expect(denied.jsonBody()).toEqual({ error: 'User Testy does not have permission to read Users records' });
        });

        it('returns 500 when the CRUD layer throws', async () => {
            mockCrudGet.mockRejectedValue(new Error('infrastructure down'));
            const handler = makeHandler();
            const { res, statusCode, jsonBody } = makeRes();

            await handler.getEntity(makeReq({ params: { entityName: 'Users', id: '1' } }), res);

            expect(statusCode()).toBe(500);
            expect(jsonBody()).toEqual({ error: 'infrastructure down' });
            expect(mockLogError).toHaveBeenCalled();
        });
    });

    describe('createEntity', () => {
        it('returns 201 with the created entity', async () => {
            mockCrudCreate.mockResolvedValue({ success: true, entity: { ID: 'new-1' } });
            const handler = makeHandler();
            const { res, statusCode, jsonBody } = makeRes();

            await handler.createEntity(makeReq({ params: { entityName: 'Users' }, body: { Name: 'N' } }), res);

            expect(statusCode()).toBe(201);
            expect(jsonBody()).toEqual({ ID: 'new-1' });
            expect(mockCrudCreate).toHaveBeenCalledWith('Users', { Name: 'N' }, MJ_USER);
        });

        it('returns 400 with error + details on failure (including permission denials)', async () => {
            mockCrudCreate.mockResolvedValue({
                success: false,
                error: 'User Testy does not have permission to create Users records',
                details: { code: 'PERM' },
            });
            const handler = makeHandler();
            const { res, statusCode, jsonBody } = makeRes();

            await handler.createEntity(makeReq({ params: { entityName: 'Users' }, body: {} }), res);

            expect(statusCode()).toBe(400);
            expect(jsonBody()).toEqual({
                error: 'User Testy does not have permission to create Users records',
                details: { code: 'PERM' },
            });
        });
    });

    describe('updateEntity', () => {
        it('returns the updated entity on success and maps not-found to 404', async () => {
            const handler = makeHandler();

            mockCrudUpdate.mockResolvedValue({ success: true, entity: { ID: '1', Name: 'Updated' } });
            const ok = makeRes();
            await handler.updateEntity(makeReq({ params: { entityName: 'Users', id: '1' }, body: { Name: 'Updated' } }), ok.res);
            expect(ok.jsonBody()).toEqual({ ID: '1', Name: 'Updated' });
            expect(mockCrudUpdate).toHaveBeenCalledWith('Users', '1', { Name: 'Updated' }, MJ_USER);

            mockCrudUpdate.mockResolvedValue({ success: false, error: 'Users with ID 9 not found' });
            const missing = makeRes();
            await handler.updateEntity(makeReq({ params: { entityName: 'Users', id: '9' }, body: {} }), missing.res);
            expect(missing.statusCode()).toBe(404);

            mockCrudUpdate.mockResolvedValue({ success: false, error: 'Validation failed', details: undefined });
            const invalid = makeRes();
            await handler.updateEntity(makeReq({ params: { entityName: 'Users', id: '1' }, body: {} }), invalid.res);
            expect(invalid.statusCode()).toBe(400);
        });
    });

    describe('deleteEntity', () => {
        it('returns 204 with an empty body on success, parsing delete options from the query string', async () => {
            mockCrudDelete.mockResolvedValue({ success: true });
            const handler = makeHandler();
            const req = makeReq({
                params: { entityName: 'Users', id: '1' },
                query: { options: JSON.stringify({ SkipEntityActions: true, SkipEntityAIActions: 1 }) },
            });
            const { res, statusCode, sendCalled, jsonBody } = makeRes();

            await handler.deleteEntity(req, res);

            expect(statusCode()).toBe(204);
            expect(sendCalled()).toBe(true);
            expect(jsonBody()).toBeUndefined();
            const [entityName, id, options, user] = mockCrudDelete.mock.calls[0] as [string, string, EntityDeleteOptions, UserInfo];
            expect(entityName).toBe('Users');
            expect(id).toBe('1');
            expect(options.SkipEntityActions).toBe(true);
            expect(options.SkipEntityAIActions).toBe(true); // coerced with !!
            expect(user).toBe(MJ_USER);
        });

        it('maps not-found to 404 and other failures to 400', async () => {
            const handler = makeHandler();

            mockCrudDelete.mockResolvedValue({ success: false, error: 'Users with ID 9 not found' });
            const missing = makeRes();
            await handler.deleteEntity(makeReq({ params: { entityName: 'Users', id: '9' } }), missing.res);
            expect(missing.statusCode()).toBe(404);

            mockCrudDelete.mockResolvedValue({ success: false, error: 'User Testy does not have permission to delete Users records' });
            const denied = makeRes();
            await handler.deleteEntity(makeReq({ params: { entityName: 'Users', id: '1' } }), denied.res);
            expect(denied.statusCode()).toBe(400);
        });

        it('returns 500 (not a crash) for malformed options JSON', async () => {
            const handler = makeHandler();
            const { res, statusCode } = makeRes();

            await handler.deleteEntity(
                makeReq({ params: { entityName: 'Users', id: '1' }, query: { options: '{not json' } }),
                res,
            );

            expect(statusCode()).toBe(500);
            expect(mockCrudDelete).not.toHaveBeenCalled();
        });
    });

    describe('getEntityList', () => {
        it('parses query-string filters into RunViewParams for the view layer', async () => {
            mockOpsListEntities.mockResolvedValue({ Success: true, Results: [] });
            const handler = makeHandler();
            const req = makeReq({
                params: { entityName: 'Users' },
                query: { filter: `Status='Active'`, orderBy: 'Name', fields: 'ID,Name', maxRows: '25', startRow: '50' },
            });

            await handler.getEntityList(req, makeRes().res);

            expect(mockOpsListEntities).toHaveBeenCalledWith(
                {
                    EntityName: 'Users',
                    ExtraFilter: `Status='Active'`,
                    OrderBy: 'Name',
                    Fields: ['ID', 'Name'],
                    MaxRows: 25,
                    StartRow: 50,
                },
                MJ_USER,
            );
        });

        it('maps a throwing view layer (e.g. permission denial) to 500', async () => {
            mockOpsListEntities.mockRejectedValue(new Error('does not have permission to read Users records'));
            const handler = makeHandler();
            const { res, statusCode, jsonBody } = makeRes();

            await handler.getEntityList(makeReq({ params: { entityName: 'Users' } }), res);

            expect(statusCode()).toBe(500);
            expect(jsonBody()).toEqual({ error: 'does not have permission to read Users records' });
        });
    });
});

// ─── View routes ────────────────────────────────────────────────────────────

describe('RESTEndpointHandler view routes', () => {
    describe('runView', () => {
        it('merges the route entity name with body params and returns the result', async () => {
            mockOpsRunView.mockResolvedValue({ success: true, result: { Success: true, Results: [{ ID: '1' }] } });
            const handler = makeHandler();
            const req = makeReq({ params: { entityName: 'Users' }, body: { ExtraFilter: `ID='1'`, MaxRows: 10 } });
            const { res, jsonBody } = makeRes();

            await handler.runView(req, res);

            expect(mockOpsRunView).toHaveBeenCalledWith(
                { EntityName: 'Users', ExtraFilter: `ID='1'`, MaxRows: 10 },
                MJ_USER,
            );
            expect(jsonBody()).toEqual({ Success: true, Results: [{ ID: '1' }] });
        });

        it('maps view-layer failures to 400', async () => {
            mockOpsRunView.mockResolvedValue({ success: false, error: 'does not have permission' });
            const handler = makeHandler();
            const { res, statusCode, jsonBody } = makeRes();

            await handler.runView(makeReq({ params: { entityName: 'Users' }, body: {} }), res);

            expect(statusCode()).toBe(400);
            expect(jsonBody()).toEqual({ error: 'does not have permission' });
        });
    });

    describe('runViews (batch)', () => {
        it('rejects a non-array params payload with 400', async () => {
            const handler = makeHandler();
            const { res, statusCode, jsonBody } = makeRes();

            await handler.runViews(makeReq({ body: { params: { EntityName: 'Users' } } }), res);

            expect(statusCode()).toBe(400);
            expect(jsonBody()).toEqual({ error: 'params must be an array of RunViewParams' });
            expect(mockOpsRunViews).not.toHaveBeenCalled();
        });

        it('returns 403 WITHOUT invoking the view layer when every requested entity is blocked', async () => {
            const handler = makeHandler({ includeEntities: ['users'] });
            const { res, statusCode } = makeRes();

            await handler.runViews(
                makeReq({ body: { params: [{ EntityName: 'Secrets' }, { EntityName: 'NotReal' }] } }),
                res,
            );

            expect(statusCode()).toBe(403);
            expect(mockOpsRunViews).not.toHaveBeenCalled();
        });

        it('silently drops blocked entities and executes only the allowed remainder', async () => {
            mockOpsRunViews.mockResolvedValue({ success: true, results: [{ Success: true, Results: [] }] });
            const handler = makeHandler({ excludeEntities: ['secrets'] });
            const req = makeReq({ body: { params: [{ EntityName: 'Users' }, { EntityName: 'Secrets' }] } });
            const { res, jsonBody } = makeRes();

            await handler.runViews(req, res);

            const [filtered, user] = mockOpsRunViews.mock.calls[0] as [RunViewParams[], UserInfo];
            expect(filtered).toEqual([{ EntityName: 'Users' }]);
            expect(user).toBe(MJ_USER);
            expect(jsonBody()).toEqual([{ Success: true, Results: [] }]);
        });

        it('maps view-layer batch failures to 400', async () => {
            mockOpsRunViews.mockResolvedValue({ success: false, error: 'batch failed' });
            const handler = makeHandler();
            const { res, statusCode } = makeRes();

            await handler.runViews(makeReq({ body: { params: [{ EntityName: 'Users' }] } }), res);

            expect(statusCode()).toBe(400);
        });
    });
});

// ─── User + metadata routes ─────────────────────────────────────────────────

describe('RESTEndpointHandler user and metadata routes', () => {
    it('getCurrentUser returns only the safe projection of the user (no extra role fields)', async () => {
        const handler = makeHandler();
        const { res, jsonBody } = makeRes();

        await handler.getCurrentUser(makeReq(), res);

        expect(jsonBody()).toEqual({
            ID: 'user-1',
            Name: 'Testy',
            Email: 't@example.com',
            FirstName: 'Testy',
            LastName: 'McTester',
            UserRoles: [{ RoleID: 'r1', Role: 'UI' }], // InternalFlag stripped
        });
    });

    describe('getEntityFieldMetadata', () => {
        it('404s for unknown entities and 403s when the user cannot read the entity', async () => {
            const handler = makeHandler();

            const missing = makeRes();
            await handler.getEntityFieldMetadata(makeReq({ params: { entityName: 'Nope' } }), missing.res);
            expect(missing.statusCode()).toBe(404);

            registerEntity('Locked', 'crm', false);
            const denied = makeRes();
            await handler.getEntityFieldMetadata(makeReq({ params: { entityName: 'Locked' } }), denied.res);
            expect(denied.statusCode()).toBe(403);
            expect(denied.jsonBody()).toEqual({ error: 'Permission denied' });
        });

        it('returns the mapped field metadata for readable entities', async () => {
            mockEntityList.length = 0;
            mockEntityList.push({
                Name: 'Users',
                SchemaName: 'crm',
                GetUserPermisions: () => ({ CanRead: true }),
                Fields: [{
                    Name: 'ID', DisplayName: 'ID', Description: 'PK', Type: 'uniqueidentifier',
                    AllowsNull: false, IsPrimaryKey: true, IsUnique: true, MaxLength: 16,
                    DefaultValue: null, CodeName: 'ID', TSType: 'string', SecretInternal: 'x',
                }],
            });
            const handler = makeHandler();
            const { res, jsonBody } = makeRes();

            await handler.getEntityFieldMetadata(makeReq({ params: { entityName: 'Users' } }), res);

            expect(jsonBody()).toEqual([{
                Name: 'ID',
                DisplayName: 'ID',
                Description: 'PK',
                Type: 'uniqueidentifier',
                IsRequired: true, // AllowsNull === false
                IsPrimaryKey: true,
                IsUnique: true,
                MaxLength: 16,
                DefaultValue: null,
                CodeName: 'ID',
                TSType: 'string',
            }]);
        });
    });
});
