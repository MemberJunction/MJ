import type { QueryRefreshFilter, QueryRefreshRunReport } from '@memberjunction/core-entities-server';

/**
 * The refresh filter the `mj query refresh` selector flags describe (oclif names them `id`, `name`,
 * `category`, `entity`, `all`); empty when none is given.
 */
export function QueryRefreshFilterFromFlags(flags: { id?: string[]; name?: string[]; category?: string; entity?: string[]; all?: boolean }): QueryRefreshFilter {
  const filter: { -readonly [K in keyof QueryRefreshFilter]: QueryRefreshFilter[K] } = {};
  if (flags.id?.length) filter.QueryIDs = flags.id;
  if (flags.name?.length) filter.QueryNames = flags.name;
  if (flags.category?.trim()) filter.CategoryPath = flags.category;
  if (flags.entity?.length) filter.EntityNames = flags.entity;
  if (flags.all) filter.All = true;
  return filter;
}

/** Whether the run should exit non-zero: a query failed, or one the caller named could not be refreshed. */
export function QueryRefreshRunFailed(run: QueryRefreshRunReport): boolean {
  return run.Reports.some(r => r.Outcome === 'Failed' || r.Outcome === 'Unavailable');
}

/**
 * How `mj query refresh` ends the process. The database provider can leave handles open after its
 * pool is released (a PostgreSQL listener, engine timers), which would keep the CLI alive after the
 * report is printed, so the command exits explicitly, like the other database commands.
 */
export const QueryRefreshExit = {
  Exit(code: number): never {
    process.exit(code);
  },
};
