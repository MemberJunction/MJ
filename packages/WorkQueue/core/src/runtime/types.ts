export interface ConsumerRuntimeOptions {
    /** Maximum handlers in flight for this subscription on this host. */
    Concurrency: number;
    ReceiveBatchSize: number;
    /** Long-poll wait passed to ITransportConsumer.Receive (SQS: up to 20). Default 0. */
    ReceiveWaitSeconds?: number;
    IdlePollMinMs: number;
    IdlePollMaxMs: number;
    /** How long Stop() waits for handlers; also how long a cancelled handler gets before its cancel is acknowledged anyway. */
    ShutdownDrainMs: number;
    /** Local-clock allowance when enforcing the lease horizon. Default 5000. */
    LeaseExpiryGraceMs?: number;
}
