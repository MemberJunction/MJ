import { BaseEntity, BaseEntityResult } from '@memberjunction/core';
import type { EntityDeleteOptions, EntitySaveOptions } from '@memberjunction/core';
import { MJWorkQueueDeduplicationEntity, MJWorkQueueDeliveryEntity, MJWorkQueueMessageEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { WorkQueueEntityNames } from '@memberjunction/work-queue-base';

/**
 * Messages, Deliveries and Deduplications are written only by guarded driver SQL (03 §6.8). Task 1 closed the API
 * (the generated classes throw on Save/Delete); these subclasses close the in-process door the MJ way — a false
 * return with a result-history entry — and say why. The failure they prevent: MJ's update procedure writes every
 * column from the entity in memory, so a Save() from a snapshot loaded minutes ago would restore that snapshot's
 * LeaseToken, AttemptCount and CancelRequestedAt over a newer claim. Settles are single guarded statements instead.
 */
export const DRIVER_OWNED_STATE_MESSAGE =
    'work-queue delivery state is managed by the transport driver; use the operator API (Replay / Discard)';

/** Records the refusal on the entity's result history so callers see it through LatestResult.CompleteMessage. */
export function RefuseDriverOwnedWrite(entity: BaseEntity, type: 'create' | 'update' | 'delete'): boolean {
    const result = new BaseEntityResult();
    result.StartedAt = new Date();
    result.Success = false;
    result.Type = type;
    result.Message = DRIVER_OWNED_STATE_MESSAGE;
    result.EndedAt = new Date();
    entity.RegisterResultHistoryEntry(result);
    return false;
}

@RegisterClass(BaseEntity, WorkQueueEntityNames.Deliveries)
export class MJWorkQueueDeliveryEntityServer extends MJWorkQueueDeliveryEntity {
    public override async Save(_options?: EntitySaveOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, this.IsSaved ? 'update' : 'create');
    }

    public override async Delete(_options?: EntityDeleteOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, 'delete');
    }
}

@RegisterClass(BaseEntity, WorkQueueEntityNames.Messages)
export class MJWorkQueueMessageEntityServer extends MJWorkQueueMessageEntity {
    public override async Save(_options?: EntitySaveOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, this.IsSaved ? 'update' : 'create');
    }

    public override async Delete(_options?: EntityDeleteOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, 'delete');
    }
}

@RegisterClass(BaseEntity, WorkQueueEntityNames.Deduplications)
export class MJWorkQueueDeduplicationEntityServer extends MJWorkQueueDeduplicationEntity {
    public override async Save(_options?: EntitySaveOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, this.IsSaved ? 'update' : 'create');
    }

    public override async Delete(_options?: EntityDeleteOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, 'delete');
    }
}
