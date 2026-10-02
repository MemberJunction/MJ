/**
 * @fileoverview The change signals that the Dashboards app pages (Overview, Browse, Shared with me,
 * Categories) and Home use to re-read the DashboardEngine cache and re-render.
 *
 * DashboardEngine updates its arrays in place and emits DataChange$ for saves and deletes made in
 * this browser, for changes other sessions make (remote invalidation), and for full reloads. Explorer
 * keeps these pages alive as cached tabs, so each page watches a signal instead of keeping a copy
 * that goes stale. One user action can emit several events (a transaction, a reload of every entity
 * set), so each signal emits at most once per task.
 */
import type { EngineDataChangeEvent } from '@memberjunction/core';
import { DashboardEngine } from '@memberjunction/core-entities';
import { Observable } from 'rxjs';
import { auditTime, filter, map } from 'rxjs/operators';

/** The DashboardEngine entities whose changes can alter a dashboard list, the category tree or a permission. */
export const DASHBOARD_LIBRARY_ENTITY_NAMES: readonly string[] = [
  'MJ: Dashboards',
  'MJ: Dashboard Categories',
  'MJ: Dashboard Permissions',
  'MJ: Dashboard Category Permissions',
  'MJ: Dashboard Category Links',
];

/** The DashboardEngine entity whose Global-scope rows are the Home tabs. */
export const DASHBOARD_PREFERENCES_ENTITY_NAME = 'MJ: Dashboard User Preferences';

/** The part of DashboardEngine the change signals read. DashboardEngine satisfies it. */
export interface DashboardLibrarySource {
  readonly DataChange$: Observable<EngineDataChangeEvent>;
}

/** True when an engine change event is for one of the library entities. */
export function IsDashboardLibraryChange(event: EngineDataChangeEvent): boolean {
  return isChangeFor(event, DASHBOARD_LIBRARY_ENTITY_NAMES);
}

/** True when an engine change event is for an entity the Home tabs read: a library entity or the dashboard preferences. */
export function IsHomeTabsChange(event: EngineDataChangeEvent): boolean {
  return IsDashboardLibraryChange(event) || isChangeFor(event, [DASHBOARD_PREFERENCES_ENTITY_NAME]);
}

/** Emits after `source` changes a library entity set; a burst of changes emits once, after the current task. */
export function ObserveDashboardLibraryChanges(source: DashboardLibrarySource = DashboardEngine.Instance): Observable<void> {
  return observeChanges(source, IsDashboardLibraryChange);
}

/** Emits after `source` changes an entity set the Home tabs read; a burst of changes emits once, after the current task. */
export function ObserveHomeTabsChanges(source: DashboardLibrarySource = DashboardEngine.Instance): Observable<void> {
  return observeChanges(source, IsHomeTabsChange);
}

function isChangeFor(event: EngineDataChangeEvent, entityNames: readonly string[]): boolean {
  const entityName = (event.config.EntityName ?? '').trim().toLowerCase();
  return entityNames.some(name => name.toLowerCase() === entityName);
}

function observeChanges(source: DashboardLibrarySource, counts: (event: EngineDataChangeEvent) => boolean): Observable<void> {
  return source.DataChange$.pipe(
    filter(counts),
    auditTime(0),
    map(() => undefined)
  );
}
