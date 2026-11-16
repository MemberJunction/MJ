/**
 * @fileoverview Maps MJ Actions onto native tool declarations (plan §8.2).
 * @module @memberjunction/ai-agents
 */

import type { ChatTool } from '@memberjunction/ai';
import type { MJActionParamEntity } from '@memberjunction/core-entities';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import { CoerceValueToSchema, type ParamValueSchema, ResolveParamElementSchema } from './action-param-schema';

/** One Action, and the provider-legal tool name it was declared under. */
export interface ActionToolBinding {
    /** Discriminant shared with the control-flow bindings in `control-tools.ts`. */
    kind: 'action';
    /** The sanitized name the model calls. */
    toolName: string;
    /** The Action the framework dispatches when that name comes back. */
    action: MJActionEntityExtended;
    tool: ChatTool;
    /** The Action's params the tool was built from — what {@link CoerceActionArguments} reads back. */
    params: readonly MJActionParamEntity[];
}

/**
 * A built tool set plus the reverse map from tool name back to Action.
 *
 * The reverse map is not a convenience — a tool call arrives as a sanitized string, and without it
 * the framework cannot tell which Action to dispatch. It is built alongside the declarations so
 * the two can never disagree.
 */
export interface ActionToolSet {
    tools: ChatTool[];
    /** Keyed by the sanitized tool name. */
    byToolName: Map<string, ActionToolBinding>;
}

/** Providers cap tool names at 64 characters. */
const MAX_TOOL_NAME_LENGTH = 64;

/**
 * Ceiling on a tool's `description` — an OPERATING POINT, not a provider limit.
 *
 * No tool-capable vendor enforces a cap anywhere near here: OpenAI (gpt-5.6-luna), Cerebras
 * (gpt-oss-120b) and Gemini (3.7 Flash) each accepted an 8,000-character description on a live
 * call. The number is chosen from measurement instead. A comparison run used the
 * same 1,026-observation corpus at 1,024 and at 4,096 (results doc §10–§11): at 1,024 — where a
 * large Action degrades to output names and result codes with descriptions trimmed — native
 * selection accuracy improved on two of three models (+6.3pp Gemini, +11.3pp GPT 5.6-luna). At
 * 4,096, with every description in full, both gains disappeared, GPT-OSS-120B fell a further 5pp,
 * its prompt grew by ~700 tokens per call, and it began returning no action at all on cases it
 * had handled. Same-case comparison: −10 correct turns net.
 *
 * So the names and codes are what discriminates; the sentences around them are dilution the
 * smallest model pays for most. One A/B at N=3 is directional rather than definitive (envelope-arm
 * run-to-run noise is ±2–3pp), and a per-provider ceiling is the obvious follow-up — but until
 * someone measures that, compact is the point the data favours. The detail-degradation below is
 * therefore the NORMAL path for large Actions, not a safety net.
 */
export const MAX_TOOL_DESCRIPTION_LENGTH = 1024;

/** Per-item description lengths tried in order until the whole description fits the cap. */
const DESCRIPTION_DETAIL_LEVELS: readonly number[] = [160, 110, 70, 40, 0];

/**
 * Sanitizes an Action name into a provider-legal tool name (§8.2: `[a-zA-Z0-9_-]`, ≤64 chars).
 *
 * "Run Ad-hoc Query" → "run_ad_hoc_query". Deterministic, because a call has to resolve back to
 * the Action that produced it; the collision check lives in {@link buildActionToolSet} rather than
 * here, so this stays a pure function of the name.
 */
export function SanitizeToolName(actionName: string): string {
    return actionName
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
        .slice(0, MAX_TOOL_NAME_LENGTH);
}

/** @deprecated Use {@link SanitizeToolName}. */
export function sanitizeToolName(actionName: string): string {
    return SanitizeToolName(actionName);
}

/**
 * Coerces a call's arguments toward each param's declared schema, before the Action runs.
 *
 * Models sometimes send an object as a JSON string, a number as `"10"` or a boolean as `"true"`.
 * Each declared param is coerced against the same schema its tool declaration used — the stored
 * `ValueSchema` or the `ValueType` mapping, array-wrapped for `IsArray` — so a param declared as a
 * string (an `Other` param, which may legitimately hold JSON-looking text) is never decoded.
 *
 * @param params The Action's params, as the tool was built from them
 * @param args The call's arguments, as the provider returned them
 * @returns A new argument object; `args` is not mutated
 */
export function CoerceActionArguments(
    params: readonly MJActionParamEntity[],
    args: Record<string, unknown> | undefined
): Record<string, unknown> {
    const coerced: Record<string, unknown> = { ...(args ?? {}) };
    for (const param of params) {
        if (!(param.Name in coerced)) {
            continue;
        }
        const element = ResolveParamElementSchema(param);
        const schema: ParamValueSchema = param.IsArray ? { type: 'array', items: element } : element;
        coerced[param.Name] = CoerceValueToSchema(coerced[param.Name], schema);
    }
    return coerced;
}

/**
 * Folds the metadata that has nowhere structural to go into the property description.
 *
 * Dropping `DefaultValue` would make the tool strictly less informative than the prose catalog it
 * replaces, which is the one thing this mapping must never be.
 */
function describeParam(param: MJActionParamEntity, schemaDescription?: string): string {
    const parts: string[] = [];
    const description = schemaDescription ?? param.Description;
    if (description) {
        parts.push(description.trim());
    }
    if (param.DefaultValue) {
        parts.push(`Default: ${param.DefaultValue}.`);
    }
    return parts.join(' ');
}

/** A single clause of the description, trimmed to the current detail level. */
function clip(text: string | null | undefined, max: number): string {
    const t = (text ?? '').replace(/\s+/g, ' ').trim();
    if (max === 0 || t.length === 0) {
        return '';
    }
    return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Composes the tool description at one level of detail. Sections with nothing to say are omitted
 * rather than emitted empty, so an Action with no outputs or result codes reads exactly as before.
 */
function composeDescription(
    action: MJActionEntityExtended,
    outputs: readonly MJActionParamEntity[],
    codes: readonly { ResultCode: string; IsSuccess: boolean; Description: string | null }[],
    detail: number
): string {
    // §8.2: prescriptive about WHEN to call, not merely what the tool does — it measurably
    // improves should-call rates, and an Action's Description is rarely phrased that way.
    const lines = [`Call this when you need to: ${(action.Description ?? action.Name).trim()}`];

    if (outputs.length > 0) {
        lines.push(`Returns: ${outputs.map((p) => {
            const d = clip(p.Description, detail);
            return d ? `${p.Name} (${d})` : p.Name;
        }).join(', ')}`);
    }
    if (codes.length > 0) {
        lines.push(`Results: ${codes.map((rc) => {
            const d = clip(rc.Description, detail);
            // Mirror the prose catalog's convention, and skip a description that merely restates the code.
            const restates = d.toLowerCase() === rc.ResultCode.toLowerCase();
            return `${rc.ResultCode} ${rc.IsSuccess ? '✓' : '✗'}${d && !restates ? ` ${d}` : ''}`;
        }).join(' · ')}`);
    }
    return lines.join('\n');
}

/**
 * Builds the tool's description — everything the prose action catalog says about an Action that
 * has no structural home in the declaration.
 *
 * **Why outputs and result codes are here.** `formatActionDetails`, the prose catalog the envelope
 * path renders, gives the model five things per action: name, description, inputs, outputs and
 * result codes. The first version of this builder gave it three — and measurement showed the
 * consequence. The confusion pairs were identical in both arms (`Run Ad-hoc Query` mistaken for
 * `Search Query Catalog` on every model), but the native arm confused them MORE: P(right tool |
 * acted) fell 82% → 70% on GPT-OSS-120B. For that pair the outputs and result codes are the
 * discriminator — `Search Query Catalog` carries `NO_MATCHES ✓ … Proceed with ad-hoc SQL`, which
 * states the relationship between the two actions in one line. A model reading prose saw it; a
 * model reading the declaration did not. The rule this file already stated — never less
 * informative than the prose catalog — was being broken by two sections out of five.
 *
 * **Why the detail degrades instead of the cap truncating.** Providers cap the description; some
 * Actions have nine result codes with sentence-long explanations. A blind `slice` would keep the
 * first few codes in full and drop the rest entirely, which is the worst trade — names and codes
 * are the cheap, high-information part. So per-item descriptions shrink through
 * {@link DESCRIPTION_DETAIL_LEVELS} until the whole thing fits, and only at detail 0 (names and
 * codes alone) does a hard trim apply as a last resort.
 */
function describeTool(action: MJActionEntityExtended, params: readonly MJActionParamEntity[]): string {
    const outputs = params.filter((p) => p.Type === 'Output' || p.Type === 'Both');
    // Harness stand-ins may build an Action literal without the related-record collection. The collection
    // itself is declared `OrderBy: 'ResultCode ASC'`, and the prose catalog lists the codes in that same
    // order, so they are left as they come: the two descriptions have to agree.
    const codes = action.ResultCodes?.Items ?? [];

    for (const detail of DESCRIPTION_DETAIL_LEVELS) {
        const text = composeDescription(action, outputs, codes, detail);
        if (text.length <= MAX_TOOL_DESCRIPTION_LENGTH) {
            return text;
        }
    }
    return `${composeDescription(action, outputs, codes, 0).slice(0, MAX_TOOL_DESCRIPTION_LENGTH - 1).trimEnd()}…`;
}

/**
 * The property schema one param is declared with.
 *
 * The element schema is the param's stored `ValueSchema` when it has one, else the `ValueType`
 * mapping. `IsArray` wraps it rather than replacing it (§8.2), and the element keeps its own
 * description inside `items`. On a non-array param a description in the stored schema takes the
 * place of the param's `Description`, since the schema author wrote it for this declaration.
 */
function declareParam(param: MJActionParamEntity): ParamValueSchema {
    const element = ResolveParamElementSchema(param);
    const schema: ParamValueSchema = param.IsArray ? { type: 'array', items: element } : element;
    const description = describeParam(param, param.IsArray ? undefined : element.description);
    return description ? { ...schema, description } : schema;
}

/**
 * Builds the `ChatTool` declaration for one Action.
 *
 * Only `Input` and `Both` params are declared: an `Output` param is something the Action returns,
 * and declaring it would invite the model to supply it.
 */
export function BuildToolFromAction(action: MJActionEntityExtended, params: readonly MJActionParamEntity[]): ChatTool {
    const properties: Record<string, ParamValueSchema> = {};
    const required: string[] = [];

    // Declared in ordinal name order, so the schema is byte-identical wherever it is built. The `Params`
    // collection already loads `OrderBy: 'Name ASC'`, but that is the database's collation order, which
    // differs between servers; a tool declaration that differs only in property order still misses the
    // provider's prompt cache.
    const declared = params
        .filter((param) => param.Type === 'Input' || param.Type === 'Both')
        .sort((a, b) => CompareToolNames(a.Name, b.Name));
    for (const param of declared) {
        properties[param.Name] = declareParam(param);
        if (param.IsRequired) {
            required.push(param.Name);
        }
    }

    const inputSchema: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) {
        inputSchema.required = required;
    }

    return {
        name: SanitizeToolName(action.Name),
        description: describeTool(action, params),
        inputSchema
    };
}

/** @deprecated Use {@link BuildToolFromAction}. */
export function buildToolFromAction(action: MJActionEntityExtended, params: readonly MJActionParamEntity[]): ChatTool {
    return BuildToolFromAction(action, params);
}

/**
 * Builds the full tool set for an agent's available Actions, with the reverse map.
 *
 * **A post-sanitization collision is a hard error** (§8.2), not a silent disambiguation. Two
 * Actions whose names differ only by punctuation would otherwise produce one tool name, and every
 * call to it would dispatch whichever Action happened to be registered last — a routing bug that
 * looks like a model error and would be found, if at all, by someone reading eval failures.
 * Failing at build time turns it into a metadata problem with a name attached.
 */
export function BuildActionToolSet(
    actions: readonly MJActionEntityExtended[],
    paramsByActionId: ReadonlyMap<string, readonly MJActionParamEntity[]>
): ActionToolSet {
    const byToolName = new Map<string, ActionToolBinding>();
    const tools: ChatTool[] = [];

    for (const action of actions) {
        const params = paramsByActionId.get(action.ID) ?? [];
        const tool = BuildToolFromAction(action, params);
        const existing = byToolName.get(tool.name);
        if (existing) {
            throw new Error(
                `Action tool name collision: '${existing.action.Name}' and '${action.Name}' both sanitize to `
                + `'${tool.name}'. Rename one of the Actions — a tool call cannot be resolved back to an Action otherwise.`
            );
        }
        if (tool.name.length === 0) {
            throw new Error(`Action '${action.Name}' sanitizes to an empty tool name — it must contain at least one alphanumeric character.`);
        }
        byToolName.set(tool.name, { kind: 'action', toolName: tool.name, action, tool, params });
        tools.push(tool);
    }
    // Same reason as the parameter order inside each tool: the actions arrive in load order.
    tools.sort((a, b) => CompareToolNames(a.name, b.name));

    return { tools, byToolName };
}

/**
 * Ordinal comparison for the names that decide tool-declaration order. Deliberately not `localeCompare`:
 * the order has to be the same in every process, whatever its locale, or the declarations differ between
 * servers for the same agent.
 */
export function CompareToolNames(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** @deprecated Use {@link BuildActionToolSet}. */
export function buildActionToolSet(
    actions: readonly MJActionEntityExtended[],
    paramsByActionId: ReadonlyMap<string, readonly MJActionParamEntity[]>
): ActionToolSet {
    return BuildActionToolSet(actions, paramsByActionId);
}

/** The two fields of an `MJ: AI Agent Actions` row that declaration control reads. */
export interface AgentActionDeclarationRow {
    ActionID: string | null;
    DeclareAsNativeTool: boolean;
}

/**
 * Removes the Actions an agent has chosen not to declare as native tools.
 *
 * Only an explicit `DeclareAsNativeTool = false` on the agent-action row excludes an action. An
 * action with no row — one granted through a skill at runtime — stays declarable, because the
 * default is to declare. Pure so the rule is testable without the engine; `BaseAgent` supplies the
 * rows from `AIEngine.Instance.AgentActions`.
 *
 * Note the consequence the design accepts: in native mode the prose catalog is not rendered, so an
 * action removed here is unreachable on that turn, not merely de-emphasised.
 */
export function FilterDeclarableActions(
    actions: readonly MJActionEntityExtended[],
    agentActionRows: ReadonlyArray<AgentActionDeclarationRow>
): MJActionEntityExtended[] {
    const excluded = new Set(
        agentActionRows
            .filter((row) => row.DeclareAsNativeTool === false && row.ActionID)
            .map((row) => (row.ActionID as string).toLowerCase())
    );
    return actions.filter((action) => !excluded.has(action.ID.toLowerCase()));
}

/** @deprecated Use {@link FilterDeclarableActions}. */
export function filterDeclarableActions(
    actions: readonly MJActionEntityExtended[],
    agentActionRows: ReadonlyArray<AgentActionDeclarationRow>
): MJActionEntityExtended[] {
    return FilterDeclarableActions(actions, agentActionRows);
}
