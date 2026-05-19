import { describe, it, expect } from 'vitest';
import { CheckUnresolvedEmissions } from '../CheckUnresolvedEmissions.js';
import type { MetadataFile } from '../types.js';

/** Helper: build a minimal MetadataFile with one IO whose APIPath we control. */
function buildMetadata(ioAPIPath: string, extraFields: Record<string, unknown> = {}): MetadataFile {
    return {
        fields: {
            Name: 'TestVendor',
            ClassName: 'TestVendorConnector',
        },
        relatedEntities: {
            'MJ: Integration Objects': [
                {
                    fields: {
                        Name: 'test_io',
                        APIPath: ioAPIPath,
                        ...extraFields,
                    },
                    relatedEntities: {
                        'MJ: Integration Object Fields': [
                            {
                                fields: {
                                    Name: 'id',
                                    Type: 'string',
                                    IsPrimaryKey: true,
                                },
                            },
                        ],
                    },
                },
            ],
        },
    };
}

describe('CheckUnresolvedEmissions', () => {
    describe('clean metadata (no placeholders)', () => {
        it('passes when no fields contain placeholders', () => {
            const m = buildMetadata('/crm/v3/objects/contacts');
            const result = CheckUnresolvedEmissions(m);
            expect(result.Status).toBe('Pass');
            expect(result.Failures).toHaveLength(0);
        });

        it('passes on mj-sync reference shorthands (those are not catalog abstractions)', () => {
            const m = buildMetadata('/api/v1/things', {
                CredentialTypeID: '@lookup:MJ: Credential Types.Name=API Key',
                Configuration: '@file:configuration.json',
                ParentID: '@parent:ID',
                RootID: '@root:ID',
            });
            const result = CheckUnresolvedEmissions(m);
            expect(result.Status).toBe('Pass');
            expect(result.Failures).toHaveLength(0);
        });
    });

    describe('brace template {var}', () => {
        it('rejects single brace placeholder in APIPath', () => {
            const m = buildMetadata('/crm/v3/objects/{objectType}');
            const result = CheckUnresolvedEmissions(m);
            expect(result.Status).toBe('Fail');
            expect(result.Failures).toHaveLength(1);
            expect(result.Failures[0].Failure).toContain("token '{objectType}'");
            expect(result.Failures[0].Failure).toContain("field 'APIPath'");
            expect(result.Failures[0].Failure).toContain("IO 'test_io'");
        });

        it('rejects multiple brace placeholders in same string', () => {
            const m = buildMetadata('/crm/v4/associations/{fromObjectType}/{toObjectType}/types');
            const result = CheckUnresolvedEmissions(m);
            expect(result.Status).toBe('Fail');
            expect(result.Failures).toHaveLength(2);
            const tokens = result.Failures.map((f) => f.Failure.match(/token '([^']+)'/)?.[1]).sort();
            expect(tokens).toEqual(['{fromObjectType}', '{toObjectType}']);
        });
    });

    describe('angle placeholder <var>', () => {
        it('rejects angle-bracket placeholder', () => {
            const m = buildMetadata('/v1/users/<userId>/profile');
            const result = CheckUnresolvedEmissions(m);
            expect(result.Status).toBe('Fail');
            expect(result.Failures).toHaveLength(1);
            expect(result.Failures[0].Failure).toContain("token '<userId>'");
        });
    });

    describe('Express-style colon :var', () => {
        it('rejects :var preceded by /', () => {
            const m = buildMetadata('/api/users/:userId/posts');
            const result = CheckUnresolvedEmissions(m);
            expect(result.Status).toBe('Fail');
            expect(result.Failures).toHaveLength(1);
            expect(result.Failures[0].Failure).toContain("token ':userId'");
        });

        it('does NOT match :var that is not preceded by / (e.g., protocol)', () => {
            const m = buildMetadata('https://api.example.com/v1/things');
            const result = CheckUnresolvedEmissions(m);
            expect(result.Status).toBe('Pass');
        });
    });

    describe('handlebars {{var}}', () => {
        it('rejects handlebars placeholder', () => {
            const m = buildMetadata('/tenants/{{tenantId}}/data');
            const result = CheckUnresolvedEmissions(m);
            expect(result.Status).toBe('Fail');
            // Handlebars should fire once for {{tenantId}}, NOT additionally for {tenantId}.
            expect(result.Failures).toHaveLength(1);
            expect(result.Failures[0].Failure).toContain("token '{{tenantId}}'");
        });
    });

    describe('combined patterns', () => {
        it('rejects mixed syntaxes in same string', () => {
            const m = buildMetadata('/{prefix}/<scope>/:id/{{tenant}}');
            const result = CheckUnresolvedEmissions(m);
            expect(result.Status).toBe('Fail');
            const tokens = result.Failures
                .map((f) => f.Failure.match(/token '([^']+)'/)?.[1])
                .sort();
            expect(tokens).toEqual(['/:id', '/<scope>', '/{prefix}', '/{{tenant}}'].map(s => s.slice(1)).sort());
        });
    });

    describe('placeholders in IOF fields', () => {
        it('catches placeholders in IOF strings too', () => {
            const m: MetadataFile = {
                fields: { Name: 'Vendor', ClassName: 'VendorConnector' },
                relatedEntities: {
                    'MJ: Integration Objects': [
                        {
                            fields: { Name: 'thing', APIPath: '/things' },
                            relatedEntities: {
                                'MJ: Integration Object Fields': [
                                    {
                                        fields: {
                                            Name: 'id',
                                            Type: '{customType}',  // placeholder in Type
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            const result = CheckUnresolvedEmissions(m);
            expect(result.Status).toBe('Fail');
            expect(result.Failures[0].Location).toBe('metadata.IO[thing].IOF[id].Type');
        });
    });

    describe('rejection message discipline', () => {
        it('says WHAT is unresolved without saying HOW to resolve', () => {
            const m = buildMetadata('/crm/v4/associations/{fromObjectType}/{toObjectType}/types');
            const result = CheckUnresolvedEmissions(m);
            for (const failure of result.Failures) {
                // Says WHAT
                expect(failure.Failure).toMatch(/unresolved structure/i);
                expect(failure.Failure).toMatch(/token '/);
                // Does NOT say HOW
                expect(failure.Failure).not.toMatch(/cartesian/i);
                expect(failure.Failure).not.toMatch(/enumerate/i);
                expect(failure.Failure).not.toMatch(/cross-product/i);
                expect(failure.Failure).not.toMatch(/multiple instances/i);
                expect(failure.Failure).not.toMatch(/each pair/i);
                expect(failure.Failure).not.toMatch(/N x M/i);
                expect(failure.Failure).not.toMatch(/example:/i);
                // SuggestedFix is empty per directive
                expect(failure.SuggestedFix).toBe('');
            }
        });
    });
});
