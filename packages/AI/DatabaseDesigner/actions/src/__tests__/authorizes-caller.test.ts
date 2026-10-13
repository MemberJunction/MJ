/**
 * The Database Designer actions declare `AuthorizesCaller`: Create, Modify and Validate Entity check
 * the caller's Schema Management authorization themselves, and Describe Entity and List My Entities
 * read with the caller's permissions. The public `RunAction` mutation therefore lets any
 * authenticated user run them without an `MJ: Action Authorizations` link, and these checks decide.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    Metadata: vi.fn(),
    RunView: vi.fn(),
    AuthorizationEvaluator: vi.fn(),
    LogError: vi.fn(),
    UserInfo: vi.fn(),
}));
vi.mock('@memberjunction/database-designer-core', () => ({
    DatabaseSchemaValidationService: vi.fn(),
    AUTHORIZATIONS: {},
    UDT_SCHEMA_NAME: '__mj_UDT',
    DatabaseDesignerPipelineExecutor: {},
}));
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    LogError: vi.fn(),
    UUIDsEqual: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
    EscapeSQLString: (v: string) => v.replace(/'/g, "''"),
}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/schema-engine', () => ({}));

import { CreateEntityAction } from '../actions/create-entity.action';
import { ModifyEntityAction } from '../actions/modify-entity.action';
import { ValidateEntitySchemaAction } from '../actions/validate-entity-schema.action';
import { DescribeEntityAction } from '../actions/describe-entity.action';
import { ListMyEntitiesAction } from '../actions/list-entities.action';

describe('Database Designer actions authorize their own caller', () => {
    it.each([
        ['Create Entity', CreateEntityAction],
        ['Modify Entity', ModifyEntityAction],
        ['Validate Entity Schema', ValidateEntitySchemaAction],
        ['Describe Entity', DescribeEntityAction],
        ['List My Entities', ListMyEntitiesAction],
    ])('%s declares AuthorizesCaller', (_name, actionClass) => {
        expect(actionClass.AuthorizesCaller).toBe(true);
    });
});
