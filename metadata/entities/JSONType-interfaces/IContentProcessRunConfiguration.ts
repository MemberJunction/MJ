/** Pipeline configuration stored on ContentProcessRun.Configuration.
 *  Controls batch size, rate limiting, error thresholds, and duplicate detection. */
export interface IContentProcessRunConfiguration {
    /** Batch processing settings */
    Pipeline?: {
        /** Number of content items per batch. Default: 100 */
        BatchSize?: number;
        /** Maximum concurrent batches. Default: 1 */
        MaxConcurrentBatches?: number;
        /** Delay between batches in milliseconds. Default: 200 */
        DelayBetweenBatchesMs?: number;
        /** If true, resume from the last completed batch on restart. Default: true */
        ResumeFromLastBatch?: boolean;
        /** Error rate percentage that triggers the circuit breaker (0-100). Default: 20 */
        ErrorThresholdPercent?: number;
    };
    /** API rate limiting per provider */
    RateLimits?: {
        /** LLM (tagging) rate limits */
        LLM?: {
            /** Maximum LLM requests per minute */
            RequestsPerMinute?: number;
            /** Maximum LLM tokens per minute */
            TokensPerMinute?: number;
        };
        /** Embedding rate limits */
        Embedding?: {
            /** Maximum embedding requests per minute */
            RequestsPerMinute?: number;
            /** Maximum embedding tokens per minute */
            TokensPerMinute?: number;
        };
        /** Vector database rate limits */
        VectorDB?: {
            /** Maximum vector DB requests per minute */
            RequestsPerMinute?: number;
        };
    };
}
