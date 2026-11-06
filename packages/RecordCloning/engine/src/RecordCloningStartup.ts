/**
 * @file RecordCloningStartup.ts
 * Registers the `Clone` Record Process work type at server boot. Without it, a Record Process with
 * `WorkType = 'Clone'` fails with "unsupported WorkType": `RegisterCloneRecordProcessor` only
 * makes the processor available, and nothing else calls it.
 */

import { IMetadataProvider, IStartupSink, LogStatusEx, RegisterForStartup, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { RegisterCloneRecordProcessor } from './CloneRecordProcessor';

@RegisterForStartup({
    description: 'Record cloning: Clone record-process work type registration',
})
export class RecordCloningStartup extends BaseSingleton<RecordCloningStartup> implements IStartupSink {
    public static get Instance(): RecordCloningStartup {
        return super.getInstance<RecordCloningStartup>();
    }

    /** Registers the Clone work type. Idempotent (the registry is last-wins); needs no user or provider. */
    public async HandleStartup(_contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        RegisterCloneRecordProcessor();
        LogStatusEx({ message: '[RecordCloningStartup] Registered the Clone record-process work type.', verboseOnly: true });
    }
}
