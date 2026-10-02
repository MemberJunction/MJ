import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { RegisterClass, MJGlobal } from '@memberjunction/global';
import { IRecordProcessor, RecordProcessorContext, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import { InferProcessor } from '../processors/InferProcessor';
import { RecordProcessExecutor } from '../RecordProcessExecutor';
import { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { OutputMappingConfig } from '../writeBack';
import { WriteBackProcessor } from '../processors/WriteBackProcessor';

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
        const processor = new MockInferHookSubclass('prompt-123');
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
        const context: RecordProcessorContext = {
            contextUser: {} as UserInfo,
            recordProcessID: 'rp-1',
            entityID: 'ent-1',
        };
        const record: RecordRef = {
            EntityID: 'ent-1',
            RecordID: 'rec-1',
        };

        await writeBackProc.ProcessRecord(record, context);
        expect(processor.beforeWriteBackCalled).toBe(true);
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
