import { BaseEntity } from '@memberjunction/core';
import type { ValidationResult } from '@memberjunction/core';
import { MJWorkQueueTopicEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ValidateTopicFields, WorkQueueEntityNames } from '@memberjunction/work-queue-base';
import { AddFieldIssues } from './fieldIssues';

@RegisterClass(BaseEntity, WorkQueueEntityNames.Topics)
export class MJWorkQueueTopicEntityServer extends MJWorkQueueTopicEntity {
    public override Validate(): ValidationResult {
        return AddFieldIssues(super.Validate(), ValidateTopicFields(this));
    }
}
