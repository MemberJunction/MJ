import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BaseEntity, type IMetadataProvider, type TransactionGroupBase } from '@memberjunction/core';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { BaseFormSectionComponent, FormChromeContext, FormChromeSpec } from '@memberjunction/ng-base-forms';
import { AIAgentFormPolicy, MJAIAgentFormComponentExtended } from './ai-agent-form.component';

/**
 * Class-behaviour tests for the modernized `MJAIAgentFormComponentExtended` host and
 * `AIAgentFormPolicy`. Verifies chrome policy, full-width default, dynamic agent-type section
 * dirty tracking, atomic `TransactionGroup` commit with `ContributeToSave`, pending-record
 * queue helpers, and test harness / permissions dialog guards.
 */

function createForm(harnessSpy: (agentId: string) => void = vi.fn()): MJAIAgentFormComponentExtended {
    TestBed.configureTestingModule({
        providers: [
            { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } },
            { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
            { provide: AITestHarnessDialogService, useValue: { openForAgent: harnessSpy } },
        ],
    });
    return TestBed.runInInjectionContext(() => new MJAIAgentFormComponentExtended());
}

describe('AIAgentFormPolicy', () => {
    it('forces left-nav layout while preserving all other chrome spec properties', () => {
        const policy = new AIAgentFormPolicy();
        const spec = { Layout: 'accordion', Density: 'comfortable' } as unknown as FormChromeSpec;
        const result = policy.DecorateChrome(spec, {} as FormChromeContext);
        expect(result.Layout).toBe('left-nav');
        expect((result as unknown as { Density: string }).Density).toBe('comfortable');
    });
});

describe('MJAIAgentFormComponentExtended', () => {
    let harnessOpenSpy: ReturnType<typeof vi.fn<(agentId: string) => void>>;
    let notifySpy: ReturnType<typeof vi.fn>;
    let form: MJAIAgentFormComponentExtended;

    beforeEach(() => {
        harnessOpenSpy = vi.fn<(agentId: string) => void>();
        notifySpy = vi.fn();
        vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({
            CreateSimpleNotification: notifySpy,
        } as unknown as MJNotificationService);
        form = createForm(harnessOpenSpy);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        TestBed.resetTestingModule();
    });

    it('defaults to full-width mode for Overview cockpit and Studio canvas', () => {
        expect(form.getDefaultFormWidthMode()).toBe('full-width');
    });

    it('surfaces HasAdditionalUnsavedChanges from the registered agent-type section', () => {
        expect(form.HasAdditionalUnsavedChanges).toBe(false);

        const cleanSection = { HasPendingChanges: false } as unknown as BaseFormSectionComponent;
        form.RegisterAgentTypeSection(cleanSection);
        expect(form.HasAdditionalUnsavedChanges).toBe(false);

        const dirtySection = { HasPendingChanges: true } as unknown as BaseFormSectionComponent;
        form.RegisterAgentTypeSection(dirtySection);
        expect(form.HasAdditionalUnsavedChanges).toBe(true);

        form.RegisterAgentTypeSection(null);
        expect(form.HasAdditionalUnsavedChanges).toBe(false);
    });

    it('queues, updates, and unqueues pending child records without duplicates', () => {
        const child = { ID: 'child-1' } as unknown as BaseEntity;
        form.QueuePendingRecord(child, 'save');
        form.QueuePendingRecord(child, 'delete');

        const pending = (form as unknown as { PendingRecords: Array<{ entityObject: BaseEntity; action: string }> }).PendingRecords;
        expect(pending).toHaveLength(1);
        expect(pending[0].action).toBe('delete');

        form.UnqueuePendingRecord(child);
        expect(pending).toHaveLength(0);
    });

    it('guards OpenTestHarness for unsaved and inactive agents, and opens for Active agents', () => {
        form.record = { ID: '', Status: 'Active' } as unknown as MJAIAgentEntityExtended;
        form.OpenTestHarness();
        expect(harnessOpenSpy).not.toHaveBeenCalled();
        expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining('save'), 'warning', 3500);

        notifySpy.mockClear();
        form.record = { ID: 'agent-1', Status: 'Disabled' } as unknown as MJAIAgentEntityExtended;
        form.OpenTestHarness();
        expect(harnessOpenSpy).not.toHaveBeenCalled();
        expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining('Active'), 'warning', 3500);

        form.record = { ID: 'agent-1', Status: 'Active' } as unknown as MJAIAgentEntityExtended;
        form.OpenTestHarness();
        expect(harnessOpenSpy).toHaveBeenCalledWith('agent-1');
    });

    it('opens permissions dialog only when the record is saved', () => {
        form.record = { ID: '' } as unknown as MJAIAgentEntityExtended;
        form.OpenPermissionsDialog();
        expect(form.ShowPermissionsDialog).toBe(false);
        expect(notifySpy).toHaveBeenCalled();

        form.record = { ID: 'agent-1' } as unknown as MJAIAgentEntityExtended;
        form.OpenPermissionsDialog();
        expect(form.ShowPermissionsDialog).toBe(true);
    });

    it('atomically commits record, pending children, and agent-type section in one TransactionGroup', async () => {
        const submitSpy = vi.fn().mockResolvedValue(true);
        const tg = { Submit: submitSpy } as unknown as TransactionGroupBase;
        const provider = {
            CreateTransactionGroup: vi.fn().mockResolvedValue(tg),
        } as unknown as IMetadataProvider;
        vi.spyOn(form, 'ProviderToUse', 'get').mockReturnValue(provider);
        vi.spyOn(form, 'ResolveAgentType').mockResolvedValue(null);

        const recordSave = vi.fn().mockResolvedValue(true);
        form.record = {
            ID: 'agent-1',
            TransactionGroup: null,
            Save: recordSave,
        } as unknown as MJAIAgentEntityExtended;

        const childSave = vi.fn().mockResolvedValue(true);
        const child = { TransactionGroup: null, Save: childSave } as unknown as BaseEntity;
        form.QueuePendingRecord(child, 'save');

        const contributeSpy = vi.fn().mockResolvedValue(true);
        const completedSpy = vi.fn();
        form.RegisterAgentTypeSection({
            HasPendingChanges: true,
            ContributeToSave: contributeSpy,
            OnHostSaveCompleted: completedSpy,
        } as unknown as BaseFormSectionComponent);

        const saved = await (form as unknown as { InternalSaveRecord(): Promise<boolean> }).InternalSaveRecord();
        expect(saved).toBe(true);
        expect(recordSave).toHaveBeenCalledTimes(1);
        expect(childSave).toHaveBeenCalledTimes(1);
        expect(contributeSpy).toHaveBeenCalledWith(tg);
        expect(submitSpy).toHaveBeenCalledTimes(1);
        expect(completedSpy).toHaveBeenCalledTimes(1);
        expect(form.record.TransactionGroup).toBeNull();
    });

    it('aborts TransactionGroup submission when agent-type ContributeToSave returns false', async () => {
        const submitSpy = vi.fn().mockResolvedValue(true);
        const tg = { Submit: submitSpy } as unknown as TransactionGroupBase;
        const provider = {
            CreateTransactionGroup: vi.fn().mockResolvedValue(tg),
        } as unknown as IMetadataProvider;
        vi.spyOn(form, 'ProviderToUse', 'get').mockReturnValue(provider);

        form.record = {
            ID: 'agent-1',
            TransactionGroup: null,
            Save: vi.fn().mockResolvedValue(true),
        } as unknown as MJAIAgentEntityExtended;

        form.RegisterAgentTypeSection({
            HasPendingChanges: true,
            ContributeToSave: vi.fn().mockResolvedValue(false),
            OnHostSaveCompleted: vi.fn(),
        } as unknown as BaseFormSectionComponent);

        const saved = await (form as unknown as { InternalSaveRecord(): Promise<boolean> }).InternalSaveRecord();
        expect(saved).toBe(false);
        expect(submitSpy).not.toHaveBeenCalled();
        expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining('Nothing was saved'), 'error', 4000);
    });
});
