import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { RegisterClassEx } from '@memberjunction/global';
import type { BaseEntity, IMetadataProvider } from '@memberjunction/core';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import type { FormContributionRegistration } from './form-contribution';
import type { BaseFormComponent } from '../base-form-component';

/**
 * The slot hosts against a stand-in contribution engine: when the first mount waits for rows, and
 * which host mounts a key that a row takes from a compiled panel in another slot.
 */

/** The panels a host has mounted and not yet removed, by the registration each was mounted from. */
const hoisted = vi.hoisted(() => ({
    live: new Set<{ Registration: unknown }>(),
}));

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

vi.mock('@memberjunction/core-entities', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    InteractiveFormsEngine: { get Instance() { return engine; } },
    UserInfoEngine: { get Instance() { return { GetSetting: () => undefined }; } },
}));

const logError = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    LogError: (...args: unknown[]) => logError(...args),
}));

vi.mock('./mount-form-contribution', () => ({
    MountFormContribution: (_anchor: unknown, registration: FormContributionRegistration) =>
        ({ instance: { Registration: registration }, location: { nativeElement: document.createElement('div') } }),
}));

import { FormPanelSlotComponent } from './form-panel-slot.component';
import { FormFieldPanelSlotComponent } from './form-field-panel-slot.component';
import { InvalidateFormContributionRegistrationCache } from './collect-form-contribution-registrations';
import { BaseFormPanel } from './base-form-panel';

const ENTITY = 'ZZZ_SlotContributionEntity';

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-slot-contribution:header',
    priority: 3,
    metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: 'header' },
})
@Component({ standalone: true, selector: 'test-compiled-header', template: '' })
class CompiledHeaderPanel extends BaseFormPanel {}

@RegisterClassEx(BaseFormPanel, {
    key: 'zzz-slot-contribution:address',
    priority: 3,
    metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: 'address', replacesFieldNames: ['Street'] },
})
@Component({ standalone: true, selector: 'test-compiled-address', template: '' })
class CompiledAddressPanel extends BaseFormPanel {}

const PROVIDER = { CurrentUser: { ID: 'user-1', UserRoles: [] } } as unknown as IMetadataProvider;
const RECORD = { EntityInfo: { ID: 'ent-slot', Name: ENTITY, RelatedEntities: [], ChildEntities: [] }, Get: () => null } as unknown as BaseEntity;
const FORM = {
    ProviderToUse: PROVIDER,
    OwnsEntireFormBody: false,
    RegisterFormPanel: (panel: { Registration: unknown }) => hoisted.live.add(panel),
    UnregisterFormPanel: (panel: { Registration: unknown }) => hoisted.live.delete(panel),
} as unknown as BaseFormComponent;

function row(over: Record<string, unknown>) {
    return {
        ID: 'row-header', Entity: ENTITY, ComponentID: 'comp-1', Name: 'My header', Title: null, Icon: null,
        Slot: 'before-fields', SortKey: 0, ContributionKey: 'header', RelatedEntity: null, RelatedJoinField: null,
        ReplacesSectionKey: null, ReplacesSectionKeys: null, ReplacesFieldNames: null, InSectionKey: null, SectionPosition: null,
        Inclusion: null, ChromeGroup: null, Presentation: 'panel', Precedence: 4, Scope: 'User', Configuration: null, ...over,
    };
}

function renderSlot(slot: string) {
    const f = renderComponentFixture(FormPanelSlotComponent, {
        declarations: [FormPanelSlotComponent],
        inputs: { Entity: ENTITY, Slot: slot, Record: RECORD, FormComponent: FORM },
    });
    f.componentRef.setInput('FormContext', {});
    f.detectChanges();
    return f;
}

function renderFieldSlot(fieldNames: string[]) {
    const f = renderComponentFixture(FormFieldPanelSlotComponent, {
        declarations: [FormFieldPanelSlotComponent],
        inputs: { Entity: ENTITY, FieldNames: fieldNames, Record: RECORD, FormComponent: FORM },
    });
    f.componentRef.setInput('FormContext', {});
    f.detectChanges();
    return f;
}

const mountedKeys = () => [...hoisted.live]
    .map((panel) => panel.Registration as FormContributionRegistration)
    .map((reg) => `${reg.Source}:${reg.Metadata.contributionKey}@${reg.Metadata.slot}`);
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
    hoisted.live.clear();
    logError.mockClear();
    engine.Loaded = true;
    engine.IsPermissionConstrained = false;
    engine.LoadingSubject.next(false);
    engine.rows = [];
    InvalidateFormContributionRegistrationCache();
    (FormPanelSlotComponent as unknown as { contributionGateResolved: boolean }).contributionGateResolved = false;
});

afterEach(() => {
    vi.useRealTimers();
});

describe('FormPanelSlotComponent (DOM) — the first mount waits for contribution rows', () => {
    it('registers the compiled panels (guard)', () => {
        expect(CompiledHeaderPanel).toBeDefined();
        expect(CompiledAddressPanel).toBeDefined();
    });

    it('waits while the engine is loading, then mounts once the load completes', async () => {
        vi.useFakeTimers();
        engine.Loaded = false;
        engine.LoadingSubject.next(true);
        renderSlot('after-fields');
        await flush();
        expect(mountedKeys()).toEqual([]);

        await vi.advanceTimersByTimeAsync(500);
        expect(mountedKeys()).toEqual([]);

        engine.Loaded = true;
        engine.LoadingSubject.next(false);
        await flush();
        expect(mountedKeys()).toEqual(['class:header@after-fields']);
    });

    it('does not report a timeout when the load completes in time', async () => {
        vi.useFakeTimers();
        engine.Loaded = false;
        engine.LoadingSubject.next(true);
        renderSlot('after-fields');
        await vi.advanceTimersByTimeAsync(200);
        engine.Loaded = true;
        engine.LoadingSubject.next(false);
        await flush();
        await vi.advanceTimersByTimeAsync(5000);
        expect(logError).not.toHaveBeenCalled();
    });

    it('mounts compiled panels and reports it when the load outlasts the wait', async () => {
        vi.useFakeTimers();
        engine.Loaded = false;
        engine.LoadingSubject.next(true);
        renderSlot('after-fields');
        await vi.advanceTimersByTimeAsync(2000);
        expect(mountedKeys()).toEqual(['class:header@after-fields']);
        expect(logError).toHaveBeenCalledTimes(1);
    });
});

/**
 * A row that takes a key from a compiled panel may name another slot or a section. The collapse
 * runs once for the form, so the key draws once, where the row says.
 */
describe('FormPanelSlotComponent (DOM) — a row that takes a key from a compiled panel', () => {
    it('draws the row in its own slot', () => {
        engine.rows = [row({})];
        renderSlot('before-fields');
        expect(mountedKeys()).toEqual(['metadata:header@before-fields']);
    });

    it('draws nothing for the key in the compiled panel\'s slot', () => {
        engine.rows = [row({})];
        renderSlot('after-fields');
        expect(mountedKeys()).toEqual([]);
    });

    it('still draws the compiled panel when the row does not outrank it', () => {
        engine.rows = [row({ Precedence: 3 })];
        renderSlot('after-fields');
        expect(mountedKeys()).toEqual(['class:header@after-fields']);
    });

    // One TestBed per test: a second fixture in the same test throws.
    it('draws nothing in the slot for a row that stands in for fields', () => {
        engine.rows = [row({ Slot: 'after-fields', ReplacesFieldNames: '["Name"]' })];
        renderSlot('after-fields');
        expect(mountedKeys()).toEqual([]);
    });

    it('draws that row in the section drawing its fields', () => {
        engine.rows = [row({ Slot: 'after-fields', ReplacesFieldNames: '["Name"]' })];
        renderFieldSlot(['Name', 'Code']);
        expect(mountedKeys()).toEqual(['metadata:header@after-fields']);
    });

    it('draws nothing in a section for a compiled field panel whose key a row took', () => {
        engine.rows = [row({ ContributionKey: 'address', Slot: 'after-related' })];
        renderFieldSlot(['Street', 'City']);
        expect(mountedKeys()).toEqual([]);
    });

    it('draws the row that took a field panel\'s key in the row\'s own slot', () => {
        engine.rows = [row({ ContributionKey: 'address', Slot: 'after-related' })];
        renderSlot('after-related');
        expect(mountedKeys()).toEqual(['metadata:address@after-related']);
    });
});
