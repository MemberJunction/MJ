/**
 * Public surface for the baseline migration builder + comparator.
 * Imported by the `mj baseline ...` oclif commands.
 */

export * from './types';
export * from './util';
export { introspectMssql } from './introspector-mssql';
export { introspectPostgres } from './introspector-postgres';
export { dumpTables } from './data-dumper';
export type { DumpProgress, DumpOptions } from './data-dumper';
export { emitBaselineTsql } from './emitter';
export type { EmitInput } from './emitter';
export { compareSnapshots } from './comparator';
export type { CompareInput } from './comparator';
export { renderJson, renderMarkdown } from './report';
export { openConnection } from './connection';
export type { DbConnectionParams, DbConnectionOverrides, QueryRunner } from './connection';
