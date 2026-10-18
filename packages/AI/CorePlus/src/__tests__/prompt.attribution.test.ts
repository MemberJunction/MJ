import { describe, it, expect } from 'vitest';
import { ResolvePromptRunUserID } from '../prompt.types';

describe('ResolvePromptRunUserID', () => {
  it('returns null when input is undefined, null, or empty', () => {
    expect(ResolvePromptRunUserID()).toBeNull();
    expect(ResolvePromptRunUserID(null)).toBeNull();
    expect(ResolvePromptRunUserID({})).toBeNull();
  });

  it('prioritizes an explicit UserID over AgentRun.UserID and ContextUser.ID', () => {
    expect(
      ResolvePromptRunUserID({
        UserID: 'explicit-user-1',
        AgentRun: { UserID: 'agent-run-user-2' },
        ContextUser: { ID: 'context-user-3' },
      })
    ).toBe('explicit-user-1');
  });

  it('falls back to AgentRun.UserID when no explicit UserID is provided', () => {
    expect(
      ResolvePromptRunUserID({
        AgentRun: { UserID: 'agent-run-user-2' },
        ContextUser: { ID: 'context-user-3' },
      })
    ).toBe('agent-run-user-2');
  });

  it('falls back to ContextUser.ID when neither UserID nor AgentRun.UserID is provided', () => {
    expect(
      ResolvePromptRunUserID({
        AgentRun: {},
        ContextUser: { ID: 'context-user-3' },
      })
    ).toBe('context-user-3');
  });

  it('treats empty strings and nulls as absent at every level', () => {
    expect(
      ResolvePromptRunUserID({
        UserID: '',
        AgentRun: { UserID: '' },
        ContextUser: { ID: 'context-user-3' },
      })
    ).toBe('context-user-3');

    expect(
      ResolvePromptRunUserID({
        UserID: null,
        AgentRun: { UserID: null },
        ContextUser: { ID: 'context-user-3' },
      })
    ).toBe('context-user-3');

    expect(ResolvePromptRunUserID({ UserID: '', AgentRun: null, ContextUser: { ID: '' } })).toBeNull();
  });
});
