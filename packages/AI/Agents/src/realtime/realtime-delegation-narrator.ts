/**
 * @fileoverview `DelegationNarrator` — spoken progress updates while a delegated agent run is in flight, for
 * every SERVER-held realtime session (the generic session runner, and a bridged phone call).
 *
 * While the co-agent hands work to a target agent the caller would otherwise sit in silence. The narrator
 * receives the delegated run's progress events and:
 *
 * - always injects each significant one as a background context note (so the model can draw on it), and
 * - schedules a THROTTLED spoken update — first ~5 s into a burst, then no more often than every ~8 s, with
 *   floods aggregated into one digest — built with {@link BuildServerNarrationInstructions}.
 *
 * It was extracted from `RealtimeSessionRunner` so a bridged call (which never constructs a runner) speaks
 * progress identically instead of re-implementing the pacing.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import type { IRealtimeSession } from '@memberjunction/ai';
import type { DelegatedResult, DelegateToTargetRequest } from './realtime-tool-broker';
import { BuildServerNarrationInstructions } from './realtime-narration';

/** The collaborators a {@link DelegationNarrator} needs. */
export interface DelegationNarratorDeps {
    /** The live session to speak on, or `null` when there is none (a stale event is then dropped). */
    GetSession: () => IRealtimeSession | null;
    /** The DB-driven narration instruction template, or `null`/absent for the built-in wording. */
    NarrationInstructionsTemplate?: string | null;
    /** Minimum gap (ms) between spoken updates (`realtime.narration.paceMs`); absent/invalid uses the default. */
    NarrationPaceMs?: number | null;
}

/** Narration state and pacing for one realtime session. One instance per session. */
export class DelegationNarrator {
    /** First spoken update fires no earlier than this long after a delegation burst starts. */
    private static readonly firstNarrationDelayMs = 5000;
    /** Minimum gap between SUBSEQUENT spoken updates (floods aggregate into one digest). */
    private static readonly defaultIntervalMs = 8000;
    /** Max progress messages aggregated into one spoken digest. */
    private static readonly maxDigestMessages = 4;
    /**
     * Progress steps worth narrating — mirrors the client-direct resolver's filter so both topologies narrate the
     * same signal and drop the same initialization/finalization noise.
     */
    private static readonly significantProgressSteps = ['prompt_execution', 'action_execution', 'subagent_execution', 'decision_processing'];

    /** Count of delegations currently in flight (anchors the burst lifecycle). */
    private activeDelegations = 0;
    /** Epoch ms when the current burst began (first in-flight delegation); 0 = no active burst. */
    private burstStartedAt = 0;
    /** Epoch ms of the last spoken update; 0 = never. SESSION-global spacing floor. */
    private lastNarrationAt = 0;
    /** Spoken updates so far in the current burst (1-based numbering for the instructions). */
    private narrationCount = 0;
    /** Aggregation buffer: distinct progress messages since the last spoken update (oldest first). */
    private pendingMessages: string[] = [];
    /** Tail message of the last digest, so an identical trailing progress event is not re-buffered. */
    private lastNarratedTail = '';
    /** Pending deferred-narration timer; cancelled when the delegation finishes or the user barges in. */
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly deps: DelegationNarratorDeps) {}

    /**
     * Runs one delegated call through `delegate` while owning the narration burst around it: progress events are
     * threaded back through {@link DelegateToTargetRequest.OnProgress}, and when the delegation finishes (success,
     * failure or abort) any still-pending spoken update is cancelled — the final result is about to be voiced.
     */
    public async Run(request: DelegateToTargetRequest, delegate: (request: DelegateToTargetRequest) => Promise<DelegatedResult>): Promise<DelegatedResult> {
        return this.Track(() => delegate({ ...request, OnProgress: (progress) => this.HandleProgress(progress) }));
    }

    /**
     * Owns the narration burst around any delegated work: anchors a burst when `work` starts and cancels pending
     * narration when it settles. Use this directly when the caller threads {@link HandleProgress} through as the
     * delegated run's own progress callback (the bridged-call path), rather than through {@link Run}.
     */
    public async Track<T>(work: () => Promise<T>): Promise<T> {
        this.beginDelegation();
        try {
            return await work();
        } finally {
            this.endDelegation();
        }
    }

    /** Cancels any deferred spoken update, drops the digest buffer and resets the burst-timing state. */
    public Cancel(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.pendingMessages = [];
        this.burstStartedAt = 0;
        this.narrationCount = 0;
        this.lastNarratedTail = '';
    }

    /**
     * Consumes one delegated-run progress event: significant steps only; always a context note; and a throttled
     * spoken update when the provider can voice one.
     */
    public HandleProgress(progress: { step: string; message: string }): void {
        if (!DelegationNarrator.significantProgressSteps.includes(progress.step)) {
            return;
        }
        const session = this.deps.GetSession();
        if (!session || this.activeDelegations === 0) {
            return; // session gone / delegation already finished — stale event
        }
        session.SendContextNote?.(`[delegated-agent progress] ${progress.message}`);
        if (!session.RequestSpokenUpdate) {
            return; // provider can't voice an instructed one-off update — context note only
        }
        this.bufferMessage(progress.message);
        if (this.pendingMessages.length > 0 && !this.timer) {
            this.timer = setTimeout(() => this.fireDeferredNarration(), this.nextDelayMs());
        }
    }

    /**
     * Anchors a fresh burst when nothing else is in flight OR the burst state was reset (by {@link Cancel}) — the
     * second condition keeps timing correct when a prior delegation failed to honour its abort and left the
     * counter elevated. {@link lastNarrationAt} is deliberately NOT reset across bursts.
     */
    private beginDelegation(): void {
        if (this.activeDelegations === 0 || this.burstStartedAt === 0) {
            this.burstStartedAt = Date.now();
            this.narrationCount = 0;
            this.pendingMessages = [];
            this.lastNarratedTail = '';
        }
        this.activeDelegations++;
    }

    /** Closes one delegation; when none remain in flight, pending narration is cancelled. */
    private endDelegation(): void {
        this.activeDelegations = Math.max(0, this.activeDelegations - 1);
        if (this.activeDelegations === 0) {
            this.Cancel();
        }
    }

    /** Adds a progress message to the digest buffer (deduped, capped, oldest-first). */
    private bufferMessage(message: string): void {
        if (message === this.lastNarratedTail || this.pendingMessages.includes(message)) {
            return;
        }
        this.pendingMessages.push(message);
        if (this.pendingMessages.length > DelegationNarrator.maxDigestMessages) {
            this.pendingMessages.shift();
        }
    }

    /** ms until the next spoken update is allowed: >= ~5 s after the burst began AND >= the interval since the last. */
    private nextDelayMs(): number {
        const now = Date.now();
        const firstAnchor = this.narrationCount === 0 ? this.burstStartedAt + DelegationNarrator.firstNarrationDelayMs : 0;
        const spacingFloor = this.lastNarrationAt > 0 ? this.lastNarrationAt + this.intervalMs() : 0;
        return Math.max(50, Math.max(firstAnchor, spacingFloor) - now);
    }

    /** The configured pace when it is a positive finite number, else the built-in default. */
    private intervalMs(): number {
        const pace = this.deps.NarrationPaceMs;
        return typeof pace === 'number' && Number.isFinite(pace) && pace > 0 ? pace : DelegationNarrator.defaultIntervalMs;
    }

    /** Speaks the aggregated digest — unless the work already finished or the session is gone. */
    private fireDeferredNarration(): void {
        this.timer = null;
        const session = this.deps.GetSession();
        if (!session?.RequestSpokenUpdate || this.pendingMessages.length === 0 || this.activeDelegations === 0) {
            this.pendingMessages = [];
            return;
        }
        const digest = this.pendingMessages.join(' → ');
        this.lastNarratedTail = this.pendingMessages[this.pendingMessages.length - 1];
        this.pendingMessages = [];
        this.narrationCount++;
        this.lastNarrationAt = Date.now();
        session.RequestSpokenUpdate(BuildServerNarrationInstructions(this.deps.NarrationInstructionsTemplate, digest, this.narrationCount));
    }
}
