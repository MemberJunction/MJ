import { describe, it, expect } from 'vitest';
import {
  buildRoleManagementAgentContext,
  isValidRoleTypeFilter,
  capRoleNames,
  resolveRoleByIDOrName,
  ROLE_AGENT_CONTEXT_NAME_LIST_CAP,
  RoleManagementAgentContextInput,
  RoleNameCandidate,
  RolePermissionSummary,
} from '../lib/role-management/role-management-agent-context';

const baseInput = (): RoleManagementAgentContextInput => ({
  TotalRoleCount: 4,
  FilteredRoleCount: 2,
  SystemRoleCount: 2,
  CustomRoleCount: 2,
  TypeFilter: 'all',
  SearchText: '',
  SelectedRoleId: null,
  SelectedRoleName: null,
  VisibleRoleNames: ['Administrator', 'Developer'],
  SelectedRolePermissions: null,
});

const roles: RoleNameCandidate[] = [
  { ID: 'R1', Name: 'Administrator' },
  { ID: 'R2', Name: 'Developer' },
  { ID: 'R3', Name: 'Read Only' },
];

const summary: RolePermissionSummary = {
  EntityCount: 10,
  ReadCount: 10,
  CreateCount: 3,
  UpdateCount: 3,
  DeleteCount: 1,
};

describe('isValidRoleTypeFilter', () => {
  it('accepts the three valid filters', () => {
    expect(isValidRoleTypeFilter('all')).toBe(true);
    expect(isValidRoleTypeFilter('system')).toBe(true);
    expect(isValidRoleTypeFilter('custom')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isValidRoleTypeFilter('System')).toBe(false);
    expect(isValidRoleTypeFilter('')).toBe(false);
    expect(isValidRoleTypeFilter(7)).toBe(false);
  });
});

describe('capRoleNames', () => {
  it('caps at the configured limit', () => {
    const many = Array.from({ length: ROLE_AGENT_CONTEXT_NAME_LIST_CAP + 3 }, (_, i) => `r${i}`);
    expect(capRoleNames(many)).toHaveLength(ROLE_AGENT_CONTEXT_NAME_LIST_CAP);
  });
});

describe('resolveRoleByIDOrName', () => {
  it('matches by exact ID (case-insensitive)', () => {
    const r = resolveRoleByIDOrName('r1', roles);
    expect(r.ok && r.match.Name).toBe('Administrator');
  });
  it('matches by exact name', () => {
    const r = resolveRoleByIDOrName('Developer', roles);
    expect(r.ok && r.match.ID).toBe('R2');
  });
  it('falls back to contains', () => {
    const r = resolveRoleByIDOrName('read', roles);
    expect(r.ok && r.match.Name).toBe('Read Only');
  });
  it('returns a tolerant error listing available roles on a miss', () => {
    const r = resolveRoleByIDOrName('nope', roles);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Administrator');
    }
  });
  it('errors on empty input', () => {
    expect(resolveRoleByIDOrName('  ', roles).ok).toBe(false);
  });
});

describe('buildRoleManagementAgentContext', () => {
  it('emits the core counts and filter state', () => {
    const ctx = buildRoleManagementAgentContext(baseInput());
    expect(ctx['TotalRoleCount']).toBe(4);
    expect(ctx['SystemRoleCount']).toBe(2);
    expect(ctx['CustomRoleCount']).toBe(2);
    expect(ctx['TypeFilter']).toBe('all');
    expect(ctx['VisibleRoleNames']).toEqual(['Administrator', 'Developer']);
  });
  it('omits the permission summary when no role is selected', () => {
    const ctx = buildRoleManagementAgentContext(baseInput());
    expect(ctx['SelectedRolePermissions']).toBeUndefined();
  });
  it('includes the read-only permission summary when a role is selected', () => {
    const input = baseInput();
    input.SelectedRoleId = 'R1';
    input.SelectedRoleName = 'Administrator';
    input.SelectedRolePermissions = summary;
    const ctx = buildRoleManagementAgentContext(input);
    expect(ctx['SelectedRoleName']).toBe('Administrator');
    expect(ctx['SelectedRolePermissions']).toEqual(summary);
  });
  it('caps a long role-name list and emits a companion count', () => {
    const input = baseInput();
    input.VisibleRoleNames = Array.from({ length: ROLE_AGENT_CONTEXT_NAME_LIST_CAP + 4 }, (_, i) => `Role ${i}`);
    const ctx = buildRoleManagementAgentContext(input);
    expect((ctx['VisibleRoleNames'] as string[]).length).toBe(ROLE_AGENT_CONTEXT_NAME_LIST_CAP);
    expect(ctx['VisibleRoleCount']).toBe(ROLE_AGENT_CONTEXT_NAME_LIST_CAP + 4);
  });
  it('the permission summary is counts-only (no grant control fields)', () => {
    const input = baseInput();
    input.SelectedRolePermissions = summary;
    input.SelectedRoleId = 'R1';
    const ctx = buildRoleManagementAgentContext(input);
    const perms = ctx['SelectedRolePermissions'] as Record<string, unknown>;
    expect(Object.keys(perms).sort()).toEqual(['CreateCount', 'DeleteCount', 'EntityCount', 'ReadCount', 'UpdateCount']);
  });
});
