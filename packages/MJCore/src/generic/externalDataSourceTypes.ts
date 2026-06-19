/**
 * Schema-introspection contracts for the External Data Sources subsystem.
 *
 * These describe the shape of a remote object's schema as discovered by a driver's
 * `IntrospectSchema` capability. They live in `@memberjunction/core` (not the server-only
 * engine) so that the abstract `ExternalDataSourceReadRouter.IntrospectExternalSchema` seam
 * can return them, and so build-time consumers (CodeGen) can reference them without a hard
 * dependency on the engine or driver SDKs — the same dependency-inversion rationale the
 * router itself follows.
 */

/** Kind of remote object a schema descriptor describes. */
export type ExternalObjectType = 'table' | 'view' | 'collection';

/** One column/field discovered during schema introspection. */
export interface ExternalSchemaColumn {
  name: string;
  /** Native remote data type, verbatim (e.g. 'VARCHAR2', 'NUMBER', 'timestamptz', 'ObjectId'). */
  nativeType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  /** Human description if the remote catalog supplies one. */
  description?: string;
}

/** One table/view/collection discovered during schema introspection. */
export interface ExternalSchemaObject {
  name: string;
  objectType: ExternalObjectType;
  /** Schema/namespace the object lives in on the remote side, when applicable. */
  schema?: string;
  columns: ExternalSchemaColumn[];
}

/** The result of introspecting a remote source's schema. */
export interface ExternalSchemaDescriptor {
  /** Source-level identifier the schema was read from (database/catalog/namespace). */
  database?: string;
  objects: ExternalSchemaObject[];
}
