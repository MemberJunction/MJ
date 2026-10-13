import { BaseSingleton } from '@memberjunction/global';

/**
 * How much work one pass of an {@link EmbeddingBackfill} may do, and how long it waits before the next pass when
 * rows are left over. MJServer reads these from the `embeddingBackfill` section of its config at startup and
 * installs them on {@link EmbeddingBackfillSettings} before any engine starts.
 */
export interface EmbeddingBackfillConfig {
    /**
     * The most records one pass embeds and saves. The records left over continue in later passes, one every
     * {@link EmbeddingBackfillConfig.PassDelaySeconds}, so a database with many records lacking a vector is worked off in bounded steps
     * instead of in one long burst at startup. Default {@link EmbeddingBackfillSettings.DefaultBatchSize}.
     */
    BatchSize?: number;
    /** Seconds between a pass that left records over and the next pass. Default {@link EmbeddingBackfillSettings.DefaultPassDelaySeconds}. */
    PassDelaySeconds?: number;
}

/**
 * The process's {@link EmbeddingBackfillConfig}. A {@link BaseSingleton}, so every copy of this package loaded
 * into one process reads the same settings.
 */
export class EmbeddingBackfillSettings extends BaseSingleton<EmbeddingBackfillSettings> {
    /** Records per pass when the host sets none: small enough that a pass of local embeddings and saves takes seconds. */
    public static readonly DefaultBatchSize = 100;
    /** Seconds between passes when the host sets none. */
    public static readonly DefaultPassDelaySeconds = 10;

    private _config: Readonly<EmbeddingBackfillConfig> = {};

    /** Use {@link EmbeddingBackfillSettings.Instance}. */
    public constructor() {
        super();
    }

    /** The process-wide settings. */
    public static get Instance(): EmbeddingBackfillSettings {
        return EmbeddingBackfillSettings.getInstance<EmbeddingBackfillSettings>();
    }

    /** The installed settings. An empty object (the default) uses every default. */
    public get Config(): Readonly<EmbeddingBackfillConfig> {
        return this._config;
    }

    public set Config(config: Readonly<EmbeddingBackfillConfig>) {
        this._config = { ...config };
    }

    /** The most records one pass handles: the configured value when it is a positive integer, else the default. */
    public get BatchSize(): number {
        const size = this._config.BatchSize;
        return size !== undefined && Number.isInteger(size) && size > 0 ? size : EmbeddingBackfillSettings.DefaultBatchSize;
    }

    /** Milliseconds between a pass that left records over and the next pass. 0 is a legitimate setting (no wait). */
    public get PassDelayMs(): number {
        const seconds = this._config.PassDelaySeconds;
        return (seconds !== undefined && seconds >= 0 ? seconds : EmbeddingBackfillSettings.DefaultPassDelaySeconds) * 1000;
    }
}
