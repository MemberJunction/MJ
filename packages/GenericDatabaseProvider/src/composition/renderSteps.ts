import type { QueryTemplateContext } from '@memberjunction/core';
import type { QueryParameterDefinition } from '@memberjunction/query-processor';
import type { SQLDialect } from '@memberjunction/sql-dialect';
import type { RenderContext } from '../renderPipeline.js';
import { CompositionAssembler, type AssembledComposition } from './compositionAssembler.js';
import { CompositionRender, type CompositionInstance, type UnitRenderRequest } from './compositionRender.js';
import type { TemplateUnit } from './templateUnit.js';

/** A render for `ctx`. With `staticOnly`, the outer query is composed without being rendered. */
export function NewCompositionRender(ctx: RenderContext, dialect: SQLDialect, context: QueryTemplateContext, staticOnly: boolean): CompositionRender {
    return new CompositionRender({
        Platform: ctx.Platform,
        Dialect: dialect,
        DialectKey: ctx.DialectKey ?? ctx.Platform,
        ContextUser: ctx.ContextUser,
        ServerParameters: ctx.ServerParameters,
        Context: context,
        RootQueryID: ctx.QueryID,
        StaticArgumentsOnly: staticOnly,
    });
}

/**
 * The outer query's render request. Its parameter definitions come from `QueryInfo` (saved
 * queries) or `ParameterDefinitions`. Without definitions, or when the query composes others,
 * a value for an undeclared name is accepted, as it always was.
 */
export function OuterRenderRequest(sql: string, ctx: RenderContext): UnitRenderRequest {
    const definitions: ReadonlyArray<QueryParameterDefinition> = ctx.QueryInfo?.Parameters ?? ctx.ParameterDefinitions ?? [];
    const definitionsGiven = ctx.ParameterDefinitions !== undefined;
    return {
        SQL: sql,
        RendersTemplate: ctx.UsesTemplate ?? ctx.QueryInfo?.UsesTemplate ?? false,
        Label: 'of this query',
        Definitions: definitions,
        Parameters: ctx.Parameters,
        ServerParameters: ctx.ServerParameters,
        SkipUnknownParameterCheck: (unit: TemplateUnit) => unit.References.length > 0 || !definitionsGiven,
        InlineDependencies: ctx.Dependencies,
        Depth: 0,
        Stack: ctx.QueryID ? [ctx.QueryID] : [],
    };
}

/** The plain SQL: the outer render alone, or assembled with its instances. */
export function AssembleComposition(outerSQL: string, instances: readonly CompositionInstance[], dialect: SQLDialect): AssembledComposition {
    return instances.length > 0 ? CompositionAssembler.Assemble(outerSQL, instances, dialect) : { SQL: outerSQL, Instances: [] };
}
