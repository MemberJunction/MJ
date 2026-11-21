/**
 * The saved query that `CreateQueryExtended` / `UpdateQueryExtended` return is mapped for the
 * CALLER. These mutations are reachable with the `query:create` / `query:update` API-key scopes,
 * not only by the system user, and the record they return is the one just saved, whose re-read
 * holds every column. Mapping it with no context user skipped the field-security projection
 * altogether, so the caller received columns its roles may not read.
 *
 * The base resolver is stubbed with the real projection (`ProjectValuesForCaller`) standing in
 * for its field mapping, so what is pinned is the identity the result is mapped for.
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
vi.mock('../generated/generated.js', async () => {
    const { ProjectValuesForCaller } = await import('../generic/fieldSecurityTransport.js');
    const { EmployeeEntity, NoRecordChangesMetadata } = await import('./fieldSecurityFixtures.js');
    return {
        MJQuery_: class {}, MJQueryField_: class {}, MJQueryParameter_: class {}, MJQueryEntity_: class {}, MJQueryPermission_: class {},
        MJQueryResolver: class {
            protected async MapFieldNamesToCodeNames(_entityName: string, values: Record<string, unknown>, contextUser?: unknown) {
                return ProjectValuesForCaller(EmployeeEntity(), values, contextUser as never, NoRecordChangesMetadata);
            }
        },
    };
});

import { MJQueryResolverExtended } from '../resolvers/QuerySystemUserResolver.js';
import { FullWidthEmployeeRow, Intern, NoRecordChangesMetadata, SECRET_SALARY } from './fieldSecurityFixtures.js';

describe('QuerySystemUserResolver: the saved query is mapped for the caller', () => {
    it('REGRESSION: buildSuccessResult never returns a column the caller may not read', async () => {
        const build = (MJQueryResolverExtended.prototype as unknown as {
            buildSuccessResult(entity: unknown, user: unknown, provider: unknown): Promise<{ Query: Record<string, unknown> }>;
        }).buildSuccessResult;
        const entity = { GetAll: () => FullWidthEmployeeRow(), QueryFields: [], QueryParameters: [], QueryEntities: [], QueryPermissions: [] };

        const result = await build.call(new MJQueryResolverExtended(), entity, Intern(), NoRecordChangesMetadata);

        expect(JSON.stringify(result.Query)).not.toContain(String(SECRET_SALARY));
        expect(result.Query).toMatchObject({ ID: 'emp-1', Name: 'Ada' });
    });
});
