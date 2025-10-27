import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';
import { RunView, UserInfo } from '@memberjunction/global';
import { AIAgentRunEntity } from '@memberjunction/core-entities';

export type AgentStatus = 'acknowledging' | 'working' | 'completing' | 'completed' | 'error';

export interface AgentWithStatus {
  run: AIAgentRunEntity;
  status: AgentStatus;
  confidence: number | null;
}

/**
 * Manages agent state and provides real-time updates for active agents
 * Polls for agent status changes and provides reactive streams
 */
@Injectable({
  providedIn: 'root',
})
export class AgentStateService implements OnDestroy {
  private _activeAgents$ = new BehaviorSubject<AgentWithStatus[]>([]);
  private pollSubscription?: Subscription;
  private currentUser?: UserInfo;
  private pollInterval: number = 30000; // Poll every 30 seconds (reduced from 3s to minimize DB load)

  // Public observable streams
  public readonly activeAgents$ = this._activeAgents$.asObservable();

  constructor() {}

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /**
   * Starts polling for active agents
   * @param currentUser The current user context
   * @param conversationId Optional conversation ID to filter by
   */
  startPolling(currentUser: UserInfo, conversationId?: string): void {
    this.currentUser = currentUser;
    this.stopPolling();

    // Initial load
    this.loadActiveAgents(conversationId);

    // Start polling
    this.pollSubscription = interval(this.pollInterval)
      .pipe(switchMap(() => this.loadActiveAgents(conversationId)))
      .subscribe();
  }

  /**
   * Stops polling for active agents
   */
  stopPolling(): void {
    if (this.pollSubscription) {
      this.pollSubscription.unsubscribe();
      this.pollSubscription = undefined;
    }
  }

  /**
   * Gets active agents as an observable
   * @param conversationId Optional conversation ID to filter by
   */
  getActiveAgents(conversationId?: string): Observable<AgentWithStatus[]> {
    if (conversationId) {
      return this.activeAgents$.pipe(
        map((agents) => agents.filter((a) => a.run.ConversationID === conversationId)),
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
    return this._activeAgents$.value.find((a) => a.run.ID === agentRunId);
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

    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] 🤖 AgentStateService.loadActiveAgents - Polling for active agents (conversation: ${conversationId || 'ALL'})`
    );

    try {
      const rv = new RunView();
      // Valid statuses: Running, Completed, Paused, Failed, Cancelled
      let filter = `Status IN ('Running', 'Paused')`;

      if (conversationId) {
        filter += ` AND ConversationID='${conversationId}'`;
      }

      console.log(`[${timestamp}] 🤖 AgentStateService - Executing RunView for AI Agent Runs`);
      const result = await rv.RunView<AIAgentRunEntity>(
        {
          EntityName: 'MJ: AI Agent Runs',
          ExtraFilter: filter,
          OrderBy: 'StartedAt DESC',
          MaxRows: 50,
          ResultType: 'entity_object',
        },
        this.currentUser
      );

      if (result.Success) {
        const runs = result.Results || [];
        console.log(`[${timestamp}] 🤖 AgentStateService - Found ${runs.length} active agent(s)`);
        const agentsWithStatus = runs.map((run) => this.mapRunToAgentWithStatus(run));
        this._activeAgents$.next(agentsWithStatus);

        // Stop polling if no active agents (optimization to reduce DB load)
        if (runs.length === 0 && this.pollSubscription) {
          console.log(`[${timestamp}] 🤖 AgentStateService - No active agents, stopping polling`);
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
  private mapRunToAgentWithStatus(run: AIAgentRunEntity): AgentWithStatus {
    const status = this.determineAgentStatus(run);
    const confidence = this.extractConfidence(run);

    return {
      run,
      status,
      confidence,
    };
  }

  /**
   * Determines the agent status based on the run entity
   */
  private determineAgentStatus(run: AIAgentRunEntity): AgentStatus {
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
  private extractConfidence(run: AIAgentRunEntity): number | null {
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
