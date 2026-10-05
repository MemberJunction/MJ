import { describe, it, expect, vi } from 'vitest';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { RegisterClassEx } from '@memberjunction/global';
import type { BaseEntity } from '@memberjunction/core';
import { RenderComponentFixture, QueryAll } from '@memberjunction/ng-test-utils';
import type { ComponentFixture } from '@angular/core/testing';
import { FormFieldPanelSlotComponent } from './form-field-panel-slot.component';
import { BaseFormPanel } from './base-form-panel';
import type { BaseFormComponent } from '../base-form-component';

/**
 * DOM coverage for <mj-form-field-panel-slot>, the host a collapsible panel renders at each end of
 * its fields. It mounts the winning contributions whose `sectionPosition` matches its `Position`
 * and that either name its `SectionKey` (`inSectionKey`) or claim one of its `FieldNames`
 * (`replacesFieldNames`), highest `sortKey` first, then highest priority.
 *
 * The panels below are registered in the process-global ClassFactory under test-only entity names.
 * The record has no EntityInfo, so the slot reads compiled registrations only.
 */

const ENTITY = 'ZZZ_FieldSlotEntity';

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-field-slot:address',
    metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: 'zzz.address', replacesFieldNames: ['Street', 'City'] },
})
@Component({ standalone: true, selector: 'test-field-slot-address', template: `<div class="field-panel" data-panel="address"></div>` })
class AddressPanel extends BaseFormPanel {}

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-field-slot:notes',
    metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: 'zzz.notes', inSectionKey: 'details', sectionPosition: 'end' },
})
@Component({ standalone: true, selector: 'test-field-slot-notes', template: `<div class="field-panel" data-panel="notes"></div>` })
class NotesPanel extends BaseFormPanel {}

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-field-slot:billing',
    metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: 'zzz.billing', inSectionKey: 'billing' },
})
@Component({ standalone: true, selector: 'test-field-slot-billing', template: `<div class="field-panel" data-panel="billing"></div>` })
class OtherSectionPanel extends BaseFormPanel {}

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-field-slot:invoice',
    metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: 'zzz.invoice', replacesFieldNames: ['InvoiceTotal'] },
})
@Component({ standalone: true, selector: 'test-field-slot-invoice', template: `<div class="field-panel" data-panel="invoice"></div>` })
class OtherFieldPanel extends BaseFormPanel {}

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-field-slot:wild-place',
    metadata: { entity: '*', slot: 'after-everything', contributionKey: 'zzz.wild-place', inSectionKey: 'details' },
})
@Component({ standalone: true, selector: 'test-field-slot-wild-place', template: `<div class="field-panel" data-panel="wild-place"></div>` })
class WildcardPlacePanel extends BaseFormPanel {}

// Registered low-sort first, with the higher priority, so neither registration order nor priority explains the result.
@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-field-slot:sort-low',
    priority: 9,
    metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: 'zzz.sort-low', inSectionKey: 'contact', sortKey: 10 },
})
@Component({ standalone: true, selector: 'test-field-slot-sort-low', template: `<div class="field-panel" data-panel="sort-low"></div>` })
class SortLowPanel extends BaseFormPanel {}

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-field-slot:sort-high',
    priority: 1,
    metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: 'zzz.sort-high', inSectionKey: 'contact', sortKey: 50 },
})
@Component({ standalone: true, selector: 'test-field-slot-sort-high', template: `<div class="field-panel" data-panel="sort-high"></div>` })
class SortHighPanel extends BaseFormPanel {}

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-field-slot:tie-low',
    priority: 2,
    metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: 'zzz.tie-low', inSectionKey: 'tiebreak', sortKey: 20 },
})
@Component({ standalone: true, selector: 'test-field-slot-tie-low', template: `<div class="field-panel" data-panel="tie-low"></div>` })
class TieLowPanel extends BaseFormPanel {}

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-field-slot:tie-high',
    priority: 7,
    metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: 'zzz.tie-high', inSectionKey: 'tiebreak', sortKey: 20 },
})
@Component({ standalone: true, selector: 'test-field-slot-tie-high', template: `<div class="field-panel" data-panel="tie-high"></div>` })
class TieHighPanel extends BaseFormPanel {}

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-field-slot:postal',
    metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: 'zzz.postal', replacesFieldNames: ['  PostalCode  '] },
})
@Component({ standalone: true, selector: 'test-field-slot-postal', template: `<div class="field-panel" data-panel="postal"></div>` })
class PaddedClaimPanel extends BaseFormPanel {}

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-field-slot:region',
    metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: 'zzz.region', replacesFieldNames: ['region'] },
})
@Component({ standalone: true, selector: 'test-field-slot-region', template: `<div class="field-panel" data-panel="region"></div>` })
class LowerCaseClaimPanel extends BaseFormPanel {}

const RECORD = { Get: () => null } as unknown as BaseEntity;
const FORM = { OwnsEntireFormBody: false } as unknown as BaseFormComponent;

interface SlotInputs {
    FieldNames?: string[];
    SectionKey?: string;
    Position?: 'start' | 'end';
    FormComponent?: BaseFormComponent;
}

function renderSlot(inputs: SlotInputs): ComponentFixture<FormFieldPanelSlotComponent> {
    return RenderComponentFixture(FormFieldPanelSlotComponent, {
        declarations: [FormFieldPanelSlotComponent],
        inputs: { Entity: ENTITY, Record: RECORD, FormComponent: FORM, FieldNames: [], SectionKey: '', Position: 'start', ...inputs },
    });
}

/** The panels mounted under `selector`, in DOM order. */
function mountedPanels(fixture: ComponentFixture<unknown>, selector = '.field-panel'): (string | null)[] {
    return QueryAll(fixture, selector).map((node) => node.getAttribute('data-panel'));
}

/** One section with a slot at each end, as `<mj-collapsible-panel>` renders it. */
@Component({
    standalone: false,
    selector: 'test-field-slot-section',
    template: `
        <div class="section-start">
            <mj-form-field-panel-slot [Entity]="Entity" [FieldNames]="Fields" SectionKey="details" Position="start"
                [Record]="Record" [FormComponent]="Form"></mj-form-field-panel-slot>
        </div>
        <div class="section-fields"></div>
        <div class="section-end">
            <mj-form-field-panel-slot [Entity]="Entity" [FieldNames]="Fields" SectionKey="details" Position="end"
                [Record]="Record" [FormComponent]="Form"></mj-form-field-panel-slot>
        </div>
    `,
})
class SectionHost {
    public Entity = ENTITY;
    public Fields = ['Name', 'Street', 'City'];
    public Record = RECORD;
    public Form = FORM;
}

function renderSection(): ComponentFixture<SectionHost> {
    return RenderComponentFixture(SectionHost, { declarations: [SectionHost, FormFieldPanelSlotComponent] });
}

describe('FormFieldPanelSlotComponent (DOM)', () => {
    it('registers the test panels (guard)', () => {
        for (const panel of [AddressPanel, NotesPanel, OtherSectionPanel, OtherFieldPanel, WildcardPlacePanel,
            SortLowPanel, SortHighPanel, TieLowPanel, TieHighPanel, PaddedClaimPanel, LowerCaseClaimPanel]) {
            expect(panel).toBeDefined();
        }
    });

    it('renders nothing when no winner targets the section', () => {
        const f = renderSlot({ FieldNames: ['Name', 'Code'], SectionKey: 'summary' });
        expect(mountedPanels(f)).toEqual([]);
    });

    it('wires the record, form and registration metadata onto a mounted panel and registers it with the form', () => {
        const form = { OwnsEntireFormBody: false, RegisterFormPanel: vi.fn(), UnregisterFormPanel: vi.fn() };
        const f = renderSlot({ FieldNames: ['Street'], FormComponent: form as unknown as BaseFormComponent });
        const panel = f.debugElement.query(By.directive(AddressPanel)).componentInstance as AddressPanel;
        expect(panel.Record).toBe(RECORD);
        expect(panel.FormComponent).toBe(form);
        expect(panel.RegistrationMetadata?.contributionKey).toBe('zzz.address');
        expect(form.RegisterFormPanel).toHaveBeenCalledWith(panel);
    });

    it('renders nothing when the host form owns its whole body', () => {
        const owner = { OwnsEntireFormBody: true } as unknown as BaseFormComponent;
        const f = renderSlot({ FieldNames: ['Street'], SectionKey: 'details', FormComponent: owner });
        expect(mountedPanels(f)).toEqual([]);
    });
});

describe('FormFieldPanelSlotComponent (DOM) - the two ends of one section', () => {
    it('mounts a field claim with no position at the start and not at the end', () => {
        const f = renderSection();
        expect(mountedPanels(f, '.section-start .field-panel')).toContain('address');
        expect(mountedPanels(f, '.section-end .field-panel')).not.toContain('address');
    });

    it('mounts a panel placed by section key at the end when its position is end', () => {
        const f = renderSection();
        expect(mountedPanels(f, '.section-end .field-panel')).toContain('notes');
        expect(mountedPanels(f, '.section-start .field-panel')).not.toContain('notes');
    });

    it('ignores a winner for another section and a wildcard place claim on this section', () => {
        const f = renderSection();
        expect(mountedPanels(f, '.section-start .field-panel')).toEqual(['address']);
        expect(mountedPanels(f, '.section-end .field-panel')).toEqual(['notes']);
    });
});

describe('FormFieldPanelSlotComponent (DOM) - order', () => {
    it('mounts the higher sortKey first, whatever the priority', () => {
        const f = renderSlot({ SectionKey: 'contact' });
        expect(mountedPanels(f)).toEqual(['sort-high', 'sort-low']);
    });

    it('mounts the higher priority first when sortKeys are equal', () => {
        const f = renderSlot({ SectionKey: 'tiebreak' });
        expect(mountedPanels(f)).toEqual(['tie-high', 'tie-low']);
    });
});

describe('FormFieldPanelSlotComponent (DOM) - claimed field names', () => {
    it('matches a claimed name after trimming it, and does not match one that differs only by case', () => {
        const f = renderSlot({ FieldNames: ['PostalCode', 'Region'], SectionKey: 'location' });
        expect(mountedPanels(f)).toEqual(['postal']);
    });
});
