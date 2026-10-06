import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, Input, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { RegisterClassEx } from '@memberjunction/global';
import type { BaseEntity, IMetadataProvider } from '@memberjunction/core';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import type { BaseFormComponent } from '../base-form-component';

/**
 * The composer fills in the related grids nothing else draws. It reads the same contributions the
 * slots do — compiled panels and rows, less the ones this user hid — and follows the engine when
 * rows change.
 */

const engine = {
    Loaded: true,
    IsPermissionConstrained: false,
    LoadingSubject: new BehaviorSubject<boolean>(false),
    Contributions$: new BehaviorSubject<unknown[]>([]),
    rows: [] as unknown[],
    get ContributionsReady(): boolean { return engine.Loaded || engine.IsPermissionConstrained; },
    GetApplicableContributions: () => engine.rows,
    Config: vi.fn(async () => undefined),
};
const settings = new Map<string, string>();

vi.mock('@memberjunction/core-entities', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    InteractiveFormsEngine: { get Instance() { return engine; } },
    UserInfoEngine: {
        get Instance() {
            return {
                GetSetting: (key: string) => settings.get(key),
                SetSettingDebounced: (key: string, value: string) => { settings.set(key, value); },
            };
        },
    },
}));

import { FormContributionsComponent } from './form-contributions.component';
import { InvalidateFormContributionRegistrationCache } from './collect-form-contribution-registrations';
import { BaseFormPanel } from './base-form-panel';
import { FormSlotCoordinator } from './form-slot-coordinator.service';
import { SetPanelHidden } from './panel-hides';

const ENTITY = 'ZZZ_ComposerEntity';
const ORDERS = 'ZZZ Orders';
const INVOICES = 'ZZZ Invoices';

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-composer:orders',
    priority: 1,
    metadata: { entity: ENTITY, slot: 'after-related', relatedEntity: ORDERS, relatedJoinField: 'CustomerID' },
})
@Component({ standalone: true, selector: 'test-compiled-orders', template: '' })
class CompiledOrdersPanel extends BaseFormPanel {}

@Component({ standalone: true, selector: 'mj-related-entity-grid-panel', template: '' })
class GridPanelStub {
    @Input() Contribution: unknown; @Input() Record: unknown; @Input() FormComponent: unknown; @Input() FormContext: unknown;
}

const relationship = (entity: string, id: string, sequence: number) =>
    ({ RelatedEntity: entity, RelatedEntityID: id, RelatedEntityJoinField: 'CustomerID', DisplayInForm: true, Sequence: sequence });
const RECORD = {
    EntityInfo: {
        ID: 'ent-composer', Name: ENTITY, ChildEntities: [],
        RelatedEntities: [
            relationship(ORDERS, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1),
            relationship(INVOICES, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2),
        ],
    },
} as unknown as BaseEntity;
const PROVIDER = { CurrentUser: { ID: 'user-1', UserRoles: [] } } as unknown as IMetadataProvider;
const FORM = { ProviderToUse: PROVIDER, OwnsEntireFormBody: false } as unknown as BaseFormComponent;

function invoicesClaim() {
    return {
        ID: 'row-invoices', Entity: ENTITY, ComponentID: 'comp-1', Name: 'Invoices panel', Title: null, Icon: null,
        Slot: 'after-related', SortKey: 0, ContributionKey: null, RelatedEntity: INVOICES, RelatedJoinField: 'CustomerID',
        ReplacesSectionKey: null, ReplacesSectionKeys: null, ReplacesFieldNames: null, InSectionKey: null, SectionPosition: null,
        Inclusion: null, ChromeGroup: null, Presentation: 'panel', Precedence: 0, Scope: 'User', Configuration: null,
    };
}

function render(providers: Provider[] = []) {
    return renderComponentFixture(FormContributionsComponent, {
        imports: [GridPanelStub],
        declarations: [FormContributionsComponent],
        providers,
        inputs: { Record: RECORD, FormComponent: FORM, BakedSectionKeys: [] },
    });
}

const stockGrids = (f: ReturnType<typeof render>) => f.componentInstance.StockGrids.map((grid) => grid.RelatedEntity);

beforeEach(() => {
    engine.rows = [];
    settings.clear();
    InvalidateFormContributionRegistrationCache();
});

describe('FormContributionsComponent (DOM)', () => {
    it('registers the compiled panel (guard)', () => {
        expect(CompiledOrdersPanel).toBeDefined();
    });

    it('fills in a grid no contribution claims, and not one a compiled panel claims', () => {
        expect(stockGrids(render())).toEqual([INVOICES]);
    });

    it('draws no stock grid for a relationship a row claims', () => {
        engine.rows = [invoicesClaim()];
        expect(stockGrids(render())).toEqual([]);
    });

    it('fills in the grid again when the user hides the compiled panel that claimed it', () => {
        settings.set('mj.formPanels.hidden.zzz_composerentity', JSON.stringify([`related:${ORDERS}:CustomerID`]));
        expect(stockGrids(render())).toEqual([ORDERS, INVOICES]);
    });

    it('follows the engine when a row arrives after the form drew', () => {
        const f = render();
        expect(stockGrids(f)).toEqual([INVOICES]);
        engine.rows = [invoicesClaim()];
        engine.Contributions$.next([]);
        expect(stockGrids(f)).toEqual([]);
    });

    it('fills in the grid when the user hides its claim on the open form, and drops it when shown', () => {
        const f = render([FormSlotCoordinator]);
        const slots = TestBed.inject(FormSlotCoordinator);
        expect(stockGrids(f)).toEqual([INVOICES]);

        SetPanelHidden(ENTITY, `related:${ORDERS}:CustomerID`, true);
        slots.NotifyPanelsChanged();
        expect(stockGrids(f)).toEqual([ORDERS, INVOICES]);

        SetPanelHidden(ENTITY, `related:${ORDERS}:CustomerID`, false);
        slots.NotifyPanelsChanged();
        expect(stockGrids(f)).toEqual([INVOICES]);
    });
});
