import { describe, it, expect, vi } from 'vitest';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { BuildOpenDashboardTool, ResolveByIdOrName } from '../DashboardBrowser/dashboards-agent-tools';

const REVENUE = { ID: 'D0000000-0000-4000-8000-00000000000A', Name: 'Revenue' } as unknown as MJDashboardEntity;
const CHURN = { ID: 'D0000000-0000-4000-8000-00000000000B', Name: 'Churn' } as unknown as MJDashboardEntity;

describe('ResolveByIdOrName', () => {
  it('finds an item by id in any letter case', () => {
    expect(ResolveByIdOrName([REVENUE, CHURN], ' d0000000-0000-4000-8000-00000000000b ', 'dashboard')).toEqual({ ok: true, value: CHURN });
  });

  it('finds an item by exact name, ignoring case', () => {
    expect(ResolveByIdOrName([REVENUE, CHURN], 'revenue', 'dashboard')).toEqual({ ok: true, value: REVENUE });
  });

  it('asks for an id or name when the value is missing, blank or not a string', () => {
    const required = { ok: false, result: { Success: false, ErrorMessage: 'A category ID or name is required.' } };
    expect(ResolveByIdOrName([REVENUE], undefined, 'category')).toEqual(required);
    expect(ResolveByIdOrName([REVENUE], '   ', 'category')).toEqual(required);
    expect(ResolveByIdOrName([REVENUE], 42, 'category')).toEqual(required);
  });

  it('lists the available names when nothing matches', () => {
    expect(ResolveByIdOrName([REVENUE, CHURN], 'Rev', 'dashboard')).toEqual({
      ok: false,
      result: { Success: false, ErrorMessage: 'No dashboard named or identified by "Rev". Available: Revenue, Churn.' },
    });
    expect(ResolveByIdOrName([], 'x', 'dashboard')).toEqual({
      ok: false,
      result: { Success: false, ErrorMessage: 'No dashboard named or identified by "x". Available: (none).' },
    });
  });

  it('lists at most 25 available names', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ID: `id-${i}`, Name: `N${i}` }));
    const lookup = ResolveByIdOrName(many, 'missing', 'dashboard');
    expect(lookup.ok).toBe(false);
    const message = lookup.ok ? '' : lookup.result.ErrorMessage ?? '';
    expect(message).toContain('N24.');
    expect(message).not.toContain('N25');
  });
});

describe('BuildOpenDashboardTool', () => {
  it('opens the dashboard the agent names', async () => {
    const open = vi.fn();
    const tool = BuildOpenDashboardTool(() => [REVENUE, CHURN], open);

    expect(tool.Name).toBe('OpenDashboard');
    expect(await tool.Handler({ dashboard: 'Churn' })).toEqual({ Success: true });
    expect(open).toHaveBeenCalledWith(CHURN);
  });

  it('opens nothing and explains why when the dashboard is unknown', async () => {
    const open = vi.fn();
    const tool = BuildOpenDashboardTool(() => [REVENUE], open);

    expect(await tool.Handler({ dashboard: 'Churn' })).toEqual({
      Success: false,
      ErrorMessage: 'No dashboard named or identified by "Churn". Available: Revenue.',
    });
    expect(open).not.toHaveBeenCalled();
  });
});
