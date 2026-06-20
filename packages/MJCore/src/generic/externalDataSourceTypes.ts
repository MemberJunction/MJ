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

/** One column pairing in a foreign-key relationship (referencing column → referenced column). */
export interface ExternalSchemaRelationshipColumn {
  /** Column on this (the referencing) object that holds the foreign key. */
  column: string;
  /** Column on the referenced object that `column` points to. */
  referencedColumn: string;
}

/**
 * A foreign-key relationship discovered during schema introspection: this object's
 * column(s) reference another object's column(s). Modeled on the referencing side (the
 * object that holds the foreign key), mirroring how relational catalogs report constraints.
 */
export interface ExternalSchemaRelationship {
  /** Constraint name if the remote catalog supplies one. */
  name?: string;
  /** Name of the object this relationship points to. */
  referencedObject: string;
  /** Schema/namespace of the referenced object, when applicable. */
  referencedSchema?: string;
  /** Column pairings that make up the foreign key (an array to support composite keys). */
  columns: ExternalSchemaRelationshipColumn[];
}

/** One table/view/collection discovered during schema introspection. */
export interface ExternalSchemaObject {
  name: string;
  objectType: ExternalObjectType;
  /** Schema/namespace the object lives in on the remote side, when applicable. */
  schema?: string;
  columns: ExternalSchemaColumn[];
  /**
   * Foreign-key relationships originating from this object (the referencing side).
   * Optional and additive: drivers populate this incrementally as per-provider relationship
   * introspection lands, and DBAutoDoc may further enrich it. An absent or empty array means
   * "relationships not yet discovered", NOT "this object has no relationships".
   */
  relationships?: ExternalSchemaRelationship[];
}

/** The result of introspecting a remote source's schema. */
export interface ExternalSchemaDescriptor {
  /** Source-level identifier the schema was read from (database/catalog/namespace). */
  database?: string;
  objects: ExternalSchemaObject[];
}
