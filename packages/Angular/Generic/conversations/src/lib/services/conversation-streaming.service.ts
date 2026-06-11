/**
 * @fileoverview Angular DI shim over the framework-agnostic `ConversationStreaming`
 * from `@memberjunction/conversations-runtime`.
 *
 * The PubSub subscription, message routing, completion replay, and reconnection
 * logic all moved into the runtime in PR 2a. This service is now a thin pass-
 * through. The runtime accesses the active-task tracker via the adapter
 * registered by `ConversationsRuntimeBootstrap`.
 *
 * **For new code:** prefer `ConversationsRuntime.Instance.Streaming` directly.
 */

import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
    ConversationsRuntime,
    type CompletionEvent,
    type MessageProgressCallback,
    type MessageProgressMetadata,
    type MessageProgressUpdate,
    type StreamingConnectionStatus,
} from '@memberjunction/conversations-runtime';

import { ConversationsRuntimeBootstrap } from './conversations-runtime-bootstrap.service';

// Re-export the runtime's types so existing imports from this file continue to compile.
export type {
    CompletionEvent,
    MessageProgressCallback,
    MessageProgressMetadata,
    MessageProgressUpdate,
    StreamingConnectionStatus,
};

@Injectable({ providedIn: 'root' })
export class ConversationStreamingService implements OnDestroy {
    constructor(_bootstrap: ConversationsRuntimeBootstrap) {
        // Injecting the bootstrap forces adapter registration on first construction.
    }

    private get streaming() {
        return ConversationsRuntime.Instance.Streaming;
    }

    /** Pass-through to {@link ConversationsRuntime.Instance.Streaming.completionEvents$}. */
    public get completionEvents$(): Subject<CompletionEvent> {
        return this.streaming.completionEvents$;
    }

    public initialize(): void {
        this.streaming.initialize();
    }

    public getConnectionStatus$(): Observable<StreamingConnectionStatus> {
        return this.streaming.getConnectionStatus$();
    }

    public getConnectionStatus(): StreamingConnectionStatus {
        return this.streaming.getConnectionStatus();
    }

    public registerMessageCallback(
        conversationDetailId: string,
        callback: MessageProgressCallback
    ): void {
        this.streaming.registerMessageCallback(conversationDetailId, callback);
    }

    public unregisterMessageCallback(
        conversationDetailId: string,
        callback?: MessageProgressCallback
    ): void {
        this.streaming.unregisterMessageCallback(conversationDetailId, callback);
    }

    public getRegisteredCallbackCount(): number {
        return this.streaming.getRegisteredCallbackCount();
    }

    public getTrackedMessageCount(): number {
        return this.streaming.getTrackedMessageCount();
    }

    public getRecentCompletion(conversationDetailId: string): { agentRunId: string } | undefined {
        return this.streaming.getRecentCompletion(conversationDetailId);
    }

    public clearRecentCompletion(conversationDetailId: string): void {
        this.streaming.clearRecentCompletion(conversationDetailId);
    }

    public getDiagnosticSnapshot(messageId: string): ReturnType<
        typeof ConversationsRuntime.Instance.Streaming.getDiagnosticSnapshot
    > {
        return this.streaming.getDiagnosticSnapshot(messageId);
    }

    /**
     * Angular OnDestroy hook. We do NOT call the runtime's Streaming.Dispose()
     * here — that would tear down a shared singleton on a per-injector destroy,
     * which could affect other consumers. The runtime is process-scoped; its
     * lifecycle ends with the process, not with any Angular injector.
     */
    public ngOnDestroy(): void {
        // intentionally empty — see jsdoc above
    }
}
