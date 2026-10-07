import { BaseEntity } from '@memberjunction/core';
import type { ValidationResult } from '@memberjunction/core';
import { MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ValidateTransportFields, WorkQueueEntityNames } from '@memberjunction/work-queue-base';
import { AddFieldIssues } from './fieldIssues';

@RegisterClass(BaseEntity, WorkQueueEntityNames.Transports)
export class MJWorkQueueTransportEntityServer extends MJWorkQueueTransportEntity {
    public override Validate(): ValidationResult {
        return AddFieldIssues(super.Validate(), ValidateTransportFields(this));
    }
}
