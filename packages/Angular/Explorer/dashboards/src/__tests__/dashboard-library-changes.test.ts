/**
 * Tests for the cache change signal in `shared/dashboard-library-changes.ts` (the Dashboards app's
 * library signal): which DashboardEngine changes count, the coalescing of a burst into one emission,
 * and the default source.
 */
import { describe, it, expect, vi } from 'vitest';
import { Subject } from 'rxjs';
import type { EngineDataChangeEvent } from '@memberjunction/core';
import {
  IsDashboardLibraryChange,
  ObserveDashboardLibraryChanges,
} from '../shared/dashboard-library-changes';

const hoisted = vi.hoisted(() => ({ engine: null as unknown }));

vi.mock('@memberjunction/core-entities', () => ({
  DashboardEngine: {
    get Instance() {
      return hoisted.engine;
    },
  },
}));

const change = (EntityName: string): EngineDataChangeEvent =>
  ({ config: { EntityName, PropertyName: '_x' }, changeType: 'update', data: [] }) as unknown as EngineDataChangeEvent;

/** Lets a zero-delay timer run. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('IsDashboardLibraryChange', () => {
  it('is true for the entities that change a dashboard list, the category tree or a permission', () => {
    for (const name of ['MJ: Dashboards', 'MJ: Dashboard Categories', 'MJ: Dashboard Permissions', 'MJ: Dashboard Category Permissions', 'MJ: Dashboard Category Links']) {
      expect(IsDashboardLibraryChange(change(name))).toBe(true);
    }
    expect(IsDashboardLibraryChange(change('  mj: dashboards '))).toBe(true);
  });

  it('is false for the other DashboardEngine entities', () => {
    for (const name of ['MJ: Dashboard User States', 'MJ: Dashboard Part Types', 'MJ: Dashboard User Preferences', '']) {
      expect(IsDashboardLibraryChange(change(name))).toBe(false);
    }
  });
});

describe('ObserveDashboardLibraryChanges', () => {
  it('emits once for a burst of library changes, after the current task', async () => {
    const source = new Subject<EngineDataChangeEvent>();
    let emissions = 0;
    const subscription = ObserveDashboardLibraryChanges({ DataChange$: source }).subscribe(() => emissions++);

    source.next(change('MJ: Dashboards'));
    source.next(change('MJ: Dashboard Categories'));
    source.next(change('MJ: Dashboard Category Links'));
    expect(emissions).toBe(0);

    await settle();
    expect(emissions).toBe(1);

    source.next(change('MJ: Dashboards'));
    await settle();
    expect(emissions).toBe(2);
    subscription.unsubscribe();
  });

  it('ignores changes to entities that do not affect the library', async () => {
    const source = new Subject<EngineDataChangeEvent>();
    let emissions = 0;
    const subscription = ObserveDashboardLibraryChanges({ DataChange$: source }).subscribe(() => emissions++);

    source.next(change('MJ: Dashboard User States'));
    await settle();

    expect(emissions).toBe(0);
    subscription.unsubscribe();
  });

  it('reads DashboardEngine.Instance by default', async () => {
    const source = new Subject<EngineDataChangeEvent>();
    hoisted.engine = { DataChange$: source.asObservable() };
    let emissions = 0;
    const subscription = ObserveDashboardLibraryChanges().subscribe(() => emissions++);

    source.next(change('MJ: Dashboards'));
    await settle();

    expect(emissions).toBe(1);
    subscription.unsubscribe();
  });
});
