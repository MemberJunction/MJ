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
    public get CompletionEvents$(): Subject<CompletionEvent> {
        return this.streaming.completionEvents$;
    }

    /** @deprecated Use {@link CompletionEvents$}. */
    public get completionEvents$(): Subject<CompletionEvent> {
        return this.CompletionEvents$;
    }

    public initialize(): void {
        this.streaming.initialize();
    }

    public GetConnectionStatus$(): Observable<StreamingConnectionStatus> {
        return this.streaming.getConnectionStatus$();
    }

    /** @deprecated Use {@link GetConnectionStatus$}. */
    public getConnectionStatus$(): Observable<StreamingConnectionStatus> {
        return this.GetConnectionStatus$();
    }

    public GetConnectionStatus(): StreamingConnectionStatus {
        return this.streaming.getConnectionStatus();
    }

    /** @deprecated Use {@link GetConnectionStatus}. */
    public getConnectionStatus(): StreamingConnectionStatus {
        return this.GetConnectionStatus();
    }

    public RegisterMessageCallback(
        conversationDetailId: string,
        callback: MessageProgressCallback
    ): void {
        this.streaming.registerMessageCallback(conversationDetailId, callback);
    }

    /** @deprecated Use {@link RegisterMessageCallback}. */
    public registerMessageCallback(
        conversationDetailId: string,
        callback: MessageProgressCallback
    ): void {
        return this.RegisterMessageCallback(conversationDetailId, callback);
    }

    public UnregisterMessageCallback(
        conversationDetailId: string,
        callback?: MessageProgressCallback
    ): void {
        this.streaming.unregisterMessageCallback(conversationDetailId, callback);
    }

    /** @deprecated Use {@link UnregisterMessageCallback}. */
    public unregisterMessageCallback(
        conversationDetailId: string,
        callback?: MessageProgressCallback
    ): void {
        return this.UnregisterMessageCallback(conversationDetailId, callback);
    }

    public GetRegisteredCallbackCount(): number {
        return this.streaming.getRegisteredCallbackCount();
    }

    /** @deprecated Use {@link GetRegisteredCallbackCount}. */
    public getRegisteredCallbackCount(): number {
        return this.GetRegisteredCallbackCount();
    }

    public GetTrackedMessageCount(): number {
        return this.streaming.getTrackedMessageCount();
    }

    /** @deprecated Use {@link GetTrackedMessageCount}. */
    public getTrackedMessageCount(): number {
        return this.GetTrackedMessageCount();
    }

    public GetRecentCompletion(conversationDetailId: string): { agentRunId: string } | undefined {
        return this.streaming.getRecentCompletion(conversationDetailId);
    }

    /** @deprecated Use {@link GetRecentCompletion}. */
    public getRecentCompletion(conversationDetailId: string): { agentRunId: string } | undefined {
        return this.GetRecentCompletion(conversationDetailId);
    }

    public ClearRecentCompletion(conversationDetailId: string): void {
        this.streaming.clearRecentCompletion(conversationDetailId);
    }

    /** @deprecated Use {@link ClearRecentCompletion}. */
    public clearRecentCompletion(conversationDetailId: string): void {
        return this.ClearRecentCompletion(conversationDetailId);
    }

    public GetDiagnosticSnapshot(messageId: string): ReturnType<
        typeof ConversationsRuntime.Instance.Streaming.getDiagnosticSnapshot
    > {
        return this.streaming.getDiagnosticSnapshot(messageId);
    }

    /** @deprecated Use {@link GetDiagnosticSnapshot}. */
    public getDiagnosticSnapshot(messageId: string): ReturnType<
        typeof ConversationsRuntime.Instance.Streaming.getDiagnosticSnapshot
    > {
        return this.GetDiagnosticSnapshot(messageId);
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
