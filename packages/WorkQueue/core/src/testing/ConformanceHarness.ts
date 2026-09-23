import type { ITransportDriver, SubscriptionBinding, TopicBinding, TransportCapabilities } from '../transport';
import type { SubscriptionBindingOverrides } from './fixtures';

export interface ConformanceTraits {
    /** true for SQS-like transports where Release consumes a receive (attempt). */
    ReleaseConsumesAttempt: boolean;
    /** true when an expired lease on the final attempt dead-letters as 'LeaseExpired' (Database-like). */
    ExpiredLeaseDeadLetters: boolean;
    /** waitSeconds passed to Receive (eventually consistent transports need > 0). */
    ReceiveWaitSeconds: number;
}

export interface ConformanceHarness {
    readonly Capabilities: TransportCapabilities;
    readonly Traits: ConformanceTraits;
    /** A driver for one case; resources may be shared across cases because names are unique. */
    CreateDriver(): Promise<ITransportDriver>;
    CreateTopic(driver: ITransportDriver, name: string, overrides?: Partial<TopicBinding>): Promise<TopicBinding>;
    CreateSubscription(driver: ITransportDriver, topic: TopicBinding, name: string, overrides?: SubscriptionBindingOverrides): Promise<SubscriptionBinding>;
    /** Advance the transport's clock (fake) or wait in real time. */
    AdvanceTime(ms: number): Promise<void>;
    /** Called once per case, after the case finishes, with the driver it created. */
    Dispose?(driver: ITransportDriver): Promise<void>;
}

export interface ConformanceCase {
    Id: string;
    Title: string;
    /** A skip reason when the harness cannot run this case, otherwise null. */
    Gate(harness: ConformanceHarness): string | null;
    /** Throws ConformanceAssertionError on failure. Disposes its own driver. */
    Run(harness: ConformanceHarness): Promise<void>;
}

export interface ConformanceCheckResult {
    Id: string;
    Title: string;
    Status: 'Passed' | 'Failed' | 'Skipped';
    Detail: string | null;
    DurationMs: number;
}
