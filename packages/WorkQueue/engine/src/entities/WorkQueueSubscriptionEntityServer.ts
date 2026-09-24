import { BaseEntity, RunView } from '@memberjunction/core';
import type { ValidationResult } from '@memberjunction/core';
import { MJWorkQueueSubscriptionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ValidateSubscriptionFields, WorkQueueEntityNames } from '@memberjunction/work-queue-base';
import { AddFieldIssues } from './fieldIssues';
import { CheckPartitionModeChange } from './partitionModeChange';

@RegisterClass(BaseEntity, WorkQueueEntityNames.Subscriptions)
export class MJWorkQueueSubscriptionEntityServer extends MJWorkQueueSubscriptionEntity {
    public override Validate(): ValidationResult {
        return AddFieldIssues(super.Validate(), ValidateSubscriptionFields(this));
    }

    /** F11: PartitionMode is immutable once deliveries exist. Needs a read, so it lives in the async validation pass. */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const field = this.GetFieldByName('PartitionMode');
        const issue = await CheckPartitionModeChange(
            { IsSaved: this.IsSaved, Changed: field?.Dirty ?? false, OldValue: field ? String(field.OldValue ?? '') : null, NewValue: this.PartitionMode },
            () => this.hasDeliveries(),
        );
        return AddFieldIssues(result, issue ? [issue] : []);
    }

    private async hasDeliveries(): Promise<boolean> {
        const view = await new RunView(this.RunViewProviderToUse).RunView<{ ID: string }>({
            EntityName: WorkQueueEntityNames.Deliveries,
            ExtraFilter: `SubscriptionID = '${this.ID}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        }, this.ContextCurrentUser);
        if (!view.Success) {
            throw new Error(`Could not check deliveries of subscription ${this.Name}: ${view.ErrorMessage}`);
        }
        return view.Results.length > 0;
    }
}
