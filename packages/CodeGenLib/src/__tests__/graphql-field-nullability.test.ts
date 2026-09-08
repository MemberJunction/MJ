/**
 * Output-type nullability is keyed to whether field-level security can strip a field, NOT to the
 * column's NOT NULL constraint.
 *
 * The two say different things: NOT NULL is "no ROW stores an empty value here", while a GraphQL
 * `!` is "every RESPONSE carries a value here". They coincided only while every caller saw every
 * column. FLS omits denied fields, and GraphQL treats an absent value on a non-nullable field as
 * an error that propagates to the nearest nullable parent — nulling the whole record on a
 * single-record load and failing the mutation response after the write already landed.
 *
 * These tests lock the rule so a future edit cannot quietly restore `AllowsNull` as the source.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../Config/config', () => ({
    mjCoreSchema: '__mj',
    resolveEntityPackageName: () => 'mj_generatedentities',
}));

import { GraphQLServerGeneratorBase } from '../Misc/graphql_server_codegen';
import { Metadata, ReadableFieldsTransportKey } from '@memberjunction/core';

/**
 * `IsUnrestrictableField` is a getter on the real `EntityFieldInfo` (primary key, soft primary
 * key, or a `__mj_` name). These fixtures duck-type it directly — matching the harness style in
 * the sibling GraphQL codegen tests — so the generator's DECISION is what is under test here.
 * That the getter itself resolves those three cases is covered in MJCore.
 */
function field(
    name: string,
    opts: { allowsNull?: boolean; unrestrictable?: boolean; type?: string } = {},
) {
    return {
        Name: name,
        CodeName: name,
        Type: opts.type ?? 'nvarchar',
        AllowsNull: opts.allowsNull ?? false,
        IsUnrestrictableField: opts.unrestrictable ?? false,
        MaxLength: 0,
        Description: '',
        Sequence: 1,
        IsVirtual: false,
        __mj_CreatedAt: new Date(0),
    };
}

const ID_FIELD = field('ID', { allowsNull: false, unrestrictable: true, type: 'uniqueidentifier' });
const SYSTEM_FIELD = field('__mj_CreatedAt', { allowsNull: false, unrestrictable: true, type: 'datetimeoffset' });
/** NOT NULL in the database, but restrictable — the case that used to break. */
const NAME_FIELD = field('Name', { allowsNull: false });
/** Already nullable — should be unchanged by any of this. */
const INDUSTRY_FIELD = field('Industry', { allowsNull: true });

const ENTITY = {
    Name: 'Clients',
    ClassName: 'Client',
    BaseTable: 'Client',
    BaseTableCodeName: 'Client',
    BaseView: 'vwClients',
    SchemaName: 'flsdemo',
    Description: '',
    IncludeInAPI: true,
    ExternalDataSourceID: null,
    AllowCreateAPI: false,
    AllowUpdateAPI: false,
    AllowDeleteAPI: false,
    Fields: [ID_FIELD, NAME_FIELD, INDUSTRY_FIELD, SYSTEM_FIELD],
    FirstPrimaryKey: ID_FIELD,
    PrimaryKeys: [ID_FIELD],
    RelatedEntities: [],
    _floatCount: 0,
};

function generate(): string {
    return new GraphQLServerGeneratorBase().generateServerEntityString(ENTITY as never, false, 'flsdemo', false);
}

/** The generated declaration line for a field, from the object type. */
function declarationFor(out: string, fieldName: string): string {
    const match = out.match(new RegExp(`@Field\\(([^)]*)\\)[^@]*?\\n\\s*${fieldName}(\\??):`));
    if (!match) throw new Error(`No generated declaration found for '${fieldName}'`);
    return match[0];
}

describe('GraphQL codegen: output-type nullability follows FLS strippability, not NOT NULL', () => {
    beforeEach(() => {
        vi.spyOn(Metadata.prototype, 'Entities', 'get').mockReturnValue([ENTITY] as never);
        vi.spyOn(Metadata.prototype, 'EntityByName').mockImplementation(((n: string) =>
            ENTITY.Name.toLowerCase() === n.toLowerCase() ? ENTITY : undefined) as never);
    });

    it('marks a NOT NULL but restrictable column nullable', () => {
        // The regression this whole change exists for: `Name` is nvarchar NOT NULL, and denying
        // read on it used to null out the entire record for that user.
        const decl = declarationFor(generate(), 'Name');
        expect(decl).toContain('nullable: true');
        expect(decl).toMatch(/Name\?:/);
    });

    it('keeps primary keys non-nullable', () => {
        const decl = declarationFor(generate(), 'ID');
        expect(decl).not.toContain('nullable: true');
        expect(decl).toMatch(/ID:/);
    });

    it('keeps __mj_ system columns non-nullable', () => {
        const decl = declarationFor(generate(), '_mj__CreatedAt');
        expect(decl).not.toContain('nullable: true');
    });

    it('leaves an already-nullable column nullable', () => {
        const decl = declarationFor(generate(), 'Industry');
        expect(decl).toContain('nullable: true');
    });

    it('emits the field-security transport field on the object type', () => {
        // Present on EVERY entity, not only FLS-enabled ones: the schema is a build artifact and
        // EnableFieldLevelSecurity is runtime metadata an admin can toggle without re-running
        // CodeGen, so a shape that depended on it would be silently wrong the moment they did.
        const out = generate();
        expect(out).toContain(`${ReadableFieldsTransportKey}?: string[];`);
        expect(out).toMatch(new RegExp(`@Field\\(\\(\\) => \\[String\\], \\{ nullable: true`));
    });
});
