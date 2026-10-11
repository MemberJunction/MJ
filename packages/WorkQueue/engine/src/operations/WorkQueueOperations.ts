import { BaseRemotableOperation } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    WorkQueueDiscardDeliveryOperation, WorkQueueGetBacklogOperation, WorkQueueGetSubscriptionStatsOperation,
    WorkQueueListDeadLettersOperation, WorkQueueListPartitionsOperation, WorkQueueReplayDeadLetterOperation,
    WorkQueueValidateBindingsOperation,
} from '@memberjunction/core-entities';
import type {
    WorkQueueDiscardDeliveryInput, WorkQueueDiscardDeliveryOutput, WorkQueueGetBacklogInput, WorkQueueGetBacklogOutput,
    WorkQueueGetSubscriptionStatsInput, WorkQueueGetSubscriptionStatsOutput, WorkQueueListDeadLettersInput, WorkQueueListDeadLettersOutput,
    WorkQueueListPartitionsInput, WorkQueueListPartitionsOutput, WorkQueueReplayDeadLetterInput, WorkQueueReplayDeadLetterOutput,
    WorkQueueValidateBindingsInput, WorkQueueValidateBindingsOutput,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { MJWorkLogger } from '../logging/MJWorkLogger';
import { WorkQueueEngine } from '../WorkQueueEngine';
import { AuthorizeWorkQueueOperator } from './operatorAuthorization';
import { WorkQueueOperatorService } from './WorkQueueOperatorService';

const OPERATIONS_LOG = new MJWorkLogger('[WorkQueue:Operations]');

/**
 * An operator service over WorkQueueEngine. The engine keeps the identity it was configured with (the host's system
 * user); `user` here only loads metadata when nothing has configured the engine yet, and is the ACTOR recorded on
 * replay/discard.
 */
async function ServiceFor(provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueOperatorService> {
    await WorkQueueEngine.Instance.Config(false, user, provider);
    return new WorkQueueOperatorService(WorkQueueEngine.Instance, OPERATIONS_LOG);
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.GetSubscriptionStats')
export class WorkQueueGetSubscriptionStatsServerOperation extends WorkQueueGetSubscriptionStatsOperation {
    protected override async Authorize(_input: WorkQueueGetSubscriptionStatsInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('read', user);
    }

    protected override async InternalExecute(input: WorkQueueGetSubscriptionStatsInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueGetSubscriptionStatsOutput> {
        return (await ServiceFor(provider, user)).GetSubscriptionStats(input);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ListDeadLetters')
export class WorkQueueListDeadLettersServerOperation extends WorkQueueListDeadLettersOperation {
    protected override async Authorize(_input: WorkQueueListDeadLettersInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('read', user);
    }

    protected override async InternalExecute(input: WorkQueueListDeadLettersInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueListDeadLettersOutput> {
        return (await ServiceFor(provider, user)).ListDeadLetters(input);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ListPartitions')
export class WorkQueueListPartitionsServerOperation extends WorkQueueListPartitionsOperation {
    protected override async Authorize(_input: WorkQueueListPartitionsInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('read', user);
    }

    protected override async InternalExecute(input: WorkQueueListPartitionsInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueListPartitionsOutput> {
        return (await ServiceFor(provider, user)).ListPartitions(input);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ReplayDeadLetter')
export class WorkQueueReplayDeadLetterServerOperation extends WorkQueueReplayDeadLetterOperation {
    protected override async Authorize(_input: WorkQueueReplayDeadLetterInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('operate', user);
    }

    protected override async InternalExecute(input: WorkQueueReplayDeadLetterInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueReplayDeadLetterOutput> {
        return (await ServiceFor(provider, user)).ReplayDeadLetter(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.DiscardDelivery')
export class WorkQueueDiscardDeliveryServerOperation extends WorkQueueDiscardDeliveryOperation {
    protected override async Authorize(_input: WorkQueueDiscardDeliveryInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('operate', user);
    }

    protected override async InternalExecute(input: WorkQueueDiscardDeliveryInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueDiscardDeliveryOutput> {
        return (await ServiceFor(provider, user)).DiscardDelivery(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.GetBacklog')
export class WorkQueueGetBacklogServerOperation extends WorkQueueGetBacklogOperation {
    protected override async Authorize(_input: WorkQueueGetBacklogInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('read', user);
    }

    protected override async InternalExecute(input: WorkQueueGetBacklogInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueGetBacklogOutput> {
        return (await ServiceFor(provider, user)).GetBacklog(input);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ValidateBindings')
export class WorkQueueValidateBindingsServerOperation extends WorkQueueValidateBindingsOperation {
    protected override async Authorize(_input: WorkQueueValidateBindingsInput, user: UserInfo): Promise<boolean> {
        return AuthorizeWorkQueueOperator('read', user);
    }

    protected override async InternalExecute(input: WorkQueueValidateBindingsInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueValidateBindingsOutput> {
        return (await ServiceFor(provider, user)).ValidateBindings(input);
    }
}

/** Tree-shaking anchor for hosts that import the engine without a generated manifest. */
export function LoadWorkQueueOperations(): void {
    // intentionally empty
}
