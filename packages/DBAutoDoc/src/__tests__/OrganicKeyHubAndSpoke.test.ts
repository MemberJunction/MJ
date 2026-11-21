import { describe, it, expect } from 'vitest';
import { TranslateClusters, DetectedOrganicKeysOutput, TransitiveSpokeInput } from '../discovery/OrganicKeyTranslator.js';
import { compose } from '../discovery/Composer.js';
import { OrganicKeyCluster, OrganicKeyClusterMember } from '../types/organic-keys.js';

/**
 * #4538: organic keys were emitted as all-pairs cliques. Every member of a cluster got every other
 * member as a related entity, so spokes grew with the square of cluster size. 61% of the pairs on
 * one production deployment were co-references: two tables that both hold a customer key,
 * many-to-many, which multiply rows when joined. A key is now emitted hub-and-spoke around the
 * members that own the value as their table's primary key.
 */

function member(table: string, column: string, isPrimaryKey = false): OrganicKeyClusterMember {
    return { schema: 'app', table, column, participatesInFK: false, fkTarget: null, isPrimaryKey };
}

function cluster(concept: string, members: OrganicKeyClusterMember[]): OrganicKeyCluster {
    return { id: concept, concept, normalization: 'ExactMatch', members, confidence: 0.9, reasoning: `${concept} shared`, maxIntraDistance: 0.05 } as OrganicKeyCluster;
}

/** `table -> [related tables]` for every emitted key. */
function links(output: DetectedOrganicKeysOutput): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const tables of Object.values(output)) {
        for (const entry of tables) {
            result[entry.TableName] = entry.OrganicKeys.flatMap(k => k.RelatedEntities.map(r => r.TableName)).sort();
        }
    }
    return result;
}

describe('TranslateClusters, hub and spoke', () => {
    const customer = cluster('customer id', [
        member('customer', 'cst_key', true),
        member('orders', 'ord_cst_key'),
        member('invoice', 'inv_cst_key'),
        member('registration', 'reg_cst_key'),
    ]);

    it('links the owning table to every other member, and each other member only back to it', () => {
        expect(links(TranslateClusters([customer]))).toEqual({
            customer: ['invoice', 'orders', 'registration'],
            orders: ['customer'],
            invoice: ['customer'],
            registration: ['customer'],
        });
    });

    it('never links two non-owning tables to each other', () => {
        const l = links(TranslateClusters([customer]));
        expect(l.orders).not.toContain('invoice');
        expect(l.invoice).not.toContain('registration');
    });

    it('grows spokes linearly with cluster size, not with its square', () => {
        const members = [member('customer', 'id', true), ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(t => member(t, 'customer_id'))];
        const spokeCount = Object.values(links(TranslateClusters([cluster('customer', members)]))).reduce((n, r) => n + r.length, 0);
        // 10 members: all-pairs was 10 × 9 = 90; hub-and-spoke is 2 × 9 = 18
        expect(spokeCount).toBe(18);
    });

    it('links two owning tables (one-to-one) to each other and to every other member', () => {
        const l = links(TranslateClusters([cluster('horse id', [member('horse', 'id', true), member('horse_profile', 'horse_id', true), member('transfer', 'horse_id')])]));
        expect(l.horse).toEqual(['horse_profile', 'transfer']);
        expect(l.horse_profile).toEqual(['horse', 'transfer']);
        expect(l.transfer).toEqual(['horse', 'horse_profile']);
    });

    it('skips a concept no member owns as a primary key, and reports it', () => {
        const skipped: Array<[string, number]> = [];
        const output = TranslateClusters([cluster('email', [member('contact', 'email'), member('lead', 'email'), member('signup', 'email')])], [], {
            OnUnanchored: (concept, members) => skipped.push([concept, members]),
        });
        expect(output).toEqual({});
        expect(skipped).toEqual([['Email Match', 3]]);
    });
});

describe('compose', () => {
    it('reports concepts skipped for having no primary-key owner', async () => {
        const result = await compose([
            cluster('email', [member('contact', 'email'), member('lead', 'email')]),
            cluster('customer id', [member('customer', 'id', true), member('orders', 'customer_id')]),
        ], [], null);
        expect(result.SkippedUnanchored).toBe(1);
        expect(result.Summary.outputSpokes).toBe(2);
    });
});

describe('TranslateClusters, transitive spokes', () => {
    function bridge(hubTable: string, hubColumn: string, spokeTable: string): TransitiveSpokeInput {
        return {
            hubSchema: 'app', hubTable, hubKeyFields: [hubColumn], spokeSchema: 'app', spokeTable,
            transitiveView: { Name: `vw${spokeTable}_${hubColumn}_bridge`, SchemaName: 'app', SQL: 'SELECT 1' },
            transitiveMatchFieldNames: [hubColumn], transitiveOutputFieldName: 'k', relatedEntityJoinFieldName: 'k', hubConcept: 'customer',
        };
    }
    const customer = cluster('customer id', [member('customer', 'cst_key', true), member('orders', 'ord_cst_key'), member('registration', 'reg_cst_key')]);

    function transitiveLinks(output: DetectedOrganicKeysOutput): string[] {
        return Object.values(output).flatMap(tables => tables.flatMap(t =>
            t.OrganicKeys.flatMap(k => k.RelatedEntities.filter(r => r.TransitiveView).map(r => `${t.TableName}->${r.TableName}`))));
    }

    it('gives a non-hub owner no transitive spokes (they would be co-references)', () => {
        // found in a live run: orders reached registration through a bridge over the customer key
        const out = TranslateClusters([customer], [bridge('orders', 'ord_cst_key', 'registration'), bridge('registration', 'reg_cst_key', 'orders')]);
        expect(transitiveLinks(out)).toEqual([]);
    });

    it('keeps a hub owner\'s transitive spoke to a table it does not reach directly', () => {
        const out = TranslateClusters([customer], [bridge('customer', 'cst_key', 'invoice')]);
        expect(transitiveLinks(out)).toEqual(['customer->invoice']);
    });

    it('does not add a transitive spoke to a table already linked directly', () => {
        const out = TranslateClusters([customer], [bridge('customer', 'cst_key', 'orders')]);
        expect(transitiveLinks(out)).toEqual([]);
        expect(links(out).customer).toEqual(['orders', 'registration']);
    });
});
