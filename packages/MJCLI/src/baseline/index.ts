/**
 * Public surface for the baseline migration builder + comparator.
 * Imported by the `mj baseline ...` oclif commands.
 */

export * from './types';
export * from './util';
export { IntrospectMssql, introspectMssql } from './introspector-mssql';
export { IntrospectPostgres, introspectPostgres } from './introspector-postgres';
export { DumpTables, dumpTables } from './data-dumper';
export type { DumpProgress, DumpOptions } from './data-dumper';
export { EmitBaselineTsql, emitBaselineTsql } from './emitter';
export type { EmitInput } from './emitter';
export { CompareSnapshots, compareSnapshots } from './comparator';
export type { CompareInput } from './comparator';
export { RenderJson, renderJson, RenderMarkdown, renderMarkdown } from './report';
export { OpenConnection, openConnection } from './connection';
export type { DbConnectionParams, DbConnectionOverrides, QueryRunner } from './connection';
