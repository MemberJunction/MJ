/**
 * The relationships a table has, read from `dependsOn`, grouped into whole keys.
 *
 * Declared constraints carry a `constraintName`, so the columns of a composite foreign key are
 * grouped into one relationship. Discovered and model-proposed keys are written without one and are
 * always single-column.
 */

import type { SchemaDefinition, TableDefinition } from '../types/state.js';
import type { RelationshipProbeOrigin } from '../types/data-quality.js';

export interface TableRef {
  Schema: string;
  Table: string;
  Columns: string[];
}

export interface Relationship {
  Child: TableRef;
  Parent: TableRef;
  ConstraintName?: string;
  /** Declared in the database, as opposed to discovered or proposed. */
  Declared: boolean;
  /** Declared only. Undefined when the catalog did not say (older state files, MySQL). */
  IsTrusted?: boolean;
  IsDisabled?: boolean;
}

/** Older states sometimes stored the target table as `schema.table`. */
function bareTableName(name: string): string {
  return name.includes('.') ? (name.split('.').pop() ?? name) : name;
}

/** Every relationship a table references, in `dependsOn` order. */
export function TableRelationships(schemaName: string, table: TableDefinition): Relationship[] {
  const declared = new Map<string, Relationship>();
  const out: Relationship[] = [];
  for (const dep of table.dependsOn) {
    const parentTable = bareTableName(dep.table);
    const parentColumn = dep.referencedColumn || dep.column;
    if (dep.constraintName) {
      const key = `${dep.schema}.${parentTable}::${dep.constraintName}`.toLowerCase();
      const existing = declared.get(key);
      if (existing) {
        existing.Child.Columns.push(dep.column);
        existing.Parent.Columns.push(parentColumn);
        continue;
      }
      const relationship: Relationship = {
        Child: { Schema: schemaName, Table: table.name, Columns: [dep.column] },
        Parent: { Schema: dep.schema, Table: parentTable, Columns: [parentColumn] },
        ConstraintName: dep.constraintName,
        Declared: true,
        IsTrusted: dep.isTrusted,
        IsDisabled: dep.isDisabled,
      };
      declared.set(key, relationship);
      out.push(relationship);
    } else {
      out.push({
        Child: { Schema: schemaName, Table: table.name, Columns: [dep.column] },
        Parent: { Schema: dep.schema, Table: parentTable, Columns: [parentColumn] },
        Declared: false,
      });
    }
  }
  return out;
}

/** A stable key for a relationship, used to remember which ones were already probed. */
export function RelationshipKey(r: Pick<Relationship, 'Child' | 'Parent'>): string {
  const side = (t: TableRef) => `${t.Schema}.${t.Table}(${t.Columns.join(',')})`;
  return `${side(r.Child)}->${side(r.Parent)}`.toLowerCase();
}

/**
 * Why a relationship needs an orphan probe, or undefined when it does not. A trusted declared
 * constraint cannot have orphans, so it is never probed; a declared one whose trust is unknown is
 * not probed either (nothing says it is broken).
 */
export function OrphanProbeOrigin(r: Relationship): RelationshipProbeOrigin | undefined {
  if (!r.Declared) return 'Discovered';
  if (r.IsTrusted === false || r.IsDisabled === true) return 'DeclaredUntrusted';
  return undefined;
}

/** Find a table in the schemas, case-insensitively. */
export function FindTable(schemas: SchemaDefinition[], schemaName: string, tableName: string): TableDefinition | undefined {
  const s = schemas.find((x) => x.name === schemaName) ?? schemas.find((x) => x.name.toLowerCase() === schemaName.toLowerCase());
  if (!s) return undefined;
  return s.tables.find((t) => t.name === tableName) ?? s.tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
}
