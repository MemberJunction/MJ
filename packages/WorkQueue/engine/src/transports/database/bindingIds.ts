import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { SubscriptionBinding, TopicBinding, WorkJson } from '@memberjunction/work-queue-core';

/**
 * Binding convention for the Database transport: `TopicBinding.Config.TopicID` and
 * `SubscriptionBinding.Config.SubscriptionID` / `.TopicID` carry the row IDs. The binding builders (Task 11) always
 * add them; a binding without them is a configuration error, never a silent miss.
 */
export interface DatabaseSubscriptionIDs {
    SubscriptionID: string;
    TopicID: string;
}

export function ReadTopicID(binding: TopicBinding): string {
    return RequireString(binding.Config['TopicID'], `Topic '${binding.TopicName}' binding is missing Config.TopicID`);
}

export function ReadSubscriptionIDs(binding: SubscriptionBinding): DatabaseSubscriptionIDs {
    const name = binding.Policy.SubscriptionName;
    return {
        SubscriptionID: RequireString(binding.Config['SubscriptionID'], `Subscription '${name}' binding is missing Config.SubscriptionID`),
        TopicID: RequireString(binding.Config['TopicID'], `Subscription '${name}' binding is missing Config.TopicID`),
    };
}

function RequireString(value: WorkJson | undefined, message: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new WorkQueueConfigurationError(message);
    }
    return value;
}
