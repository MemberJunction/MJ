/**
 * What each part type declares (plan § 4 and § 4.1): its inputs and its events.
 *
 * - View: its view's properties (`MJ: User Views.Properties`); `RecordSelected`, carrying the
 *   record's fields.
 * - Query: its query's parameters (`MJ: Query Parameters`); `RowSelected`, carrying the row's columns.
 * - Component: its component's declared props and events (`ComponentSpec.properties` / `.events`).
 * - Web URL: the `{Name}` placeholders in its URL; no events.
 * - Artifact (and any other type): nothing.
 *
 * The `...PartInterface` functions are pure; `LoadPartInterface` loads what they need through a provider.
 */
import { EntityInfo, IMetadataProvider, PlatformSQL, RunView } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
    MJQueryEntityExtended,
    MJQueryFieldEntity,
    MJQueryParameterEntity,
    MJUserViewEntityExtended,
    QueryEngine,
} from '@memberjunction/core-entities';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import type { PanelConfig } from './dashboard-types';
import {
    ComponentTypeToValueType,
    DashboardPartInput,
    DashboardPartInterface,
    DashboardValueType,
    EMPTY_PART_INTERFACE,
    ParseUrlPlaceholders,
    RECORD_SELECTED_EVENT,
    ROW_SELECTED_EVENT,
    SqlTypeToValueType,
} from './dashboard-properties';

/** A View part's interface: the view's properties, and `RecordSelected` with the entity's fields. */
export function ViewPartInterface(view: Pick<MJUserViewEntityExtended, 'PropertiesObject'> | null, entity: EntityInfo | null): DashboardPartInterface {
    const inputs: DashboardPartInput[] = (view?.PropertiesObject ?? []).map(property => ({
        Name: property.Name,
        Type: property.Type,
        Description: property.Description,
        IsRequired: property.IsRequired === true,
        HasOwnDefault: property.Default != null,
        ServerSet: property.AllowOverride === false,
    }));
    const values = (entity?.Fields ?? [])
        .filter(f => !f.IsBinaryFieldType)
        .map(f => ({ Name: f.Name, Type: SqlTypeToValueType(f.Type) }));
    return { Inputs: inputs, Events: entity ? [{ Name: RECORD_SELECTED_EVENT, Values: values }] : [] };
}

/** A Query part's interface: the query's parameters, and `RowSelected` with its columns. */
export function QueryPartInterface(
    parameters: readonly Pick<MJQueryParameterEntity, 'Name' | 'Type' | 'Description' | 'IsRequired' | 'DefaultValue' | 'IsServerSet'>[],
    fields: readonly Pick<MJQueryFieldEntity, 'Name' | 'SQLBaseType'>[],
): DashboardPartInterface {
    const inputs: DashboardPartInput[] = parameters.map(p => ({
        Name: p.Name,
        Type: queryParameterType(p.Type),
        Description: p.Description ?? undefined,
        IsRequired: p.IsRequired === true,
        HasOwnDefault: p.DefaultValue != null && p.DefaultValue !== '',
        ServerSet: p.IsServerSet === true,
        UserCanFill: true,
    }));
    const values = fields.map(f => ({ Name: f.Name, Type: SqlTypeToValueType(f.SQLBaseType) }));
    return { Inputs: inputs, Events: [{ Name: ROW_SELECTED_EVENT, Values: values }] };
}

function queryParameterType(type: MJQueryParameterEntity['Type']): DashboardValueType {
    switch (type) {
        case 'string':
        case 'number':
        case 'boolean':
        case 'date':
            return type;
        default:
            return 'unsupported';
    }
}

/** A Component part's interface: the component's declared props and events. */
export function ComponentPartInterface(spec: Pick<ComponentSpec, 'properties' | 'events'> | null): DashboardPartInterface {
    const inputs: DashboardPartInput[] = (spec?.properties ?? []).map(prop => ({
        Name: prop.name,
        Type: ComponentTypeToValueType(prop.type),
        Description: prop.description,
        IsRequired: prop.required === true,
        HasOwnDefault: prop.defaultValue !== undefined,
        ServerSet: false,
    }));
    const events = (spec?.events ?? []).map(event => ({
        Name: event.name,
        Values: (event.parameters ?? []).map(p => ({ Name: p.name, Type: ComponentTypeToValueType(p.type) })),
    }));
    return { Inputs: inputs, Events: events };
}

/** A Web URL part's interface: one required input per `{Name}` placeholder; any value, URL-encoded. */
export function WebUrlPartInterface(url: string | null | undefined): DashboardPartInterface {
    const inputs = ParseUrlPlaceholders(url).map(name => ({
        Name: name, Type: 'any' as const, IsRequired: true, HasOwnDefault: false, ServerSet: false,
    }));
    return { Inputs: inputs, Events: [] };
}

/** The part config keys a Component part keeps. */
export const COMPONENT_NAME_KEY = 'componentName';
export const COMPONENT_NAMESPACE_KEY = 'componentNamespace';
export const COMPONENT_VERSION_KEY = 'componentVersion';

/**
 * Loads the registered component a Component part names (`MJ: Components` by name, and namespace and
 * version when given; the highest version otherwise) and parses its specification.
 * @throws when the part names no component, none matches, or its specification isn't valid JSON
 */
export async function LoadComponentSpec(config: PanelConfig, provider: IMetadataProvider): Promise<ComponentSpec> {
    const name = stringKey(config, COMPONENT_NAME_KEY);
    if (!name) throw new Error('No component is selected.');
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<{ Name: string; Specification: string }>({
        EntityName: 'MJ: Components',
        Fields: ['ID', 'Name', 'Specification'],
        ExtraFilter: componentFilter(name, stringKey(config, COMPONENT_NAMESPACE_KEY), stringKey(config, COMPONENT_VERSION_KEY)),
        OrderBy: 'VersionSequence DESC',
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'simple',
    }, provider.CurrentUser);
    if (!result.Success) throw new Error(result.ErrorMessage || `Component "${name}" could not be loaded.`);
    const row = result.Results[0];
    if (!row) throw new Error(`Component "${name}" was not found.`);
    try {
        return JSON.parse(row.Specification) as ComponentSpec;
    } catch {
        throw new Error(`Component "${name}" has an invalid specification.`);
    }
}

/** The filter for one component: its name (a Unicode literal on SQL Server), and namespace and version when given. */
function componentFilter(name: string, namespace: string | null, version: string | null): PlatformSQL {
    const others = [
        namespace ? ` AND Namespace = '${EscapeSQLString(namespace)}'` : '',
        version ? ` AND Version = '${EscapeSQLString(version)}'` : '',
    ].join('');
    const literal = EscapeSQLString(name);
    return { default: `Name = '${literal}'${others}`, sqlserver: `Name = N'${literal}'${others}` };
}

function stringKey(config: PanelConfig, key: string): string | null {
    const value = config[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The QueryEngine for a provider, loaded on first use. */
async function queryEngineFor(provider: IMetadataProvider): Promise<QueryEngine> {
    const engine = QueryEngine.GetProviderInstance<QueryEngine>(provider, QueryEngine) as QueryEngine;
    await engine.Config(false, provider.CurrentUser, provider);
    return engine;
}

/** The query a Query part names, by ID or by name. */
function findQuery(engine: QueryEngine, config: PanelConfig): MJQueryEntityExtended | undefined {
    const queryId = stringKey(config, 'queryId');
    if (queryId) return engine.Queries.find(q => UUIDsEqual(q.ID, queryId));
    const queryName = stringKey(config, 'queryName');
    return queryName ? engine.FindQueryByName(queryName) : undefined;
}

async function loadViewInterface(config: PanelConfig, provider: IMetadataProvider): Promise<DashboardPartInterface> {
    const viewId = stringKey(config, 'viewId');
    if (!viewId) {
        const entityName = stringKey(config, 'entityName');
        return ViewPartInterface(null, entityName ? provider.EntityByName(entityName) ?? null : null);
    }
    const view = await provider.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', provider.CurrentUser);
    if (!(await view.Load(viewId))) throw new Error('View not found');
    return ViewPartInterface(view, view.ViewEntityInfo ?? null);
}

async function loadQueryInterface(config: PanelConfig, provider: IMetadataProvider): Promise<DashboardPartInterface> {
    if (!stringKey(config, 'queryId') && !stringKey(config, 'queryName')) return EMPTY_PART_INTERFACE;
    const engine = await queryEngineFor(provider);
    const query = findQuery(engine, config);
    if (!query) return EMPTY_PART_INTERFACE;
    return QueryPartInterface(engine.GetQueryParameters(query.ID), engine.GetQueryFields(query.ID));
}

/**
 * Loads what a part declares, from its config: through the provider for a View, Query or Component
 * part; from the URL for a Web URL part; nothing for any other type.
 * @throws when the part's view or component can't be loaded
 */
export async function LoadPartInterface(config: PanelConfig | null | undefined, provider: IMetadataProvider): Promise<DashboardPartInterface> {
    switch (config?.type) {
        case 'View':
            return loadViewInterface(config, provider);
        case 'Query':
            return loadQueryInterface(config, provider);
        case 'Component':
            return stringKey(config, COMPONENT_NAME_KEY) ? ComponentPartInterface(await LoadComponentSpec(config, provider)) : EMPTY_PART_INTERFACE;
        case 'WebURL':
            return WebUrlPartInterface(stringKey(config, 'url'));
        default:
            return EMPTY_PART_INTERFACE;
    }
}
