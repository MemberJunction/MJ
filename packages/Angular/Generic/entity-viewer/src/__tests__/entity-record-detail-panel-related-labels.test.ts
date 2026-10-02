/**
 * @fileoverview Two foreign keys to one entity are two record sets, and must read as two.
 *
 * The panel renders one related-records grid per relationship and labelled each with the bare
 * `RelatedEntity` name, so an Invoice with `BillToContactID` and `ShipToContactID` showed two
 * grids both titled "Contacts" with different counts and nothing to tell them apart. The same
 * name was also the `@for` track key, which is a duplicate key (NG0955) and lets Angular reuse
 * the wrong DOM node between the two.
 *
 * Collapsing them into one grid — which the bare label implies — would be DATA LOSS. The fix is
 * the labels, using CodeGen's existing rule (`generateRelatedEntityTabName` in
 * `packages/CodeGenLib/src/Angular/angular-codegen.ts`).
 */
import { describe, it, expect } from 'vitest';
import type { EntityInfo, EntityFieldInfo, EntityRelationshipInfo } from '@memberjunction/core';

import { EntityRecordDetailPanelComponent } from '../lib/entity-record-detail-panel/entity-record-detail-panel.component';

const CONTACTS_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const ORDERS_ID = 'aaaaaaaa-0000-4000-8000-000000000002';

function field(name: string, displayName: string): EntityFieldInfo {
    return { Name: name, DisplayNameOrName: displayName } as unknown as EntityFieldInfo;
}

function contactsEntity(): EntityInfo {
    return {
        ID: CONTACTS_ID,
        Name: 'Contacts',
        DisplayNameOrName: 'Contacts',
        Fields: [
            field('ID', 'ID'),
            field('BillToInvoiceID', 'Bill To Invoice'),
            field('ShipToInvoiceID', 'Ship To Invoice'),
        ],
    } as unknown as EntityInfo;
}

function ordersEntity(): EntityInfo {
    return {
        ID: ORDERS_ID,
        Name: 'Orders',
        DisplayNameOrName: 'Sales Orders',
        Fields: [field('ID', 'ID'), field('InvoiceID', 'Invoice')],
    } as unknown as EntityInfo;
}

function relationship(
    id: string,
    relatedEntityID: string,
    relatedEntity: string,
    joinField: string,
    displayName: string | null = null,
): EntityRelationshipInfo {
    return {
        ID: id,
        RelatedEntityID: relatedEntityID,
        RelatedEntity: relatedEntity,
        RelatedEntityJoinField: joinField,
        DisplayName: displayName,
    } as unknown as EntityRelationshipInfo;
}

interface PanelHarness {
    displayNames(relationships: EntityRelationshipInfo[]): string[];
    rowKey(rel: EntityRelationshipInfo): string;
}

function buildPanel(entities: EntityInfo[]): PanelHarness {
    const component = Object.create(EntityRecordDetailPanelComponent.prototype) as EntityRecordDetailPanelComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        metadata: { Entities: entities },
    });
    const priv = component as unknown as {
        buildRelatedEntityDisplayNames(relationships: EntityRelationshipInfo[]): string[];
        relationshipRowKey(rel: EntityRelationshipInfo): string;
    };
    return {
        displayNames: priv.buildRelatedEntityDisplayNames.bind(component),
        rowKey: priv.relationshipRowKey.bind(component),
    };
}

describe('buildRelatedEntityDisplayNames — disambiguation', () => {
    it('uses the entity display name when only one relationship targets it', () => {
        const panel = buildPanel([contactsEntity(), ordersEntity()]);

        expect(panel.displayNames([relationship('r1', ORDERS_ID, 'Orders', 'InvoiceID')]))
            .toEqual(['Sales Orders']);
    });

    it('appends the FK field name when TWO relationships target the same entity', () => {
        const panel = buildPanel([contactsEntity(), ordersEntity()]);

        const names = panel.displayNames([
            relationship('r1', CONTACTS_ID, 'Contacts', 'BillToInvoiceID'),
            relationship('r2', CONTACTS_ID, 'Contacts', 'ShipToInvoiceID'),
        ]);

        expect(names).toEqual(['Contacts (Bill To Invoice)', 'Contacts (Ship To Invoice)']);
        expect(new Set(names).size).toBe(2);
    });

    it('leaves a single-relationship target alone in a MIXED list', () => {
        const panel = buildPanel([contactsEntity(), ordersEntity()]);

        expect(panel.displayNames([
            relationship('r1', CONTACTS_ID, 'Contacts', 'BillToInvoiceID'),
            relationship('r2', CONTACTS_ID, 'Contacts', 'ShipToInvoiceID'),
            relationship('r3', ORDERS_ID, 'Orders', 'InvoiceID'),
        ])).toEqual(['Contacts (Bill To Invoice)', 'Contacts (Ship To Invoice)', 'Sales Orders']);
    });

    it('honours an explicit relationship DisplayName over everything else', () => {
        const panel = buildPanel([contactsEntity(), ordersEntity()]);

        expect(panel.displayNames([
            relationship('r1', CONTACTS_ID, 'Contacts', 'BillToInvoiceID', 'Billing Contacts'),
            relationship('r2', CONTACTS_ID, 'Contacts', 'ShipToInvoiceID'),
        ])).toEqual(['Billing Contacts', 'Contacts (Ship To Invoice)']);
    });

    it('strips SQL brackets from the join field, as CodeGen does', () => {
        const panel = buildPanel([contactsEntity(), ordersEntity()]);

        expect(panel.displayNames([
            relationship('r1', CONTACTS_ID, 'Contacts', '[BillToInvoiceID]'),
            relationship('r2', CONTACTS_ID, 'Contacts', '[ShipToInvoiceID]'),
        ])).toEqual(['Contacts (Bill To Invoice)', 'Contacts (Ship To Invoice)']);
    });

    it('falls back to the raw join field name when the entity has no such field', () => {
        const panel = buildPanel([contactsEntity(), ordersEntity()]);

        expect(panel.displayNames([
            relationship('r1', CONTACTS_ID, 'Contacts', 'LegacyInvoiceID'),
            relationship('r2', CONTACTS_ID, 'Contacts', 'ShipToInvoiceID'),
        ])).toEqual(['Contacts (LegacyInvoiceID)', 'Contacts (Ship To Invoice)']);
    });

    it('falls back to the technical entity name when the entity is absent from metadata', () => {
        const panel = buildPanel([]);

        expect(panel.displayNames([relationship('r1', ORDERS_ID, 'Orders', 'InvoiceID')]))
            .toEqual(['Orders']);
    });

    it('treats differently-cased copies of one entity id as the SAME target', () => {
        // UUIDs reach the client in whatever case the provider wrote. Two spellings of one id
        // would otherwise each look like a single, unambiguous relationship — and produce two
        // identical labels again.
        const panel = buildPanel([contactsEntity()]);

        const names = panel.displayNames([
            relationship('r1', CONTACTS_ID.toUpperCase(), 'Contacts', 'BillToInvoiceID'),
            relationship('r2', CONTACTS_ID.toLowerCase(), 'Contacts', 'ShipToInvoiceID'),
        ]);

        expect(new Set(names).size).toBe(2);
    });
});

describe('relationshipRowKey — a unique @for track key', () => {
    it('is distinct for two relationships to the same entity', () => {
        const panel = buildPanel([contactsEntity()]);
        const a = relationship('r1', CONTACTS_ID, 'Contacts', 'BillToInvoiceID');
        const b = relationship('r2', CONTACTS_ID, 'Contacts', 'ShipToInvoiceID');

        // The old track expression, for contrast: both rows had the same relatedEntityName.
        expect(a.RelatedEntity).toBe(b.RelatedEntity);
        expect(panel.rowKey(a)).not.toBe(panel.rowKey(b));
    });

    it('is the relationship id when there is one', () => {
        const panel = buildPanel([contactsEntity()]);
        expect(panel.rowKey(relationship('r1', CONTACTS_ID, 'Contacts', 'BillToInvoiceID'))).toBe('r1');
    });

    it('stays distinct even when the relationship carries no id', () => {
        const panel = buildPanel([contactsEntity()]);
        const a = relationship(null as unknown as string, CONTACTS_ID, 'Contacts', 'BillToInvoiceID');
        const b = relationship(null as unknown as string, CONTACTS_ID, 'Contacts', 'ShipToInvoiceID');

        expect(panel.rowKey(a)).not.toBe(panel.rowKey(b));
    });
});
