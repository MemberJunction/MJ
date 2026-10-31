/**
 * The child rows `CreateQueryExtended` / `UpdateQueryExtended` return are mapped column by column
 * from the saved query's rows. A column left out of that mapping reaches the client as `null`
 * whatever is stored, so every column the GraphQL types carry must be mapped: a field's
 * nullability, entity-field source and `schema.object` source, a parameter's server-set flag and
 * a Query Entities row's alternate base view.
 */
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

vi.mock('type-graphql', () => {
    const decoratorFactory = (..._args: unknown[]) => (..._decorated: unknown[]) => undefined;
    const exportNames = ['Arg', 'Ctx', 'Field', 'InputType', 'Mutation', 'ObjectType', 'Resolver', 'PubSub', 'Int', 'Float'];
    return { ...Object.fromEntries(exportNames.map((name) => [name, decoratorFactory])), registerEnumType: () => undefined };
});
vi.mock('@memberjunction/core-entities-server', () => ({ MJQueryEntityServer: class {} }));
vi.mock('../generic/DeleteOptionsInput.js', () => ({ DeleteOptionsInput: class {} }));
vi.mock('../generated/generated.js', () => ({
    MJQuery_: class {}, MJQueryField_: class {}, MJQueryParameter_: class {}, MJQueryEntity_: class {}, MJQueryPermission_: class {},
    MJQueryResolver: class {
        protected async MapFieldNamesToCodeNames(_entityName: string, values: Record<string, unknown>) {
            return values;
        }
    },
}));

import { MJQueryResolverExtended } from '../resolvers/QuerySystemUserResolver.js';

type MappedRows = { Fields: Record<string, unknown>[]; Parameters: Record<string, unknown>[]; Entities: Record<string, unknown>[] };

const STAMP = new Date('2026-10-28T00:00:00Z');

const FIELD = {
    ID: 'field-1', QueryID: 'query-1', Query: 'Q', Name: 'UserName', Description: 'The name.', Sequence: 1, SQLBaseType: 'nvarchar', SQLFullType: 'nvarchar(100)',
    SourceEntityID: 'entity-users', SourceEntity: 'MJ: Users', SourceFieldName: 'Name', SourceEntityFieldID: 'field-users-name', SourceEntityField: 'Name',
    SourceObjectName: null, IsNullable: false, IsComputed: false, ComputationDescription: null, IsSummary: false, SummaryDescription: null,
    DetectionMethod: 'Database', AutoDetectConfidenceScore: null, __mj_CreatedAt: STAMP, __mj_UpdatedAt: STAMP,
};

const OBJECT_FIELD = { ...FIELD, ID: 'field-2', Name: 'Code', SourceEntityID: null, SourceEntity: null, SourceEntityFieldID: null, SourceEntityField: null, SourceFieldName: 'Code', SourceObjectName: 'fixture.Customer', IsNullable: true };

const PARAMETER = {
    ID: 'parameter-1', QueryID: 'query-1', Query: 'Q', Name: 'OwnerID', Description: null, Type: 'string', IsRequired: true, DefaultValue: null, SampleValue: null,
    ValidationFilters: null, IsServerSet: true, DetectionMethod: 'Manual', AutoDetectConfidenceScore: null, __mj_CreatedAt: STAMP, __mj_UpdatedAt: STAMP,
};

const ENTITY = {
    ID: 'link-1', QueryID: 'query-1', Query: 'Q', EntityID: 'entity-users', Entity: 'MJ: Users', AlternateBaseViewID: 'abv-active', AlternateBaseView: 'Active Users',
    DetectionMethod: 'Parser', AutoDetectConfidenceScore: 1, __mj_CreatedAt: STAMP, __mj_UpdatedAt: STAMP,
};

async function mapped(): Promise<MappedRows> {
    const build = (MJQueryResolverExtended.prototype as unknown as {
        buildSuccessResult(entity: unknown, user: unknown, provider: unknown): Promise<MappedRows>;
    }).buildSuccessResult;
    const entity = { GetAll: () => ({ ID: 'query-1' }), QueryFields: [FIELD, OBJECT_FIELD], QueryParameters: [PARAMETER], QueryEntities: [ENTITY], QueryPermissions: [] };
    return build.call(new MJQueryResolverExtended(), entity, {}, {});
}

describe('QuerySystemUserResolver: the saved query\'s child rows are returned with every column', () => {
    it('returns a field\'s nullability and its entity-field source', async () => {
        const { Fields } = await mapped();
        expect(Fields[0]).toMatchObject({ IsNullable: false, SourceEntityFieldID: 'field-users-name', SourceEntityField: 'Name', SourceObjectName: null });
    });

    it('returns the schema.object source of a field no entity backs', async () => {
        const { Fields } = await mapped();
        expect(Fields[1]).toMatchObject({ IsNullable: true, SourceObjectName: 'fixture.Customer', SourceEntityFieldID: null });
    });

    it('returns a parameter\'s server-set flag', async () => {
        const { Parameters } = await mapped();
        expect(Parameters[0]).toMatchObject({ IsServerSet: true });
    });

    it('returns a Query Entities row\'s alternate base view', async () => {
        const { Entities } = await mapped();
        expect(Entities[0]).toMatchObject({ AlternateBaseViewID: 'abv-active', AlternateBaseView: 'Active Users' });
    });
});
