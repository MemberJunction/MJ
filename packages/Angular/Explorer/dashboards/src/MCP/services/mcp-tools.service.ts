/**
 * @fileoverview MCP Tools Service
 *
 * Service for managing MCP tool operations including synchronization
 * with real-time progress streaming via GraphQL subscriptions.
 */

import { Injectable, OnDestroy } from '@angular/core';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';
import { Subject, BehaviorSubject, Observable } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';

/**
 * Result of an MCP tool sync operation
 */
export interface MCPSyncResult {
    Success: boolean;
    ErrorMessage?: string;
    Added: number;
    Updated: number;
    Deprecated: number;
    Total: number;
    ServerName?: string;
    ConnectionName?: string;
    /** Whether OAuth authorization is required before connecting */
    RequiresOAuth?: boolean;
    /** OAuth authorization URL if authorization is required */
    AuthorizationUrl?: string;
    /** OAuth state parameter for tracking the authorization flow */
    StateParameter?: string;
    /** Whether OAuth re-authorization is required */
    RequiresReauthorization?: boolean;
    /** Reason for re-authorization if required */
    ReauthorizationReason?: string;
}

/**
 * Progress message received during sync
 */
export interface MCPSyncProgress {
    resolver: string;
    type: string;
    status: 'ok' | 'error';
    connectionId: string;
    phase: 'connecting' | 'listing' | 'syncing' | 'complete' | 'error';
    message: string;
    progress?: {
        current?: number;
        total?: number;
        percentage?: number;
    };
    result?: {
        added: number;
        updated: number;
        deprecated: number;
        total: number;
    };
}

/**
 * Sync state for a connection
 */
export interface MCPSyncState {
    isSyncing: boolean;
    progress: MCPSyncProgress | null;
    lastResult: MCPSyncResult | null;
    error: string | null;
}

/**
 * GraphQL mutation for syncing MCP tools
 */
const SyncMCPToolsMutation = gql`
    mutation SyncMCPTools($input: SyncMCPToolsInput!) {
        SyncMCPTools(input: $input) {
            Success
            ErrorMessage
            Added
            Updated
            Deprecated
            Total
            ServerName
            ConnectionName
            RequiresOAuth
            AuthorizationUrl
            StateParameter
            RequiresReauthorization
            ReauthorizationReason
        }
    }
`;

/**
 * Service for MCP tool synchronization operations
 */
@Injectable({
    providedIn: 'root'
})
export class MCPToolsService implements OnDestroy {
    private destroy$ = new Subject<void>();

    /** Map of connection ID to sync state */
    private syncStates = new Map<string, BehaviorSubject<MCPSyncState>>();

    /** Provider instance for GraphQL operations */
    private gqlProvider = GraphQLDataProvider.Instance;

    constructor() {
        this.setupProgressListener();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.syncStates.forEach(state => state.complete());
        this.syncStates.clear();
    }

    /**
     * Gets the sync state observable for a connection
     */
    public GetSyncState(connectionId: string): Observable<MCPSyncState> {
        return this.getOrCreateSyncState(connectionId).asObservable();
    }

    /** @deprecated Use {@link GetSyncState}. */
    public getSyncState(connectionId: string): Observable<MCPSyncState> {
        return this.GetSyncState(connectionId);
    }

    /**
     * Gets the current sync state value for a connection
     */
    public GetSyncStateValue(connectionId: string): MCPSyncState {
        return this.getOrCreateSyncState(connectionId).getValue();
    }

    /** @deprecated Use {@link GetSyncStateValue}. */
    public getSyncStateValue(connectionId: string): MCPSyncState {
        return this.GetSyncStateValue(connectionId);
    }

    /**
     * Checks if a connection is currently syncing
     */
    public IsSyncing(connectionId: string): boolean {
        const state = this.syncStates.get(connectionId);
        return state ? state.getValue().isSyncing : false;
    }

    /** @deprecated Use {@link IsSyncing}. */
    public isSyncing(connectionId: string): boolean {
        return this.IsSyncing(connectionId);
    }

    /**
     * Syncs tools for a specific MCP connection
     *
     * @param connectionId - The ID of the MCP connection to sync
     * @param forceSync - Optional flag to force sync even if recently synced
     * @returns Promise resolving to the sync result
     */
    public async SyncTools(connectionId: string, forceSync = false): Promise<MCPSyncResult> {
        const state$ = this.getOrCreateSyncState(connectionId);

        // Check if already syncing
        if (state$.getValue().isSyncing) {
            throw new Error('Sync already in progress for this connection');
        }

        // Update state to syncing
        state$.next({
            ...state$.getValue(),
            isSyncing: true,
            progress: {
                resolver: 'MCPResolver',
                type: 'MCPToolSyncProgress',
                status: 'ok',
                connectionId,
                phase: 'connecting',
                message: 'Starting sync...'
            },
            error: null
        });

        try {
            // Execute the mutation
            const result = await this.gqlProvider.ExecuteGQL(SyncMCPToolsMutation, {
                input: {
                    ConnectionID: connectionId,
                    ForceSync: forceSync
                }
            });

            const syncResult: MCPSyncResult = result?.SyncMCPTools || {
                Success: false,
                ErrorMessage: 'No result returned from server',
                Added: 0,
                Updated: 0,
                Deprecated: 0,
                Total: 0
            };

            // Update state with result
            state$.next({
                isSyncing: false,
                progress: null,
                lastResult: syncResult,
                error: syncResult.Success ? null : (syncResult.ErrorMessage || 'Sync failed')
            });

            return syncResult;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);

            // Update state with error
            state$.next({
                isSyncing: false,
                progress: null,
                lastResult: null,
                error: errorMsg
            });

            return {
                Success: false,
                ErrorMessage: errorMsg,
                Added: 0,
                Updated: 0,
                Deprecated: 0,
                Total: 0
            };
        }
    }

    /** @deprecated Use {@link SyncTools}. */
    public async syncTools(connectionId: string, forceSync = false): Promise<MCPSyncResult> {
        return this.SyncTools(connectionId, forceSync);
    }

    /**
     * Clears the sync state for a connection
     */
    public ClearSyncState(connectionId: string): void {
        const state$ = this.syncStates.get(connectionId);
        if (state$) {
            state$.next({
                isSyncing: false,
                progress: null,
                lastResult: null,
                error: null
            });
        }
    }

    /** @deprecated Use {@link ClearSyncState}. */
    public clearSyncState(connectionId: string): void {
        return this.ClearSyncState(connectionId);
    }

    /**
     * Gets or creates a sync state subject for a connection
     */
    private getOrCreateSyncState(connectionId: string): BehaviorSubject<MCPSyncState> {
        let state$ = this.syncStates.get(connectionId);
        if (!state$) {
            state$ = new BehaviorSubject<MCPSyncState>({
                isSyncing: false,
                progress: null,
                lastResult: null,
                error: null
            });
            this.syncStates.set(connectionId, state$);
        }
        return state$;
    }

    /**
     * Sets up listener for progress updates via the GraphQL subscription
     * The statusUpdates subscription receives progress messages during sync
     */
    private setupProgressListener(): void {
        // Listen for status updates from the GraphQL provider
        // These come through the existing PUSH_STATUS_UPDATES subscription
        // PushStatusUpdates returns Observable<string> with the message content
        this.gqlProvider.PushStatusUpdates()
            .pipe(
                takeUntil(this.destroy$),
                filter((message: string) => {
                    try {
                        const parsed = JSON.parse(message || '{}');
                        return parsed.type === 'MCPToolSyncProgress';
                    } catch {
                        return false;
                    }
                })
            )
            .subscribe((message: string) => {
                try {
                    const progress: MCPSyncProgress = JSON.parse(message || '{}');
                    this.handleProgressUpdate(progress);
                } catch (error) {
                    console.error('Failed to parse MCP sync progress:', error);
                }
            });
    }

    /**
     * Handles a progress update from the server
     */
    private handleProgressUpdate(progress: MCPSyncProgress): void {
        const state$ = this.syncStates.get(progress.connectionId);
        if (state$ && state$.getValue().isSyncing) {
            state$.next({
                ...state$.getValue(),
                progress
            });
        }
    }
}
