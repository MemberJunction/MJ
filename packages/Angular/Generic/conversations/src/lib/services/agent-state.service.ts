import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';
import { LogStatusEx, RunView, UserInfo, Metadata, IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { ConversationStreamingService } from './conversation-streaming.service';

export type AgentStatus = 'acknowledging' | 'working' | 'completing' | 'completed' | 'error';

export interface AgentWithStatus {
  run: MJAIAgentRunEntity;
  status: AgentStatus;
  confidence: number | null;
}

/**
 * Manages agent state and provides real-time updates for active agents
 * Polls for agent status changes and provides reactive streams
 */
@Injectable({
  providedIn: 'root'
})
export class AgentStateService implements OnDestroy {
  private _activeAgents$ = new BehaviorSubject<AgentWithStatus[]>([]);
  private pollSubscription?: Subscription;
  /** Subscription to ConversationStreamingService completion-event push stream. Drives primary state. */
  private completionSubscription?: Subscription;
  private currentUser?: UserInfo;
  /** Track the active conversation filter so completion-driven refreshes apply the same scope. */
  private currentConversationId?: string;
  /** Fallback poll cadence — 5 min. Primary state is driven by push events. Polling exists only
   *  to recover from missed push events (WebSocket disconnects, server-side state changes that
   *  bypass the push channel). */
  private pollInterval: number = 300000;
  private pollCycleCount = 0;
  /** Minimum poll cycles before allowing auto-stop. Prevents premature shutdown
   *  when fire-and-forget ACK returns before the server creates the agent run record. */
  private readonly minimumPollCycles = 3;

  // Public observable streams
  public readonly activeAgents$ = this._activeAgents$.asObservable();

  private _provider: IMetadataProvider | null = null;

  /** Injected push-event service. Used to subscribe to completion events as the
   *  primary state-change signal (replaces previous tight polling cadence). */
  private streamingService = inject(ConversationStreamingService);

  constructor() {}

  /**
   * Set the metadata provider this service should use. When unset, falls back to Metadata.Provider.
   */
  public set Provider(value: IMetadataProvider | null) {
      this._provider = value;
  }

  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /**
   * Starts tracking active agents.
   *
   * Despite the legacy name, this is NOT a tight polling loop anymore. Behavior:
   *   1. Initial `loadActiveAgents` to bootstrap state from the database
   *   2. Subscribe to {@link ConversationStreamingService.completionEvents$} — this is the
   *      PRIMARY source of state changes. When an agent finishes server-side, the push
   *      arrives in milliseconds and we update state immediately.
   *   3. A long-interval safety-net poll (5 min by default — see {@link pollInterval}) that
   *      reconciles state in case a push event was missed (WebSocket disconnect, missed broadcast).
   *
   * @param currentUser The current user context
   * @param conversationId Optional conversation ID to filter by
   */
  startPolling(currentUser: UserInfo, conversationId?: string): void {
    this.currentUser = currentUser;
    this.currentConversationId = conversationId;
    this.stopPolling();
    this.pollCycleCount = 0;

    // Initial load — bootstraps state from DB (catches agents that were already running
    // when this service started, e.g. user reloaded the page mid-conversation).
    this.loadActiveAgents(conversationId);

    // Primary state signal: subscribe to push-driven completion events.
    // The server publishes via PUSH_STATUS_UPDATES_TOPIC; ConversationStreamingService
    // normalizes those into completionEvents$. When an agent finishes, we reconcile
    // immediately rather than waiting for the next poll tick.
    this.completionSubscription = this.streamingService.completionEvents$.subscribe(event => {
      this.handleCompletionEvent(event);
    });

    // Safety-net poll — 5 min interval. Recovers from missed push events.
    // Cheap because: (a) it's 10× less frequent than before, (b) the auto-stop-after-N-idle-cycles
    // logic in loadActiveAgents still runs.
    this.pollSubscription = interval(this.pollInterval)
      .pipe(switchMap(() => this.loadActiveAgents(conversationId)))
      .subscribe();
  }

  /**
   * Stops tracking. Unsubscribes from both the push stream and the safety-net poll.
   */
  stopPolling(): void {
    if (this.pollSubscription) {
      this.pollSubscription.unsubscribe();
      this.pollSubscription = undefined;
    }
    if (this.completionSubscription) {
      this.completionSubscription.unsubscribe();
      this.completionSubscription = undefined;
    }
  }

  /**
   * Handle a push-driven completion event. Removes the completed agent from active state
   * immediately (no waiting for poll), then triggers a confirmation refresh to catch any
   * sibling agents that may have transitioned concurrently.
   */
  private handleCompletionEvent(event: { agentRunId: string; conversationDetailId: string }): void {
    if (!event?.agentRunId) return;

    const current = this._activeAgents$.value;
    const idx = current.findIndex(a => UUIDsEqual(a.run.ID, event.agentRunId));
    if (idx === -1) {
      // We weren't tracking this agent — nothing to remove. Could happen if the agent started
      // before we subscribed, or if this completion belongs to a different conversation scope.
      return;
    }

    // Optimistic local removal — UI reflects "agent done" instantly.
    const updated = current.filter((_, i) => i !== idx);
    this._activeAgents$.next(updated);

    // Reconcile with DB. Catches:
    //   - Sibling agents that transitioned in parallel
    //   - The completed agent having actually transitioned to e.g. Failed instead of Completed
    // Cheap: one RunView call, fired only on real completion events.
    this.loadActiveAgents(this.currentConversationId);
  }

  /**
   * Gets active agents as an observable
   * @param conversationId Optional conversation ID to filter by
   */
  getActiveAgents(conversationId?: string): Observable<AgentWithStatus[]> {
    if (conversationId) {
      return this.activeAgents$.pipe(
        map(agents => agents.filter(a => UUIDsEqual(a.run.ConversationID, conversationId))),
        shareReplay(1)
      );
    }
    return this.activeAgents$;
  }

  /**
   * Gets a specific agent by ID
   * @param agentRunId The agent run ID
   */
  getAgent(agentRunId: string): AgentWithStatus | undefined {
    return this._activeAgents$.value.find(a => UUIDsEqual(a.run.ID, agentRunId));
  }

  /**
   * Manually refreshes active agents
   * @param conversationId Optional conversation ID to filter by
   */
  async refresh(conversationId?: string): Promise<void> {
    await this.loadActiveAgents(conversationId);
  }

  /**
   * Loads active agents from the database
   */
  private async loadActiveAgents(conversationId?: string): Promise<void> {
    if (!this.currentUser) {
      return;
    }

    this.pollCycleCount++;
    const timestamp = new Date().toISOString();
    LogStatusEx({message: `[${timestamp}] 🤖 AgentStateService.loadActiveAgents - Polling for active agents (conversation: ${conversationId || 'ALL'}, cycle: ${this.pollCycleCount})`, verboseOnly: true});

    try {
      const rv = RunView.FromMetadataProvider(this.Provider);
      // Valid statuses: Running, Completed, Paused, Failed, Cancelled
      let filter = `Status IN ('Running', 'Paused')`;

      if (conversationId) {
        filter += ` AND ConversationID='${conversationId}'`;
      }

      LogStatusEx({message: `[${timestamp}] 🤖 AgentStateService - Executing RunView for AI Agent Runs`, verboseOnly: true});
      const result = await rv.RunView<MJAIAgentRunEntity>(
        {
          EntityName: 'MJ: AI Agent Runs',
          ExtraFilter: filter,
          OrderBy: 'StartedAt DESC',
          MaxRows: 50,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (result.Success) {
        const runs = result.Results || [];
        LogStatusEx({message: `[${timestamp}] 🤖 AgentStateService - Found ${runs.length} active agent(s)`, verboseOnly: true});
        const agentsWithStatus = runs.map(run => this.mapRunToAgentWithStatus(run));
        this._activeAgents$.next(agentsWithStatus);

        // Stop polling if no active agents AND minimum cycles met (optimization to reduce DB load).
        // The minimum cycle guard prevents premature shutdown when fire-and-forget returns
        // before the server has created the agent run record.
        if (runs.length === 0 && this.pollSubscription && this.pollCycleCount >= this.minimumPollCycles) {
          LogStatusEx({message: `[${timestamp}] 🤖 AgentStateService - No active agents after ${this.pollCycleCount} cycles, stopping polling`, verboseOnly: true});
          this.stopPolling();
        }
      }
    } catch (error) {
      console.error('Failed to load active agents:', error);
    }
  }

  /**
   * Maps an agent run to include status and confidence information
   */
  private mapRunToAgentWithStatus(run: MJAIAgentRunEntity): AgentWithStatus {
    const status = this.determineAgentStatus(run);
    const confidence = this.extractConfidence(run);

    return {
      run,
      status,
      confidence
    };
  }

  /**
   * Determines the agent status based on the run entity
   */
  private determineAgentStatus(run: MJAIAgentRunEntity): AgentStatus {
    const status = run.Status?.toLowerCase() || 'running';

    // Check for errors
    if (status === 'error' || status === 'failed') {
      return 'error';
    }

    // Check for completion
    if (status === 'completed' || status === 'complete' || status === 'success') {
      return 'completed';
    }

    // Determine stage based on progress or elapsed time
    if (run.StartedAt) {
      const elapsed = Date.now() - new Date(run.StartedAt).getTime();
      const seconds = elapsed / 1000;

      // First 5 seconds: acknowledging
      if (seconds < 5) {
        return 'acknowledging';
      }

      // Check if nearing completion (has results or output)
      if (run.Result || run.Status === 'Completed') {
        // If there's output, likely completing
        return 'completing';
      }

      // Otherwise, working
      return 'working';
    }

    // Default to acknowledging if just started
    return 'acknowledging';
  }

  /**
   * Extracts confidence score from agent run if available
   */
  private extractConfidence(run: MJAIAgentRunEntity): number | null {
    // Try to parse confidence from Result or other fields
    // This is a placeholder - adjust based on actual data structure
    try {
      if (run.Result) {
        const result = typeof run.Result === 'string' ? JSON.parse(run.Result) : run.Result;
        if (result.confidence != null) {
          return parseFloat(result.confidence);
        }
      }
    } catch {
      // Ignore parse errors
    }

    return null;
  }

  /**
   * Cancels an agent run
   * @param agentRunId The agent run ID to cancel
   */
  async cancelAgent(agentRunId: string): Promise<boolean> {
    if (!this.currentUser) {
      return false;
    }

    try {
      const agent = this.getAgent(agentRunId);
      if (!agent) {
        return false;
      }

      agent.run.Status = 'Cancelled';
      const saved = await agent.run.Save();

      if (saved) {
        // Refresh the active agents list
        await this.refresh();
        return true;
      }
    } catch (error) {
      console.error('Failed to cancel agent:', error);
    }

    return false;
  }

  /**
   * Updates the poll interval
   * @param milliseconds The new poll interval in milliseconds
   */
  setPollInterval(milliseconds: number): void {
    this.pollInterval = milliseconds;

    // Restart polling if currently active
    if (this.pollSubscription && this.currentUser) {
      this.startPolling(this.currentUser);
    }
  }
}
