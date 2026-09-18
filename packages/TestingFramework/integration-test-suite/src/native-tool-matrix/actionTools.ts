/**
 * actionTools.ts — the Action→ChatTool mapping, built so the provider probe can measure it.
 *
 * §8.2 specifies how a `ChatTool` is derived from `Action` + `ActionParam` metadata, but that
 * generator lives in the agent framework. The design nonetheless has to be committed to
 * before the hybrid loop is written, and one part of it is worth checking against real providers
 * first — see {@link scalarSchema}.
 *
 * So this is NOT the shipping generator, and deliberately does not live in the agent framework.
 * It is a faithful, standalone restatement of the §8.2 table, applied to *real* `ActionParam` rows
 * captured from the catalog ({@link ./action-fixtures.json}), so the matrix can ask providers what
 * they make of it. If the answer is "fine", the framework implements the same table with confidence. If
 * not, the finding lands before the code does, which is the entire point of the probe.
 *
 * The fixture is a snapshot rather than a live query on purpose: this rig runs with API keys and
 * nothing else, and a DB dependency here would make a provider probe depend on schema state.
 */
import type { ChatTool } from '@memberjunction/ai';
import actionFixtures from './action-fixtures.json';

/** `ActionParam.ValueType` — the catalog's five-value union. */
export type ActionParamValueType = 'Scalar' | 'Simple Object' | 'BaseEntity Sub-Class' | 'MediaOutput' | 'Other';

/** One `ActionParam` row, as captured from `vwActionParams`. */
export interface ActionParamFixture {
    Name: string;
    Description: string | null;
    Type: string;
    IsRequired: boolean;
    IsArray: boolean;
    DefaultValue: string | null;
    ValueType: string;
}

/** One `Action` row plus its input params. */
export interface ActionFixture {
    Name: string;
    Description: string | null;
    Params: ActionParamFixture[];
}

export const ACTION_FIXTURES: ActionFixture[] = actionFixtures as ActionFixture[];

/**
 * Sanitizes an Action name into a provider-legal tool name (§8.2: `[a-zA-Z0-9_-]`, ≤64 chars).
 *
 * "Run Ad-hoc Query" → "run_ad_hoc_query". Deterministic, because the framework has to resolve a
 * call back to the Action it names; §8.2 makes a post-sanitization collision a hard error at
 * tool-build time, which is why this returns the name rather than silently disambiguating it.
 */
export function sanitizeToolName(actionName: string): string {
    const sanitized = actionName
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    return sanitized.slice(0, 64);
}

/**
 * The §8.2 permissive mapping for a `Scalar` param — **and the reason this module exists.**
 *
 * §8.2 says `Scalar` → `{type: ["string", "number", "boolean"]}`, because `ActionParam.ValueType`
 * cannot distinguish the three. But §5.2/§8.2 ALSO require `inputSchema` to stay inside the
 * cross-provider common subset, because Gemini's classic function-declaration schema is an OpenAPI
 * subset — and OpenAPI 3.0 has no union `type`. Those two rules are in tension in the plan as
 * written, and which one wins is a provider question, not a design question.
 *
 * `union` emits the plan's literal mapping. `string` emits the conservative fallback (the prose
 * description carries the real type, exactly as the rendered action catalog does today). The matrix
 * runs both so the tension is settled with data.
 */
export type ScalarStrategy = 'union' | 'string';

export function scalarSchema(strategy: ScalarStrategy): Record<string, unknown> {
    return strategy === 'union' ? { type: ['string', 'number', 'boolean'] } : { type: 'string' };
}

/**
 * How to map the NON-`Scalar` value types (`Other`, `Simple Object`, `BaseEntity Sub-Class`,
 * `MediaOutput`).
 *
 * §8.2 specifies `object` for all of them, reasoning that this is "exact parity with the prose
 * catalog — same information, structurally attached". Measurement showed it is not
 * parity: `Run Ad-hoc Query.Query` is `ValueType: 'Other'` but holds a SQL **string**, and telling
 * a model it is an object makes a large share of calls arrive as `Query: {}` — the structural type
 * beating the prose description that says otherwise. `string` is the alternative arm: still
 * type-lossy, but lossy toward the format most `Other` params actually carry.
 */
export type OpaqueStrategy = 'object' | 'string';

/** Maps one param's `ValueType` onto a schema fragment, per the §8.2 table. */
function schemaForValueType(valueType: string, scalar: ScalarStrategy, opaque: OpaqueStrategy): Record<string, unknown> {
    if (valueType === 'Scalar') {
        return scalarSchema(scalar);
    }
    // `Simple Object` carries no shape in the catalog, and BaseEntity Sub-Class / MediaOutput /
    // Other are opaque by definition — so whichever way this goes, the prose description is doing
    // the real work. The question is only which type annotation gets in its way least.
    return opaque === 'object' ? { type: 'object' } : { type: 'string' };
}

/**
 * Folds the metadata §8.2 says belongs in the description into the description.
 *
 * `DefaultValue` and format hints have nowhere structural to go under the permissive mapping, and
 * dropping them would make the tool strictly less informative than the prose catalog it replaces.
 */
function describeParam(param: ActionParamFixture): string {
    const parts: string[] = [];
    if (param.Description) {
        parts.push(param.Description.trim());
    }
    if (param.DefaultValue) {
        parts.push(`Default: ${param.DefaultValue}.`);
    }
    return parts.join(' ');
}

/** Builds the `ChatTool` for one Action under a given pair of mapping strategies. */
export function buildToolFromAction(action: ActionFixture, strategy: ScalarStrategy, opaque: OpaqueStrategy = 'object'): ChatTool {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const param of action.Params) {
        const element = schemaForValueType(param.ValueType, strategy, opaque);
        const description = describeParam(param);
        // IsArray wraps the element schema rather than replacing it (§8.2).
        const schema = param.IsArray ? { type: 'array', items: element } : element;
        properties[param.Name] = description ? { ...schema, description } : schema;
        if (param.IsRequired) {
            required.push(param.Name);
        }
    }
    const inputSchema: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) {
        inputSchema.required = required;
    }
    return {
        name: sanitizeToolName(action.Name),
        // §8.2: prescriptive about WHEN to call, not just what it does — it measurably improves
        // should-call rates, and the catalog Description alone is rarely phrased that way.
        description: `Call this when you need to: ${(action.Description ?? action.Name).trim()}`,
        inputSchema
    };
}

/** Looks a fixture up by Action name, throwing on a typo rather than silently building nothing. */
export function getActionFixture(name: string): ActionFixture {
    const found = ACTION_FIXTURES.find((a) => a.Name === name);
    if (!found) {
        throw new Error(`No action fixture named '${name}'. Known: ${ACTION_FIXTURES.map((a) => a.Name).join(', ')}`);
    }
    return found;
}
