import { describe, it, expect } from 'vitest';
import {
  ResolvePromptRunAttribution,
  resolvePromptRunAttribution,
  ResolvePromptRunAttributionInput,
} from '../prompt.types';

describe('ResolvePromptRunAttribution', () => {
  it('returns null for both agentRunId and userId when input is undefined or null', () => {
    expect(ResolvePromptRunAttribution()).toEqual({ agentRunId: null, userId: null });
    expect(ResolvePromptRunAttribution(null)).toEqual({ agentRunId: null, userId: null });
    expect(ResolvePromptRunAttribution({})).toEqual({ agentRunId: null, userId: null });
  });

  describe('AgentRunID attribution precedence', () => {
    it('prioritizes explicit agentRunId over agentRun.ID', () => {
      const input: ResolvePromptRunAttributionInput = {
        agentRunId: 'explicit-agent-run-123',
        agentRun: { ID: 'enclosing-agent-run-456', UserID: 'user-789' },
      };
      const result = ResolvePromptRunAttribution(input);
      expect(result.agentRunId).toBe('explicit-agent-run-123');
    });

    it('falls back to agentRun.ID when explicit agentRunId is not provided', () => {
      const input: ResolvePromptRunAttributionInput = {
        agentRun: { ID: 'enclosing-agent-run-456' },
      };
      const result = ResolvePromptRunAttribution(input);
      expect(result.agentRunId).toBe('enclosing-agent-run-456');
    });

    it('falls back to agentRun.ID when explicit agentRunId is null or empty string', () => {
      expect(
        ResolvePromptRunAttribution({
          agentRunId: null,
          agentRun: { ID: 'enclosing-agent-run-456' },
        }).agentRunId
      ).toBe('enclosing-agent-run-456');

      expect(
        ResolvePromptRunAttribution({
          agentRunId: '',
          agentRun: { ID: 'enclosing-agent-run-456' },
        }).agentRunId
      ).toBe('enclosing-agent-run-456');
    });

    it('returns null when neither explicit agentRunId nor agentRun.ID is provided', () => {
      const input: ResolvePromptRunAttributionInput = {
        userId: 'user-123',
        contextUser: { ID: 'user-456' },
      };
      const result = ResolvePromptRunAttribution(input);
      expect(result.agentRunId).toBeNull();
    });
  });

  describe('UserID attribution precedence', () => {
    it('prioritizes explicit userId over agentRun.UserID and contextUser.ID', () => {
      const input: ResolvePromptRunAttributionInput = {
        userId: 'explicit-user-1',
        agentRun: { ID: 'run-1', UserID: 'agent-run-user-2' },
        contextUser: { ID: 'context-user-3' },
      };
      const result = ResolvePromptRunAttribution(input);
      expect(result.userId).toBe('explicit-user-1');
    });

    it('falls back to agentRun.UserID when explicit userId is not provided', () => {
      const input: ResolvePromptRunAttributionInput = {
        agentRun: { ID: 'run-1', UserID: 'agent-run-user-2' },
        contextUser: { ID: 'context-user-3' },
      };
      const result = ResolvePromptRunAttribution(input);
      expect(result.userId).toBe('agent-run-user-2');
    });

    it('falls back to contextUser.ID when neither explicit userId nor agentRun.UserID is provided', () => {
      const input: ResolvePromptRunAttributionInput = {
        agentRun: { ID: 'run-1' },
        contextUser: { ID: 'context-user-3' },
      };
      const result = ResolvePromptRunAttribution(input);
      expect(result.userId).toBe('context-user-3');
    });

    it('falls back when explicit userId or agentRun.UserID are empty strings or null', () => {
      expect(
        ResolvePromptRunAttribution({
          userId: '',
          agentRun: { ID: 'run-1', UserID: '' },
          contextUser: { ID: 'context-user-3' },
        }).userId
      ).toBe('context-user-3');

      expect(
        ResolvePromptRunAttribution({
          userId: null,
          agentRun: { ID: 'run-1', UserID: null },
          contextUser: { ID: 'context-user-3' },
        }).userId
      ).toBe('context-user-3');
    });

    it('returns null when no userId, agentRun.UserID, or contextUser.ID is provided', () => {
      const input: ResolvePromptRunAttributionInput = {
        agentRunId: 'run-1',
      };
      const result = ResolvePromptRunAttribution(input);
      expect(result.userId).toBeNull();
    });
  });

  describe('Alias and full combination test', () => {
    it('resolvePromptRunAttribution alias behaves identically', () => {
      const input: ResolvePromptRunAttributionInput = {
        agentRunId: 'run-abc',
        userId: 'user-xyz',
      };
      expect(resolvePromptRunAttribution(input)).toEqual({
        agentRunId: 'run-abc',
        userId: 'user-xyz',
      });
    });
  });
});
