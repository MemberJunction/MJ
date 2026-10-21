/**
 * The per-entity MCP tools — Get, Create, Update, Delete and Run View — that the server registers
 * for every entity matched by `mcpServerSettings.entityTools`.
 *
 * Every tool runs as the authenticated session's user, so row- and field-level security apply to
 * that user, and every value a tool returns has been projected for that user.
 */
import {
    AssertClientInputWritableForUser,
    BaseEntity,
    CompositeKey,
    EntityFieldInfo,
    EntityInfo,
    FieldSecurityError,
    Metadata,
    ProjectEntityValueRowsForUser,
    ProjectEntityValuesForUser,
    RunView,
    UserInfo
} from "@memberjunction/core";
import { ClientClauseScreen } from '@memberjunction/generic-database-provider';
import { z } from "zod";
import type { AddToolFn } from '../Server.js';

/**
 * Creates a RunView tool for querying entity records.
 * Allows filtering, sorting, and field selection.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param entity - The entity to create the tool for
 */
export function AddEntityRunViewTool(addToolWithFilter: AddToolFn, entity: EntityInfo): void {
    const paramObject = z.object({
        extraFilter: z.string().optional(),
        orderBy: z.string().optional(),
        fields: z.array(z.string()).optional(),
    });

    addToolWithFilter({
        name: `Run_${entity.ClassName}_View`,
        description: `Returns data from the ${entity.Name} entity, optionally filtered by extraFilter and ordered by orderBy`,
        parameters: paramObject,
        scopeInfo: { scopePath: 'view:run', resource: entity.Name },
        async execute(props, sessionContext) {
            const sessionUser = sessionContext.user;
            const md = new Metadata(); // global-provider-ok: MCP server bootstrap
            const extraFilter = props.extraFilter ? props.extraFilter as string : undefined;
            const orderBy = props.orderBy ? props.orderBy as string : undefined;
            const refusal = clientClauseRefusal(md, extraFilter, orderBy, sessionUser);
            if (refusal) {
                return JSON.stringify({ Success: false, Results: [], ErrorMessage: refusal });
            }
            const rv = new RunView();
            // Plain rows, never entity objects: what goes on the wire is the row, projected below.
            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: entity.Name,
                ExtraFilter: extraFilter,
                OrderBy: orderBy,
                Fields: props.fields ? props.fields as string[] : undefined,
                ResultType: 'simple',
            }, sessionUser);
            const rows = ProjectEntityValueRowsForUser(md, entity, result.Results, sessionUser);
            return JSON.stringify({ ...result, Results: rows });
        }
    });
}

/**
 * Screens a caller's filter and sort the way the GraphQL and REST view routes do: every relation a
 * clause reads must be an entity base view the caller may read unscoped, and the text must parse
 * as a read-only fragment. Returns the refusal message, or null when both clauses pass.
 */
function clientClauseRefusal(md: Metadata, extraFilter: string | undefined, orderBy: string | undefined, user: UserInfo): string | null {
    try {
        ClientClauseScreen.ScreenViewClauses(
            { ExtraFilter: extraFilter, OrderBy: orderBy },
            md.Entities,
            ClientClauseScreen.DialectFor(Metadata.Provider), // global-provider-ok: MCP server bootstrap
            user,
        );
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

/**
 * Creates a tool for creating new records in an entity.
 * Parameters are generated from the entity's non-readonly fields.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param entity - The entity to create the tool for
 */
export function AddEntityCreateTool(addToolWithFilter: AddToolFn, entity: EntityInfo): void {
    const schemas = new EntityToolSchemaCache(
        (omitted) => z.object(getEntityParamObject(entity, true, false, false, omitted)),
        (user) => deniedFieldsUnion(entity, user, (u) => entity.GetDeniedCreateFields(u)),
    );

    addToolWithFilter({
        name: `Create_${entity.ClassName}_Record`,
        description: `Creates a new record in the ${entity.Name} entity`,
        parameters: schemas.Shared,
        parametersForUser: (user) => schemas.ForUser(user),
        scopeInfo: { scopePath: 'entity:create', resource: entity.Name },
        async execute(props, sessionContext) {
            const sessionUser = sessionContext.user;
            const md = new Metadata(); // global-provider-ok: MCP server bootstrap
            const refusal = clientInputRefusal(entity, props, sessionUser);
            if (refusal) {
                return JSON.stringify({success: false, record: undefined, errorMessage: refusal});
            }
            const record = await md.GetEntityObject(entity.Name, sessionUser);
            record.SetMany(props, true);
            const success = await record.Save();
            if (!success) {
                return JSON.stringify({success, record: undefined, errorMessage: record.LatestResult.CompleteMessage });
            }
            else {
                return JSON.stringify({success, record: await convertEntityObjectToJSON(record, sessionUser, md), errorMessage: undefined });
            }
        }
    });
}

/**
 * Creates a tool for updating existing records in an entity.
 * Requires primary key fields to identify the record, plus optional fields to update.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param entity - The entity to create the tool for
 */
export function AddEntityUpdateTool(addToolWithFilter: AddToolFn, entity: EntityInfo): void {
    const schemas = new EntityToolSchemaCache(
        (omitted) => z.object(getEntityParamObject(entity, true, true, true, omitted)),
        (user) => deniedFieldsUnion(entity, user, (u) => entity.GetDeniedUpdateFields(u)),
    );

    addToolWithFilter({
        name: `Update_${entity.ClassName}_Record`,
        description: `Updates the specified record in the ${entity.Name} entity`,
        parameters: schemas.Shared,
        parametersForUser: (user) => schemas.ForUser(user),
        scopeInfo: { scopePath: 'entity:update', resource: entity.Name },
        async execute(props, sessionContext) {
            const sessionUser = sessionContext.user;
            const md = new Metadata(); // global-provider-ok: MCP server bootstrap
            const record = await md.GetEntityObject(entity.Name, sessionUser);
            const loaded = await record.InnerLoad(new CompositeKey(
                // use the primary keys to load the record
                entity.PrimaryKeys.map((pk) => {
                    return {
                        FieldName: pk.Name,
                        Value: props[pk.Name]
                    };
                })
            ));
            if (loaded) {
                // remove the primary keys from the props so we don't try to update them
                const newProps = { ...props };
                entity.PrimaryKeys.forEach((pk) => {
                    delete newProps[pk.Name];
                });
                const refusal = clientInputRefusal(entity, newProps, sessionUser);
                if (refusal) {
                    return JSON.stringify({success: false, record: undefined, errorMessage: refusal});
                }
                record.SetMany(newProps, true);
                const success = await record.Save();
                return JSON.stringify({success, record: await convertEntityObjectToJSON(record, sessionUser, md), errorMessage: !success ? record.LatestResult.CompleteMessage : undefined });
            }
            else {
                return JSON.stringify({success: false, record: undefined, errorMessage: "Record not found"});
            }
        }
    });
}

/**
 * Creates a tool for deleting records from an entity.
 * Only requires the primary key field(s) to identify the record.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param entity - The entity to create the tool for
 */
export function AddEntityDeleteTool(addToolWithFilter: AddToolFn, entity: EntityInfo): void {
    const pkeyParams = getEntityPrimaryKeyParamsObject(entity);

    addToolWithFilter({
        name: `Delete_${entity.ClassName}_Record`,
        description: `Deletes the specified record from the ${entity.Name} entity`,
        parameters: z.object(pkeyParams),
        scopeInfo: { scopePath: 'entity:delete', resource: entity.Name },
        async execute(props, sessionContext) {
            const sessionUser = sessionContext.user;
            const md = new Metadata(); // global-provider-ok: MCP server bootstrap
            const record = await md.GetEntityObject(entity.Name, sessionUser);
            const loaded = await record.InnerLoad(new CompositeKey(
                // use the primary keys to load the record
                entity.PrimaryKeys.map((pk) => {
                    return {
                        FieldName: pk.Name,
                        Value: props[pk.Name]
                    };
                })
            ));
            if (loaded) {
                const savedRecordJSON = await convertEntityObjectToJSON(record, sessionUser, md);
                const success = await record.Delete();
                return JSON.stringify({success, record: savedRecordJSON, errorMessage: !success ? record.LatestResult.CompleteMessage : undefined });
            }
            else {
                return JSON.stringify({success: false, record: undefined, errorMessage: "Record not found"});
            }
        }
    });
}


/*******************************************************************************
 * ENTITY HELPER FUNCTIONS
 ******************************************************************************/

/**
 * Converts a BaseEntity object to a JSON representation suitable for API responses, projected for
 * the caller: a field the caller may not read is omitted.
 *
 * An entity object built for the caller does not hold such a value in the first place, so this
 * is defence in depth. It is the single point through which every entity tool returns a record,
 * which is why the projection lives here rather than at each call site.
 *
 * @param record - The entity record to convert
 * @param user - The caller the response is for
 * @param md - Metadata source for the projection
 * @returns JSON string representation of the entity data
 */
async function convertEntityObjectToJSON(record: BaseEntity, user: UserInfo, md: Metadata): Promise<string> {
    // fls-guard: projected by ProjectEntityValuesForUser below
    const values: Record<string, unknown> = await record.GetDataObject({
        includeRelatedEntityData: false,
        oldValues: false,
        omitEmptyStrings: false,
        omitNullValues: false,
        excludeFields: [],
        relatedEntityList: [],
    });
    return JSON.stringify(ProjectEntityValuesForUser(md, record.EntityInfo, values, user));
}

/**
 * Why the caller may not send this input, or null when they may. A caller who is denied any field
 * on the entity is refused a key naming a field they cannot read AND a key naming no field at
 * all, with the same wording, so the refusal does not reveal which columns exist.
 *
 * @param entity - The entity the input will be applied to
 * @param values - The client input exactly as it will be passed to `SetMany`
 * @param user - The caller
 */
function clientInputRefusal(entity: EntityInfo, values: Record<string, unknown>, user: UserInfo): string | null {
    try {
        AssertClientInputWritableForUser(entity, values, user);
        return null;
    } catch (error: unknown) {
        if (error instanceof FieldSecurityError) {
            return error.message;
        }
        throw error;
    }
}

/**
 * An entity tool's input schema, built once per permission class rather than per session: users
 * whose omitted fields are the same set share one schema, and a user for whom nothing is omitted
 * gets {@link Shared}. The number of classes is bounded by the distinct role combinations that
 * have different field rules on the entity.
 */
class EntityToolSchemaCache {
    /** The schema for a user for whom nothing is omitted. */
    public readonly Shared: z.ZodObject<z.ZodRawShape>;
    private readonly byOmittedFields = new Map<string, z.ZodObject<z.ZodRawShape>>();

    /**
     * @param build - builds the schema leaving out the given lowercased field names
     * @param omittedFor - the lowercased field names to leave out for a user
     */
    constructor(
        private readonly build: (omitted: Set<string>) => z.ZodObject<z.ZodRawShape>,
        private readonly omittedFor: (user: UserInfo) => Set<string>,
    ) {
        this.Shared = build(new Set<string>());
    }

    /** The schema a session of `user` is shown. */
    public ForUser(user: UserInfo): z.ZodObject<z.ZodRawShape> {
        const omitted = this.omittedFor(user);
        if (omitted.size === 0) {
            return this.Shared;
        }
        const key = [...omitted].sort().join(',');
        let schema = this.byOmittedFields.get(key);
        if (!schema) {
            schema = this.build(omitted);
            this.byOmittedFields.set(key, schema);
        }
        return schema;
    }
}

/**
 * The lowercased names of the fields `user` may not read on `entity`, together with those the
 * given verb denies. Empty without computing anything when field security does not apply.
 */
function deniedFieldsUnion(entity: EntityInfo, user: UserInfo, deniedForVerb: (user: UserInfo) => Set<string>): Set<string> {
    if (!entity.FieldLevelSecurityApplies || !user) {
        return new Set<string>();
    }
    return new Set([...entity.GetDeniedReadFields(user), ...deniedForVerb(user)]);
}

/**
 * Builds a Zod parameter object for entity CRUD operations.
 *
 * @param entity - The entity to build parameters for
 * @param excludeReadOnlyFields - If true, excludes read-only fields from the schema
 * @param includePrimaryKeys - If true, includes primary key fields (never omitted)
 * @param nonPKeysOptional - If true, makes non-primary-key fields optional
 * @param omittedFields - Lowercased names of fields to leave out, such as those the session user is denied
 * @returns Object with Zod schemas for each included field
 */
function getEntityParamObject(
    entity: EntityInfo,
    excludeReadOnlyFields: boolean,
    includePrimaryKeys: boolean,
    nonPKeysOptional: boolean,
    omittedFields: Set<string> = new Set<string>()
): Record<string, z.ZodTypeAny> {
    const paramObject: Record<string, z.ZodTypeAny> = {};

    entity.Fields.filter(f => {
        if (f.IsPrimaryKey && includePrimaryKeys) {
            return true;
        }
        else if (omittedFields.has(f.Name.trim().toLowerCase())) {
            return false;
        }
        else if (f.ReadOnly && excludeReadOnlyFields) {
            return false;
        }
        else {
            return true;
        }
    }).forEach((f) => {
        // Primary keys are always required. For non-PK fields, mark as optional if:
        // 1. The caller requested all non-PKs optional (e.g. Update tools), OR
        // 2. The field allows NULL in the database, OR
        // 3. The field has a default value defined
        const isOptional = f.IsPrimaryKey ? false : (nonPKeysOptional || f.AllowsNull || !!f.DefaultValue);
        addSingleParamToObject(paramObject, f, isOptional);
    });

    return paramObject;
}

/**
 * Adds a single field as a Zod parameter to the parameter object.
 * Handles type mapping from MemberJunction types to Zod schemas,
 * including support for value lists (enums).
 *
 * @param theObject - The parameter object to add the field to
 * @param field - The entity field info
 * @param optional - If true, makes the parameter optional
 */
function addSingleParamToObject(
    theObject: Record<string, z.ZodTypeAny>,
    field: EntityFieldInfo,
    optional: boolean
): void {
    let newParam: z.ZodTypeAny;
    switch (field.TSType) {
        case 'Date':
            newParam = z.coerce.date();
            break;
        case 'boolean':
            newParam = z.boolean();
            break;
        case 'number':
            newParam = z.number();
            break;
        case 'string':
        default:
            // For strings, check if we have a value list and create an enum
            if (field.ValueListTypeEnum === 'None' || field.EntityFieldValues.length === 0) {
                newParam = z.string();
            }
            else {
                const enumList = field.EntityFieldValues.map((v) => v.Value);
                if (field.ValueListTypeEnum === 'List') {
                    newParam = z.enum(enumList as [string, ...string[]]);
                }
                else {
                    // List + user input: allow enum values or any string
                    newParam = z.union([z.enum(enumList as [string, ...string[]]), z.string()]);
                }
            }
            break;
    }

    // If the field allows NULL in the database, wrap with .nullable()
    if (field.AllowsNull) {
        newParam = newParam.nullable();
    }

    if (optional) {
        theObject[field.Name] = newParam.optional();
    }
    else {
        theObject[field.Name] = newParam;
    }
}

/**
 * Builds a Zod parameter object containing only the primary key fields for an entity.
 * Used for Get and Delete operations that only need to identify the record.
 *
 * @param entity - The entity to build primary key parameters for
 * @returns Object with Zod schemas for each primary key field
 */
function getEntityPrimaryKeyParamsObject(entity: EntityInfo): Record<string, z.ZodTypeAny> {
    const paramObject: Record<string, z.ZodTypeAny> = {};
    entity.PrimaryKeys.forEach((pk) => {
        addSingleParamToObject(paramObject, pk, false);
    });
    return paramObject;
}

/**
 * Creates a tool for retrieving a single record from an entity by primary key.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param entity - The entity to create the tool for
 */
export function AddEntityGetTool(addToolWithFilter: AddToolFn, entity: EntityInfo): void {
    const pkeyParams = getEntityPrimaryKeyParamsObject(entity);

    addToolWithFilter({
        name: `Get_${entity.ClassName}_Record`,
        description: `Retrieves the specified record from the ${entity.Name} entity`,
        parameters: z.object(pkeyParams),
        scopeInfo: { scopePath: 'entity:read', resource: entity.Name },
        async execute(props, sessionContext) {
            const sessionUser = sessionContext.user;
            const md = new Metadata(); // global-provider-ok: MCP server bootstrap
            const record = await md.GetEntityObject(entity.Name, sessionUser);
            await record.InnerLoad(new CompositeKey(
                entity.PrimaryKeys.map((pk) => ({
                    FieldName: pk.Name,
                    Value: props[pk.Name]
                }))
            ));
            return await convertEntityObjectToJSON(record, sessionUser, md);
        }
    });
}
