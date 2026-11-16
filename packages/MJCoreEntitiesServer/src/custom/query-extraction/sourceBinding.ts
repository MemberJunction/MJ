import type { EntityFieldInfo, EntityInfo } from "@memberjunction/core";
import type { DescribedColumnSource } from "@memberjunction/generic-database-provider";
import type { TableReference } from "@memberjunction/sql-parser";
import type { QueryEntityFact } from "./extractionTypes";

/** A database object that backs an entity: its base view, base table, or one of its alternate base views. */
interface EntityObject {
    readonly Entity: EntityInfo;
    /** The alternate base view the object is; `null` for the base view or base table. */
    readonly AlternateBaseViewID: string | null;
}

/** Where an output column comes from, in the terms a Query Field row stores. */
export interface BoundColumnSource {
    readonly SourceEntityID: string | null;
    readonly SourceEntityFieldID: string | null;
    readonly SourceFieldName: string | null;
    readonly SourceObjectName: string | null;
    /** The entity field's description, when the column maps to one. */
    readonly SourceDescription: string | null;
}

/** A column with no source: computed, aggregated, a literal or a set-operation output. */
const NO_SOURCE: BoundColumnSource = Object.freeze({
    SourceEntityID: null, SourceEntityFieldID: null, SourceFieldName: null, SourceObjectName: null, SourceDescription: null,
});

/**
 * Maps database objects (schema + view or table) to the entities they back, through MJ
 * metadata: an entity's base view, its base table, and its alternate base views. Names compare
 * without case. The first entity registered for an object wins, base view before base table
 * before alternate base view, matching how the run-time field security reads sources.
 */
export class EntityObjectIndex {
    private readonly qualified = new Map<string, EntityObject>();
    private readonly byName = new Map<string, EntityObject[]>();

    constructor(catalog: readonly EntityInfo[]) {
        for (const entity of catalog) {
            this.add(entity.SchemaName, entity.BaseView, { Entity: entity, AlternateBaseViewID: null });
            this.add(entity.SchemaName, entity.BaseTable, { Entity: entity, AlternateBaseViewID: null });
            for (const view of entity.AlternateBaseViews ?? []) {
                this.add(view.SchemaName ?? entity.SchemaName, view.ViewName, { Entity: entity, AlternateBaseViewID: view.ID });
            }
        }
    }

    /** The entity object at `schema.name`, or `undefined`. */
    Find(schema: string, name: string): EntityObject | undefined {
        return this.qualified.get(objectKey(schema, name));
    }

    /**
     * The entity object an unqualified `name` reads: the one in `defaultSchema`, else the only one
     * with that name in any schema; `undefined` when there is none or more than one.
     */
    FindUnqualified(name: string, defaultSchema: string): EntityObject | undefined {
        const inDefault = this.Find(defaultSchema, name);
        if (inDefault) return inDefault;
        const candidates = this.byName.get(name.toLowerCase()) ?? [];
        const entities = new Set(candidates.map(c => c.Entity.ID));
        return entities.size === 1 ? candidates[0] : undefined;
    }

    private add(schema: string | null | undefined, name: string | null | undefined, target: EntityObject): void {
        if (!schema || !name) return;
        const key = objectKey(schema, name);
        if (this.qualified.has(key)) return;
        this.qualified.set(key, target);
        const list = this.byName.get(name.toLowerCase()) ?? [];
        list.push(target);
        this.byName.set(name.toLowerCase(), list);
    }
}

/**
 * Maps the source the database server reported for an output column to MJ metadata.
 *
 * - The object backs an entity and the column names one of its fields: the entity, the field
 *   and the field's name.
 * - Otherwise: the object as `schema.object` and the column's name, as reported.
 * - No source: nothing.
 */
export function BindColumnSource(source: DescribedColumnSource | null, index: EntityObjectIndex): BoundColumnSource {
    if (!source) return NO_SOURCE;
    const field = fieldOf(index.Find(source.Schema, source.Object), source.Column);
    if (field) {
        return { SourceEntityID: field.EntityID, SourceEntityFieldID: field.ID, SourceFieldName: field.Name, SourceObjectName: null, SourceDescription: field.Description || null };
    }
    return { SourceEntityID: null, SourceEntityFieldID: null, SourceFieldName: source.Column, SourceObjectName: `${source.Schema}.${source.Object}`, SourceDescription: null };
}

/**
 * The entities a query reads, from its table references: every table and view read anywhere in
 * the query, CTE names and table-valued functions excluded. One row per entity (and alternate base
 * view), in order of first reference.
 *
 * @param defaultSchema - The schema an unqualified name is looked up in first.
 */
export function BindTableReferences(references: readonly TableReference[], index: EntityObjectIndex, defaultSchema: string): QueryEntityFact[] {
    const facts: QueryEntityFact[] = [];
    const seen = new Set<string>();
    for (const reference of references) {
        if (reference.Kind !== 'Table') continue;
        const name = reference.Name.Parts[reference.Name.Parts.length - 1]?.Value;
        if (!name) continue;
        const target = reference.Schema ? index.Find(reference.Schema, name) : index.FindUnqualified(name, defaultSchema);
        if (!target) continue;
        const key = `${target.Entity.ID.toLowerCase()}|${(target.AlternateBaseViewID ?? '').toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        facts.push({ EntityID: target.Entity.ID, AlternateBaseViewID: target.AlternateBaseViewID });
    }
    return facts;
}

function fieldOf(target: EntityObject | undefined, column: string): EntityFieldInfo | undefined {
    if (!target) return undefined;
    const wanted = column.toLowerCase();
    return target.Entity.Fields.find(f => f.Name.toLowerCase() === wanted);
}

function objectKey(schema: string, name: string): string {
    return `${schema.toLowerCase()}.${name.toLowerCase()}`;
}
