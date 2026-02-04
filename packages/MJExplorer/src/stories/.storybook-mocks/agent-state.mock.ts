import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Agent status types matching the real service
 */
export type AgentStatus = 'acknowledging' | 'working' | 'completing' | 'completed' | 'error';

/**
 * Mock agent run interface for stories
 */
export interface MockAgentRun {
  ID: string;
  Agent: string;
  ConversationID?: string;
  Status?: string;
  StartedAt?: Date;
  Result?: string;
}

/**
 * Agent with status interface matching the real service
 */
export interface AgentWithStatus {
  run: MockAgentRun;
  status: AgentStatus;
  confidence: number | null;
}

/**
 * Mock AgentStateService for Storybook stories.
 * Provides controllable state without DB polling.
 */
@Injectable()
export class MockAgentStateService {
  private readonly activeAgentsSubject = new BehaviorSubject<AgentWithStatus[]>([]);

  public readonly activeAgents$ = this.activeAgentsSubject.asObservable();

  /**
   * Get active agents observable, optionally filtered by conversation
   */
  getActiveAgents(conversationId?: string): Observable<AgentWithStatus[]> {
    if (conversationId) {
      return this.activeAgents$.pipe(
        map(agents => agents.filter(a => a.run.ConversationID === conversationId))
      );
    }
    return this.activeAgents$;
  }

  /**
   * Storybook-specific: Set agents directly for story control
   */
  setActiveAgents(agents: AgentWithStatus[]): void {
    this.activeAgentsSubject.next(agents);
  }

  /**
   * Storybook-specific: Add a single agent
   */
  addAgent(agent: AgentWithStatus): void {
    const current = this.activeAgentsSubject.value;
    this.activeAgentsSubject.next([...current, agent]);
  }

  /**
   * Storybook-specific: Remove an agent by ID
   */
  removeAgent(agentRunId: string): void {
    const current = this.activeAgentsSubject.value;
    this.activeAgentsSubject.next(current.filter(a => a.run.ID !== agentRunId));
  }

  /**
   * Storybook-specific: Clear all agents
   */
  clearAgents(): void {
    this.activeAgentsSubject.next([]);
  }

  // Stub methods that the real service has
  startPolling(): void {
    // No-op in mock
  }

  stopPolling(): void {
    // No-op in mock
  }

  async refresh(): Promise<void> {
    // No-op in mock
  }
}

/**
 * Helper to create a mock agent for stories
 */
export function createMockAgent(
  name: string,
  status: AgentStatus,
  confidence: number | null = null,
  conversationId?: string
): AgentWithStatus {
  return {
    run: {
      ID: `agent-${Math.random().toString(36).substr(2, 9)}`,
      Agent: name,
      ConversationID: conversationId,
      Status: status === 'completed' ? 'Completed' : 'Running',
      StartedAt: new Date()
    },
    status,
    confidence
  };
}
