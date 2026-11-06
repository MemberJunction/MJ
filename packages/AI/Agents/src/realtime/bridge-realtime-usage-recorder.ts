/**
 * @fileoverview Records the usage a server-held (bridged) realtime session reports. It adds up the session's `OnUsage`
 * updates and writes them through a writer (the co-agent prompt run's usage accumulation) {@link BRIDGE_USAGE_FLUSH_MS}
 * after the first unwritten update, and once more when it is closed, so the run is priced at finalize from its final
 * counts. After it is closed it stores nothing more. Per-modality usage follows the realtime usage record's rules
 * (`AddRealtimeUsageRecord`): amounts add up, running totals keep the larger value.
 *
 * @module @memberjunction/ai-agents
 */
import { LogError, LogStatus, LogStatusEx } from '@memberjunction/core';
import type { RealtimeUsage } from '@memberjunction/ai';
import { AddRealtimeUsageRecord, HasRealtimeUsage, type RealtimeUsageRecord } from '@memberjunction/ai-engine-base';

/** How long after the first unwritten update the recorder writes, in milliseconds. */
export const BRIDGE_USAGE_FLUSH_MS = 10_000;

/** One write: the token amounts since the previous write, and the per-modality usage. */
export interface BridgeUsageWrite {
    /** Input tokens to add. */
    InputTokens: number;
    /** Output tokens to add. */
    OutputTokens: number;
    /** Per-modality amounts to add, and the latest running totals; absent when the session reported none. */
    Details?: RealtimeUsageRecord;
}

/** Stores one {@link BridgeUsageWrite}; resolves `false` when nothing was stored. */
export type BridgeUsageWriter = (write: BridgeUsageWrite) => Promise<boolean>;

/** What a recorder has accepted over its life, for the session's closing log line. */
export interface BridgeUsageTotals {
    InputTokens: number;
    OutputTokens: number;
    /** Seconds of video the model generated (an avatar). */
    OutputVideoSeconds: number;
}

/**
 * Adds up one bridged session's usage and writes it on a timer and at close. A failed write keeps its usage for the
 * next one; the write at close is the last attempt.
 */
export class BridgeRealtimeUsageRecorder {
    private inputTokens = 0;
    private outputTokens = 0;
    private details: RealtimeUsageRecord | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private writeChain: Promise<void> = Promise.resolve();
    private closed = false;
    private lateUpdateLogged = false;
    private readonly accepted: BridgeUsageTotals = { InputTokens: 0, OutputTokens: 0, OutputVideoSeconds: 0 };

    /**
     * @param writer Stores one write.
     * @param label Names the session in log lines (for example its prompt run id).
     * @param flushMs How long after the first unwritten update to write.
     */
    constructor(
        private readonly writer: BridgeUsageWriter,
        private readonly label: string,
        private readonly flushMs: number = BRIDGE_USAGE_FLUSH_MS,
    ) {}

    /** What the recorder has accepted so far. */
    public get Totals(): Readonly<BridgeUsageTotals> {
        return this.accepted;
    }

    /** Whether the recorder holds usage that is not written yet. */
    public get HasUnwrittenUsage(): boolean {
        return this.inputTokens > 0 || this.outputTokens > 0 || HasRealtimeUsage(this.details);
    }

    /**
     * Takes one `OnUsage` update. An update that adds nothing is ignored; the first one that does starts the write timer.
     * After {@link Close} an update is dropped, and the first one dropped is logged.
     *
     * @param usage The update the session reported.
     */
    public Add(usage: RealtimeUsage): void {
        if (this.closed) {
            this.logLateUpdate(usage);
            return;
        }
        const addedTokens = this.addTokens(usage);
        const addedDetails = this.addDetails(usage);
        if (addedTokens || addedDetails) {
            this.armWrite();
        }
    }

    /** Writes what is unwritten now, after any write in progress. Never rejects. */
    public Flush(): Promise<void> {
        this.clearTimer();
        this.writeChain = this.writeChain.then(() => this.writeUnwritten());
        return this.writeChain;
    }

    /**
     * Stops taking updates and writes what is unwritten. When that last write fails, its amounts are logged and dropped.
     * Safe to call more than once.
     */
    public async Close(): Promise<void> {
        if (this.closed) {
            await this.writeChain;
            return;
        }
        this.closed = true;
        await this.Flush();
        if (this.HasUnwrittenUsage) {
            LogError(
                `[Bridged usage] ${this.label}: the last usage write failed; not stored: ${this.inputTokens} input and ` +
                    `${this.outputTokens} output tokens.`,
            );
            this.clearUnwritten();
        }
        LogStatusEx({
            message:
                `[Bridged usage] ${this.label}: ${this.accepted.InputTokens} input and ${this.accepted.OutputTokens} output ` +
                `tokens, ${this.accepted.OutputVideoSeconds} s of generated video.`,
            verboseOnly: true,
        });
    }

    /** Adds the update's token totals to the unwritten ones. Returns whether it added anything. */
    private addTokens(usage: RealtimeUsage): boolean {
        let added = false;
        if (isAmount(usage.InputTokens)) {
            this.inputTokens += usage.InputTokens;
            this.accepted.InputTokens += usage.InputTokens;
            added = true;
        }
        if (isAmount(usage.OutputTokens)) {
            this.outputTokens += usage.OutputTokens;
            this.accepted.OutputTokens += usage.OutputTokens;
            added = true;
        }
        return added;
    }

    /** Adds the update's per-modality usage and session duration to the unwritten record. Returns whether it held any. */
    private addDetails(usage: RealtimeUsage): boolean {
        const update = AddRealtimeUsageRecord(null, {
            Input: usage.InputTokenDetails,
            Output: usage.OutputTokenDetails,
            DurationSeconds: usage.DurationSeconds,
        });
        if (!HasRealtimeUsage(update)) {
            return false;
        }
        this.details = AddRealtimeUsageRecord(this.details, update);
        this.accepted.OutputVideoSeconds += update.Output?.VideoSeconds ?? 0;
        return true;
    }

    /** Starts the write timer unless one is running. The timer never keeps the process alive. */
    private armWrite(): void {
        if (this.timer) {
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.Flush();
        }, this.flushMs);
        this.timer.unref?.();
    }

    private clearTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /** Writes the unwritten usage once; a failed write puts its usage back. */
    private async writeUnwritten(): Promise<void> {
        const write = this.takeUnwritten();
        if (!write) {
            return;
        }
        let stored = false;
        try {
            stored = await this.writer(write);
        } catch (error) {
            LogError(`[Bridged usage] ${this.label}: writing usage failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!stored) {
            this.putBack(write);
        }
    }

    /** Moves the unwritten usage into a write, or returns `null` when there is none. */
    private takeUnwritten(): BridgeUsageWrite | null {
        if (!this.HasUnwrittenUsage) {
            return null;
        }
        const write: BridgeUsageWrite = {
            InputTokens: this.inputTokens,
            OutputTokens: this.outputTokens,
            ...(this.details && HasRealtimeUsage(this.details) ? { Details: this.details } : {}),
        };
        this.clearUnwritten();
        return write;
    }

    /** Puts a failed write's usage back, together with what arrived since. */
    private putBack(write: BridgeUsageWrite): void {
        this.inputTokens += write.InputTokens;
        this.outputTokens += write.OutputTokens;
        if (write.Details) {
            this.details = AddRealtimeUsageRecord(write.Details, this.details ?? {});
        }
    }

    /** Forgets the unwritten usage. */
    private clearUnwritten(): void {
        this.inputTokens = 0;
        this.outputTokens = 0;
        this.details = null;
    }

    /** Logs the first update dropped after close. */
    private logLateUpdate(usage: RealtimeUsage): void {
        if (this.lateUpdateLogged) {
            return;
        }
        this.lateUpdateLogged = true;
        LogStatus(
            `[Bridged usage] ${this.label}: usage reported after the session's run was finalized is not stored ` +
                `(first dropped: ${usage.InputTokens} input and ${usage.OutputTokens} output tokens).`,
        );
    }
}

/** Whether a reported token total is one to add: a finite number above zero. */
function isAmount(value: number | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
