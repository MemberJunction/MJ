/**
 * TEST SUPPORT ONLY: an in-memory provider double for the versioned-row widgets' DOM tests. Nothing outside
 * `*.test.ts` files imports this module; it compiles with the package because the build config only excludes
 * `*.test.ts` files. It is built without casts: `Object.create(null)` + `Object.assign`, as the package's other
 * provider doubles are.
 */
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { VersionIdentity } from './lineage-reads';

/** A row object as `GetEntityObject` hands it out: the columns plus the entity calls the widgets make. */
export type RowDouble<T> = T & {
  NewRecord(): boolean;
  Save(): Promise<boolean>;
  LatestResult: { CompleteMessage: string } | null;
};

/** The double's state: the stored version rows, the new row the next `GetEntityObject` returns, and every view read. */
export interface VersionStoreDouble<T extends VersionIdentity> {
  readonly Provider: IMetadataProvider;
  readonly Rows: T[];
  readonly Reads: RunViewParams[];
  NextRow: RowDouble<T> | null;
}

/** The user the double's provider reports as current. */
export const DOUBLE_USER_ID = '5E3B0C2A-6E2F-4C55-9E1A-2B1D7F0A9C11';

/** A provider whose views read `rows` (by `ID='…'` or `LineageRootID='…'`, oldest version first) and return no other rows. */
export function CreateVersionStoreDouble<T extends VersionIdentity>(rows: T[]): VersionStoreDouble<T> {
  const provider: IMetadataProvider = Object.create(null);
  const store: VersionStoreDouble<T> = { Provider: provider, Rows: rows, Reads: [], NextRow: null };
  const runView = async (params: RunViewParams): Promise<RunViewResult<T>> => {
    store.Reads.push(params);
    return ViewResult(RowsMatching(store.Rows, params));
  };
  Object.assign(provider, {
    CurrentUser: { ID: DOUBLE_USER_ID },
    RunView: runView,
    RunViews: async (all: RunViewParams[]): Promise<RunViewResult<T>[]> => Promise.all(all.map(runView)),
    GetEntityObject: async (): Promise<RowDouble<T> | null> => store.NextRow,
  });
  return store;
}

/**
 * A new row double. `Save` fails with `failWith` when it is given; otherwise the row takes `serverId` as its ID (and,
 * as version 1, as its lineage root, as the server does on create) and is added to the store.
 */
export function CreateRowDouble<T extends VersionIdentity>(store: VersionStoreDouble<T>, empty: T, serverId: string, failWith: string | null = null): RowDouble<T> {
  const row: RowDouble<T> = Object.assign(empty, {
    NewRecord: (): boolean => true,
    LatestResult: null,
    Save: async (): Promise<boolean> => {
      if (failWith !== null) {
        row.LatestResult = { CompleteMessage: failWith };
        return false;
      }
      row.ID = serverId;
      if (row.Version === 1) row.LineageRootID = serverId;
      store.Rows.push({ ...row, __mj_CreatedAt: '2026-10-31T00:00:00Z' });
      return true;
    },
  });
  return row;
}

/** The stored rows a view's filter selects, in version order. */
export function RowsMatching<T extends VersionIdentity>(rows: readonly T[], params: RunViewParams): T[] {
  // the widgets pass every filter as a string; a dialect-keyed filter selects nothing here
  const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
  const byId = /^ID='([^']+)'$/.exec(filter);
  const byRoot = /^LineageRootID='([^']+)'$/.exec(filter);
  const matched = byId !== null ? rows.filter((r) => UUIDsEqual(r.ID, byId[1])) : byRoot !== null ? rows.filter((r) => UUIDsEqual(r.LineageRootID, byRoot[1])) : [];
  const ordered = [...matched].sort((a, b) => (params.OrderBy === 'Version DESC' ? b.Version - a.Version : a.Version - b.Version));
  return params.MaxRows ? ordered.slice(0, params.MaxRows) : ordered;
}

/** A successful view result over `rows`. */
export function ViewResult<T>(rows: T[]): RunViewResult<T> {
  return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
}
