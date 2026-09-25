import { describe, it, expect } from 'vitest';
import {
  BuildUserManagementAgentContext,
  IsValidUserStatusFilter,
  CapUserNames,
  ResolveUserByIDOrName,
  ResolveRoleByIDOrName,
  USER_AGENT_CONTEXT_NAME_LIST_CAP,
  UserManagementAgentContextInput,
  UserNameCandidate,
  RoleNameCandidate,
} from '../lib/user-management/user-management-agent-context';

const baseInput = (): UserManagementAgentContextInput => ({
  TotalUserCount: 3,
  FilteredUserCount: 2,
  ActiveUserCount: 2,
  InactiveUserCount: 1,
  StatusFilter: 'active',
  RoleFilterId: null,
  RoleFilterName: null,
  SearchText: '',
  SelectedUserId: null,
  SelectedUserName: null,
  VisibleUserNames: ['Alice', 'Bob'],
  VisibleUserEmails: ['alice@x.com', 'bob@x.com'],
  AvailableRoleNames: ['Administrator', 'User'],
  VisibleColumns: ['Name', 'Email'],
});

const users: UserNameCandidate[] = [
  { ID: 'AAAA1111-0000-0000-0000-000000000001', Name: 'Alice Smith', Email: 'alice@x.com', FirstName: 'Alice', LastName: 'Smith' },
  { ID: 'BBBB2222-0000-0000-0000-000000000002', Name: 'Bob Jones', Email: 'bob@x.com', FirstName: 'Bob', LastName: 'Jones' },
];

const roles: RoleNameCandidate[] = [
  { ID: 'R1', Name: 'Administrator' },
  { ID: 'R2', Name: 'Developer' },
];

describe('isValidUserStatusFilter', () => {
  it('accepts the three valid filters', () => {
    expect(IsValidUserStatusFilter('all')).toBe(true);
    expect(IsValidUserStatusFilter('active')).toBe(true);
    expect(IsValidUserStatusFilter('inactive')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(IsValidUserStatusFilter('Active')).toBe(false);
    expect(IsValidUserStatusFilter('')).toBe(false);
    expect(IsValidUserStatusFilter(42)).toBe(false);
    expect(IsValidUserStatusFilter(null)).toBe(false);
  });
});

describe('capUserNames', () => {
  it('caps at the configured limit', () => {
    const many = Array.from({ length: USER_AGENT_CONTEXT_NAME_LIST_CAP + 10 }, (_, i) => `u${i}`);
    expect(CapUserNames(many)).toHaveLength(USER_AGENT_CONTEXT_NAME_LIST_CAP);
  });
  it('leaves short lists intact', () => {
    expect(CapUserNames(['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('resolveUserByIDOrName', () => {
  it('matches by exact ID (case-insensitive)', () => {
    const r = ResolveUserByIDOrName('aaaa1111-0000-0000-0000-000000000001', users);
    expect(r.ok && r.match.Name).toBe('Alice Smith');
  });
  it('matches by exact display name', () => {
    const r = ResolveUserByIDOrName('Bob Jones', users);
    expect(r.ok && r.match.ID).toBe('BBBB2222-0000-0000-0000-000000000002');
  });
  it('matches by exact email', () => {
    const r = ResolveUserByIDOrName('alice@x.com', users);
    expect(r.ok && r.match.Name).toBe('Alice Smith');
  });
  it('matches by "First Last" combination', () => {
    const r = ResolveUserByIDOrName('alice smith', users);
    expect(r.ok && r.match.ID).toBe(users[0].ID);
  });
  it('falls back to a contains match', () => {
    const r = ResolveUserByIDOrName('bob', users);
    expect(r.ok && r.match.Name).toBe('Bob Jones');
  });
  it('returns a tolerant error with a sample on a miss', () => {
    const r = ResolveUserByIDOrName('nobody', users);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Alice Smith');
    }
  });
  it('errors on empty input', () => {
    expect(ResolveUserByIDOrName('   ', users).ok).toBe(false);
  });
});

describe('resolveRoleByIDOrName', () => {
  it('matches by id then name then contains', () => {
    expect((ResolveRoleByIDOrName('R2', roles) as { ok: true; match: RoleNameCandidate }).match.Name).toBe('Developer');
    expect((ResolveRoleByIDOrName('administrator', roles) as { ok: true; match: RoleNameCandidate }).match.ID).toBe('R1');
    expect((ResolveRoleByIDOrName('dev', roles) as { ok: true; match: RoleNameCandidate }).match.Name).toBe('Developer');
  });
  it('errors tolerantly on a miss', () => {
    const r = ResolveRoleByIDOrName('zzz', roles);
    expect(r.ok).toBe(false);
  });
});

describe('buildUserManagementAgentContext', () => {
  it('emits the core counts and filter state', () => {
    const ctx = BuildUserManagementAgentContext(baseInput());
    expect(ctx['TotalUserCount']).toBe(3);
    expect(ctx['FilteredUserCount']).toBe(2);
    expect(ctx['StatusFilter']).toBe('active');
    expect(ctx['VisibleUserNames']).toEqual(['Alice', 'Bob']);
    expect(ctx['AvailableRoleNames']).toEqual(['Administrator', 'User']);
  });
  it('omits empty name lists (no fabricated empties)', () => {
    const input = baseInput();
    input.VisibleUserNames = [];
    input.VisibleUserEmails = [];
    const ctx = BuildUserManagementAgentContext(input);
    expect(ctx['VisibleUserNames']).toBeUndefined();
    expect(ctx['VisibleUserEmails']).toBeUndefined();
  });
  it('caps long lists and emits a companion count', () => {
    const input = baseInput();
    input.VisibleUserNames = Array.from({ length: USER_AGENT_CONTEXT_NAME_LIST_CAP + 5 }, (_, i) => `User ${i}`);
    const ctx = BuildUserManagementAgentContext(input);
    expect((ctx['VisibleUserNames'] as string[]).length).toBe(USER_AGENT_CONTEXT_NAME_LIST_CAP);
    expect(ctx['VisibleUserNameCount']).toBe(USER_AGENT_CONTEXT_NAME_LIST_CAP + 5);
  });
  it('carries the selected user name (display only) and role filter name', () => {
    const input = baseInput();
    input.SelectedUserId = users[0].ID;
    input.SelectedUserName = 'Alice Smith';
    input.RoleFilterId = 'R1';
    input.RoleFilterName = 'Administrator';
    const ctx = BuildUserManagementAgentContext(input);
    expect(ctx['SelectedUserName']).toBe('Alice Smith');
    expect(ctx['RoleFilterName']).toBe('Administrator');
  });
  it('never leaks a password/token field', () => {
    const ctx = BuildUserManagementAgentContext(baseInput());
    const keys = Object.keys(ctx).join(' ').toLowerCase();
    expect(keys).not.toContain('password');
    expect(keys).not.toContain('token');
    expect(keys).not.toContain('secret');
  });
});
