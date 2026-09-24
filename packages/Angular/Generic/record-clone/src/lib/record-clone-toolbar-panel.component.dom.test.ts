import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RecordCloneToolbarPanel } from './record-clone-toolbar-panel.component';
import { RecordCloneService } from './record-clone.service';
import type { BaseEntity } from '@memberjunction/core';
import type { FormToolbarItemConfig } from '@memberjunction/ng-base-forms';

describe('RecordCloneToolbarPanel (DOM)', () => {
    let mockService: RecordCloneService;
    let registeredToolbarItem: FormToolbarItemConfig | null = null;
    let unregisteredKey: string | null = null;
    let mockFormComponent: {
        RegisterToolbarItem: ReturnType<typeof vi.fn>;
        UnregisterToolbarItem: ReturnType<typeof vi.fn>;
    };

    const mockRecord = {
        EntityInfo: { Name: 'Users' },
        PrimaryKey: { Value: 'u-1' },
        IsSaved: true,
    } as unknown as BaseEntity;

    beforeEach(() => {
        registeredToolbarItem = null;
        unregisteredKey = null;
        mockFormComponent = {
            RegisterToolbarItem: vi.fn((item: FormToolbarItemConfig) => {
                registeredToolbarItem = item;
            }),
            UnregisterToolbarItem: vi.fn((key: string) => {
                unregisteredKey = key;
            }),
        };
        mockService = {
            DescribeRecord: vi.fn().mockResolvedValue({ CanClone: true }),
            PlanClone: vi.fn().mockResolvedValue({}),
            ExecuteClone: vi.fn().mockResolvedValue({}),
            GetLineage: vi.fn().mockResolvedValue({}),
        } as unknown as RecordCloneService;
    });

    it('registers Clone button in FormComponent toolbar when CanClone is true', async () => {
        const fixture = renderComponentFixture(RecordCloneToolbarPanel, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: {
                Record: mockRecord,
                FormComponent: mockFormComponent as unknown,
            },
        });

        await fixture.componentInstance.CheckClonePromise;
        fixture.detectChanges();

        expect(mockFormComponent.RegisterToolbarItem).toHaveBeenCalledTimes(1);
        expect(registeredToolbarItem).not.toBeNull();
        expect(registeredToolbarItem!.Key).toBe('record-clone');
        expect(registeredToolbarItem!.Text).toBe('Clone');
        expect(registeredToolbarItem!.Icon).toBe('fa-solid fa-clone');

        // Test Visible callback
        const isVisibleWhenSaved = typeof registeredToolbarItem!.Visible === 'function'
            ? registeredToolbarItem!.Visible({ IsSaved: true } as BaseEntity, false)
            : registeredToolbarItem!.Visible;
        expect(isVisibleWhenSaved).toBe(true);

        const isVisibleWhenUnsaved = typeof registeredToolbarItem!.Visible === 'function'
            ? registeredToolbarItem!.Visible({ IsSaved: false } as BaseEntity, false)
            : registeredToolbarItem!.Visible;
        expect(isVisibleWhenUnsaved).toBe(false);

        // Test OnClick opens panel
        expect(fixture.componentInstance.IsPanelOpen).toBe(false);
        if (registeredToolbarItem!.OnClick) {
            registeredToolbarItem!.OnClick({
                ItemKey: 'record-clone',
                Item: registeredToolbarItem!,
                Record: mockRecord,
                EditMode: false,
            });
        }
        expect(fixture.componentInstance.IsPanelOpen).toBe(true);
    });

    it('does not register toolbar button when CanClone is false', async () => {
        vi.spyOn(mockService, 'DescribeRecord').mockResolvedValue({ CanClone: false, Relationships: [] });

        const fixture = renderComponentFixture(RecordCloneToolbarPanel, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: {
                Record: mockRecord,
                FormComponent: mockFormComponent as unknown,
            },
        });

        await fixture.componentInstance.CheckClonePromise;
        fixture.detectChanges();

        expect(mockFormComponent.RegisterToolbarItem).not.toHaveBeenCalled();
        expect(fixture.componentInstance.CanClone).toBe(false);
    });

    it('unregisters toolbar item on destroy', () => {
        const fixture = renderComponentFixture(RecordCloneToolbarPanel, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: {
                Record: mockRecord,
                FormComponent: mockFormComponent as unknown,
            },
        });

        fixture.componentInstance.ngOnDestroy();
        expect(mockFormComponent.UnregisterToolbarItem).toHaveBeenCalledWith('record-clone');
    });
});
