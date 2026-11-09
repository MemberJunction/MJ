import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityInfo, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass, MJGlobal } from '@memberjunction/global';
import { IRecordProcessor, RecordProcessorContext, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import { InferProcessor } from '../processors/InferProcessor';
import { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { OutputMappingConfig, RecordProcessExecutor, WriteBackProcessor } from '@memberjunction/record-set-processor';

class MockInferHookSubclass extends InferProcessor {
    public beforeBuildContextCalled = false;
    public beforePromptExecuteCalled = false;
    public afterPromptExecuteCalled = false;
    public beforeWriteBackCalled = false;

    protected override async beforeBuildContext(record: RecordRef, ctx: RecordProcessorContext): Promise<void> {
        this.beforeBuildContextCalled = true;
    }

    public override async beforeWriteBack(
        mapping: OutputMappingConfig | undefined,
        result: unknown,
        record: RecordRef,
        ctx: RecordProcessorContext
    ): Promise<void> {
        this.beforeWriteBackCalled = true;
    }
}

// Register with ClassFactory under a unique key
RegisterClass(InferProcessor, 'MockInferHookSubclass')(MockInferHookSubclass);

describe('InferProcessor Lifecycle Hooks (P1-6)', () => {
    it('allows subclasses to override beforeWriteBack and invokes it in WriteBackProcessor', async () => {
        const processor = new MockInferHookSubclass('prompt-123', undefined, undefined, null);
        const mockInner: IRecordProcessor = {
            ProcessRecord: async () => ({
                Status: 'Succeeded',
                ResultPayload: { foo: 'bar' },
            }),
        };
        // Use MockInferHookSubclass as the inner processor
        processor.ProcessRecord = async () => ({
            Status: 'Succeeded',
            ResultPayload: { foo: 'bar' },
        });

        const writeBackProc = new WriteBackProcessor(processor, { fields: { TargetField: '$.foo' } }, true);
        // A dry-run write-back reads the processed record's entity metadata (Name, Fields[].Name) and loads the record.
        const widgets = new EntityInfo({ ID: 'ent-1', Name: 'Widgets', Fields: [{ Name: 'TargetField' }] });
        const loaded = { InnerLoad: async () => true, Get: () => undefined };
        const provider: Pick<IMetadataProvider, 'EntityByID' | 'GetEntityObject'> = {
            EntityByID: (id: string) => (id === 'ent-1' ? widgets : undefined),
            // a dry-run write-back loads the record to compare its fields; the double is typed as the generic return every provider makes
            GetEntityObject: async <T>() => loaded as T,
        };
        const context: RecordProcessorContext = {
            ContextUser: {} as UserInfo,
            Provider: provider as IMetadataProvider,
            RecordProcessID: 'rp-1',
            EntityID: 'ent-1',
        };
        const record: RecordRef = {
            EntityID: 'ent-1',
            RecordID: 'rec-1',
        };

        const result = await writeBackProc.ProcessRecord(record, context);
        expect(processor.beforeWriteBackCalled).toBe(true);
        expect(result.Status).toBe('Succeeded');
        expect(result.ResultPayload).toEqual({ output: { foo: 'bar' }, writeBack: { updatedRecord: false, changed: false, dryRun: true, previewFields: { TargetField: 'bar' } } });
    });

    it('resolves custom subclass via ClassFactory using DataFeatureSpec.ProcessorExtensionKey', () => {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<InferProcessor>(
            InferProcessor,
            'MockInferHookSubclass',
            'prompt-999',
            undefined,
            { Outputs: [], ProcessorExtensionKey: 'MockInferHookSubclass' }
        );
        expect(instance).toBeDefined();
        expect(instance).toBeInstanceOf(MockInferHookSubclass);
    });
});
