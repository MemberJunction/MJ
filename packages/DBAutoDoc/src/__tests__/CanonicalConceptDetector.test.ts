import { describe, it, expect } from 'vitest';
import {
    CanonicalConceptDetector,
    DEFAULT_CANONICAL_CATALOG,
} from '../discovery/CanonicalConceptDetector.js';
import type { DetectorInputColumn } from '../discovery/OrganicKeyClusterDetector.js';

function col(
    schema: string,
    table: string,
    column: string,
    overrides: Partial<DetectorInputColumn> = {},
): DetectorInputColumn {
    return {
        schema,
        table,
        column,
        dataType: 'nvarchar(255)',
        description: '',
        isPrimaryKey: false,
        participatesInFK: false,
        ...overrides,
    };
}

describe('CanonicalConceptDetector', () => {
    describe('default catalog coverage', () => {
        it('includes the canonical PR #2193 organic-key concepts', () => {
            const conceptNames = DEFAULT_CANONICAL_CATALOG.map((c) => c.conceptName);
            expect(conceptNames).toContain('email_address');
            expect(conceptNames).toContain('phone_number');
            expect(conceptNames).toContain('url_or_domain');
            expect(conceptNames).toContain('postal_code');
            expect(conceptNames).toContain('iso_country_code');
            expect(conceptNames).toContain('currency_code');
            expect(conceptNames).toContain('tax_identifier');
        });

        it('every concept has at least one name pattern', () => {
            for (const c of DEFAULT_CANONICAL_CATALOG) {
                expect(c.namePatterns.length).toBeGreaterThan(0);
            }
        });
    });

    describe('email_address', () => {
        const d = new CanonicalConceptDetector();

        it('matches common email column names', () => {
            expect(d.matchColumn(col('S', 'T', 'Email'))?.conceptName).toBe('email_address');
            expect(d.matchColumn(col('S', 'T', 'EmailAddress'))?.conceptName).toBe('email_address');
            expect(d.matchColumn(col('S', 'T', 'PrimaryEmail'))?.conceptName).toBe('email_address');
            expect(d.matchColumn(col('S', 'T', 'Email1'))?.conceptName).toBe('email_address');
            expect(d.matchColumn(col('S', 'T', 'recipient_email'))?.conceptName).toBe('email_address');
        });

        it('matches via description even when column name is generic', () => {
            const c = col('S', 'T', 'Value', { description: 'The contact email address' });
            expect(d.matchColumn(c)?.conceptName).toBe('email_address');
        });

        it('rejects boolean-style "Email" flags by data type', () => {
            const c = col('S', 'T', 'EmailEnabled', { dataType: 'bit' });
            expect(d.matchColumn(c)).toBeNull();
        });

        it('rejects very short string types as too narrow for an email', () => {
            const c = col('S', 'T', 'Email', { dataType: 'nvarchar(10)' });
            expect(d.matchColumn(c)).toBeNull();
        });
    });

    describe('phone_number', () => {
        const d = new CanonicalConceptDetector();

        it('matches common phone column names', () => {
            expect(d.matchColumn(col('S', 'T', 'Phone'))?.conceptName).toBe('phone_number');
            expect(d.matchColumn(col('S', 'T', 'PhoneNumber'))?.conceptName).toBe('phone_number');
            expect(d.matchColumn(col('S', 'T', 'HomePhone'))?.conceptName).toBe('phone_number');
            expect(d.matchColumn(col('S', 'T', 'cell_phone'))?.conceptName).toBe('phone_number');
            expect(d.matchColumn(col('S', 'T', 'Fax'))?.conceptName).toBe('phone_number');
            expect(d.matchColumn(col('S', 'T', 'Tel'))?.conceptName).toBe('phone_number');
        });

        it('assigns the custom phone-normalization expression', () => {
            const match = d.matchColumn(col('S', 'T', 'Phone'));
            expect(match?.normalization).toBe('Custom');
            expect(match?.customNormalizationExpression).toContain("REPLACE");
        });
    });

    describe('url_or_domain', () => {
        const d = new CanonicalConceptDetector();

        it('matches URL / domain / website columns', () => {
            expect(d.matchColumn(col('S', 'T', 'URL'))?.conceptName).toBe('url_or_domain');
            expect(d.matchColumn(col('S', 'T', 'Website'))?.conceptName).toBe('url_or_domain');
            expect(d.matchColumn(col('S', 'T', 'DomainName'))?.conceptName).toBe('url_or_domain');
            expect(d.matchColumn(col('S', 'T', 'home_page'))?.conceptName).toBe('url_or_domain');
        });
    });

    describe('iso_country_code', () => {
        const d = new CanonicalConceptDetector();

        it('matches country code column names', () => {
            expect(d.matchColumn(col('S', 'T', 'CountryCode', { dataType: 'nvarchar(3)' }))?.conceptName).toBe('iso_country_code');
            expect(d.matchColumn(col('S', 'T', 'CountryRegionCode', { dataType: 'nvarchar(3)' }))?.conceptName).toBe('iso_country_code');
            expect(d.matchColumn(col('S', 'T', 'iso_country', { dataType: 'nvarchar(2)' }))?.conceptName).toBe('iso_country_code');
        });
    });

    describe('tax_identifier', () => {
        const d = new CanonicalConceptDetector();

        it('matches tax / SSN / EIN column names', () => {
            expect(d.matchColumn(col('S', 'T', 'TaxID'))?.conceptName).toBe('tax_identifier');
            expect(d.matchColumn(col('S', 'T', 'SSN'))?.conceptName).toBe('tax_identifier');
            expect(d.matchColumn(col('S', 'T', 'EIN'))?.conceptName).toBe('tax_identifier');
            expect(d.matchColumn(col('S', 'T', 'VATNumber'))?.conceptName).toBe('tax_identifier');
            expect(d.matchColumn(col('S', 'T', 'SocialSecurityNumber'))?.conceptName).toBe('tax_identifier');
        });

        it('uses dash/space-stripping normalization', () => {
            const match = d.matchColumn(col('S', 'T', 'TaxID'));
            expect(match?.normalization).toBe('Custom');
            expect(match?.customNormalizationExpression).toContain("REPLACE");
        });
    });

    describe('detect() — bulk pipeline behavior', () => {
        const d = new CanonicalConceptDetector();

        it('groups multiple email columns into ONE canonical cluster', () => {
            const cols = [
                col('Sales', 'Customer', 'EmailAddress'),
                col('Sales', 'Lead', 'Email'),
                col('Support', 'Ticket', 'ContactEmail'),
            ];
            const r = d.detect(cols);
            expect(r.canonicalClusters).toHaveLength(1);
            expect(r.canonicalClusters[0].concept).toBe('email_address');
            expect(r.canonicalClusters[0].members).toHaveLength(3);
            expect(r.matchedColumnCount).toBe(3);
            expect(r.residual).toHaveLength(0);
        });

        it('emits SEPARATE clusters for different canonical concepts', () => {
            const cols = [
                col('S', 'T1', 'Email'),
                col('S', 'T2', 'Email'),
                col('S', 'T3', 'Phone'),
                col('S', 'T4', 'Phone'),
            ];
            const r = d.detect(cols);
            expect(r.canonicalClusters).toHaveLength(2);
            const names = r.canonicalClusters.map((c) => c.concept).sort();
            expect(names).toEqual(['email_address', 'phone_number']);
        });

        it('returns columns to residual when concept has only 1 matching column', () => {
            // Single email column across the schema → can't form a cluster, falls back
            const cols = [
                col('S', 'T1', 'Email'),
                col('S', 'T2', 'CustomerID'),
                col('S', 'T3', 'ProductID'),
            ];
            const r = d.detect(cols);
            expect(r.canonicalClusters).toHaveLength(0); // 1 email is degenerate
            expect(r.residual).toHaveLength(3); // all 3 fall through to clustering
        });

        it('returns columns to residual when all matches are in one table', () => {
            const cols = [
                col('S', 'T1', 'PrimaryEmail'),
                col('S', 'T1', 'SecondaryEmail'),
                col('S', 'T1', 'WorkEmail'),
            ];
            const r = d.detect(cols);
            expect(r.canonicalClusters).toHaveLength(0); // all in one table
            expect(r.residual).toHaveLength(3);
        });

        it('non-matching columns flow through to residual', () => {
            const cols = [
                col('S', 'T1', 'Email'),
                col('S', 'T2', 'Email'),
                col('S', 'T3', 'BusinessEntityID'),
                col('S', 'T4', 'BusinessEntityID'),
            ];
            const r = d.detect(cols);
            expect(r.canonicalClusters).toHaveLength(1);
            expect(r.canonicalClusters[0].concept).toBe('email_address');
            expect(r.residual).toHaveLength(2);
            expect(r.residual.every((c) => c.column === 'BusinessEntityID')).toBe(true);
        });

        it('preserves FK metadata on canonical-cluster members', () => {
            const cols = [
                col('S', 'T1', 'CountryCode', {
                    dataType: 'nvarchar(3)',
                    participatesInFK: true,
                    fkTarget: { schema: 'Lookup', table: 'Country', column: 'Code' },
                }),
                col('S', 'T2', 'CountryCode', {
                    dataType: 'nvarchar(3)',
                    participatesInFK: true,
                    fkTarget: { schema: 'Lookup', table: 'Country', column: 'Code' },
                }),
            ];
            const r = d.detect(cols);
            expect(r.canonicalClusters).toHaveLength(1);
            const cluster = r.canonicalClusters[0];
            expect(cluster.members[0].participatesInFK).toBe(true);
            expect(cluster.members[0].fkTarget?.table).toBe('Country');
            expect(cluster.tags).toContain('fk-redundant-single-target');
        });
    });

    describe('structural tagging', () => {
        const d = new CanonicalConceptDetector();

        it('tags no-fk-no-pk when no member has FK or PK', () => {
            const cols = [col('S', 'T1', 'Email'), col('S', 'T2', 'Email')];
            const r = d.detect(cols);
            expect(r.canonicalClusters[0].tags).toContain('no-fk-no-pk');
        });

        it('tags fk-fragmented when members FK to different targets', () => {
            const cols = [
                col('S', 'T1', 'CountryCode', {
                    dataType: 'nvarchar(3)',
                    participatesInFK: true,
                    fkTarget: { schema: 'L', table: 'A', column: 'Code' },
                }),
                col('S', 'T2', 'CountryCode', {
                    dataType: 'nvarchar(3)',
                    participatesInFK: true,
                    fkTarget: { schema: 'L', table: 'B', column: 'Code' },
                }),
            ];
            const r = d.detect(cols);
            expect(r.canonicalClusters[0].tags).toContain('fk-fragmented');
        });

        it('tags mixed when some members FK and others do not', () => {
            const cols = [
                col('S', 'T1', 'CountryCode', {
                    dataType: 'nvarchar(3)',
                    participatesInFK: true,
                    fkTarget: { schema: 'L', table: 'A', column: 'Code' },
                }),
                col('S', 'T2', 'CountryCode', { dataType: 'nvarchar(3)' }),
            ];
            const r = d.detect(cols);
            expect(r.canonicalClusters[0].tags).toContain('mixed');
        });
    });

    describe('canonical-match output shape', () => {
        const d = new CanonicalConceptDetector();

        it('assigns the per-concept normalization strategy', () => {
            const r = d.detect([col('S', 'T1', 'Email'), col('S', 'T2', 'Email')]);
            expect(r.canonicalClusters[0].normalization).toBe('LowerCaseTrim');

            const r2 = d.detect([col('S', 'T1', 'Phone'), col('S', 'T2', 'Phone')]);
            expect(r2.canonicalClusters[0].normalization).toBe('Custom');
            expect(r2.canonicalClusters[0].customNormalizationExpression).toContain("REPLACE");
        });

        it('sets high confidence (>= 0.95) on canonical clusters', () => {
            const r = d.detect([col('S', 'T1', 'Email'), col('S', 'T2', 'Email')]);
            expect(r.canonicalClusters[0].confidence).toBeGreaterThanOrEqual(0.95);
        });

        it('assigns stable canonical IDs (canonical_N pattern)', () => {
            const r = d.detect([
                col('S', 'T1', 'Email'),
                col('S', 'T2', 'Email'),
                col('S', 'T3', 'Phone'),
                col('S', 'T4', 'Phone'),
            ]);
            expect(r.canonicalClusters.every((c) => /^canonical_\d+$/.test(c.id))).toBe(true);
        });
    });

    describe('custom catalog override', () => {
        it('accepts a custom catalog without using defaults', () => {
            const custom = new CanonicalConceptDetector([
                {
                    conceptName: 'order_reference',
                    normalization: 'ExactMatch',
                    namePatterns: [/^order_ref$/i],
                    reasoning: 'Custom test concept.',
                },
            ]);
            // Should match custom concept
            expect(custom.matchColumn(col('S', 'T', 'order_ref'))?.conceptName).toBe('order_reference');
            // Should NOT match defaults
            expect(custom.matchColumn(col('S', 'T', 'Email'))).toBeNull();
        });
    });
});
