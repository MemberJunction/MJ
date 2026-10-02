/**
 * @fileoverview The native tool-calling gate — Layer 3 of the native tool-calling design.
 *
 * `AIPromptRunner` is the ONLY layer that reads metadata to decide whether a request goes out with
 * native tool declarations. This module is the decision itself, kept pure and free of the runner so
 * the truth table in the plan (§6.1) can be asserted directly.
 *
 * The invariant the whole design rests on: **capability is a hard gate, policy and preference are
 * not.** No setting at any layer can force tools onto a (model, vendor) that cannot accept them.
 * Three flags across two cascades:
 *
 * ```
 *  CAPABILITY   LLM.SupportsNativeToolCalling   catalog layers   can this model/vendor do it at all?
 *  POLICY       LLM.DefaultToNativeToolCalling  catalog layers   should prompts default to it here?
 *  PREFERENCE   LLM.UseNativeToolCalling        prompt layers    does THIS prompt want it?
 * ```
 *
 * Each cascade is merged by `ResolveEffectiveModelConfiguration` (base first, per-key deep merge),
 * so *within* a cascade an explicit value — `false` included — overrides the layer below, while an
 * absent property inherits. *Across* the two cascades the preference wins when it expresses one:
 * the merged prompt bag's `UseNativeToolCalling`, else the catalog's `DefaultToNativeToolCalling`,
 * else false.
 *
 * @module @memberjunction/ai-prompts
 */

import { AIModelConfiguration, AIPromptConfiguration, ChatParams, ChatResult, ResolveEffectiveModelConfiguration } from '@memberjunction/ai';
import { MJAIPromptRunEntity } from '@memberjunction/core-entities';

/**
 * Which tool-calling path a run took. Derived from the entity so it tracks the column's CHECK
 * constraint — CodeGen regenerates that union whenever the constraint changes.
 */
export type ToolCallingMode = NonNullable<MJAIPromptRunEntity['ToolCallingMode']>;

/** How control flow is expressed on a native request. */
export type NativeControlFlow = 'envelope' | 'implicit';

/** Everything the gate needs. Every config layer is optional; absent layers contribute nothing. */
export interface NativeToolCallingGateInput {
    /**
     * The merged model-catalog configuration for the SELECTED (model, vendor) — the output of
     * `AIEngine.GetEffectiveModelConfiguration(modelID, modelVendorRowID)`. Must be re-resolved per
     * failover attempt, because a failover target may not support tools.
     */
    catalogConfiguration: AIModelConfiguration | null | undefined;
    /** `MJ: AI Prompts.PromptConfiguration` for the prompt being run. */
    promptConfiguration: AIPromptConfiguration | null | undefined;
    /** `MJ: AI Prompt Models.PromptConfiguration` for the row that selected this model, if any. */
    promptModelConfiguration: AIPromptConfiguration | null | undefined;
    /** Whether the caller actually supplied ACTION tool declarations. The runner never invents tools. */
    toolsProvided: boolean;
    /**
     * Whether the caller supplied CONTROL-FLOW tools (sub-agent, payload_change_request, ask_user)
     * in addition to — or instead of — Action tools. `toolsProvided` counts Action tools only.
     * Optional so callers that supply no control tools keep compiling; absent means false.
     */
    controlToolsProvided?: boolean;
}

/** The gate's decision. */
export interface NativeToolCallingDecision {
    /** Whether this request should carry native tool declarations. */
    useNativeTools: boolean;
    /**
     * The mode to record on the run BEFORE any fallback. `'Native'` when tools are going out,
     * `'Envelope'` otherwise — including the misconfigured "wanted it, can't have it" case, which is
     * surfaced through {@link NativeToolCallingDecision.warning} rather than by a distinct mode.
     */
    mode: ToolCallingMode;
    /**
     * `'implicit'` when the request goes out with control tools under the implicit protocol,
     * `'envelope'` otherwise — including every envelope-path decision. The runner renders the
     * template and strips or keeps control tools from this, never from the catalog directly.
     */
    controlFlow: NativeControlFlow;
    /**
     * Whether this call's tool results go back to the model as native tool-result turns.
     * True only when native is on AND the catalog's `LLM.NativeToolResults` is true.
     */
    toolResults: boolean;
    /**
     * Set when policy or preference asked for native mode but capability refused. The caller logs
     * this so a misconfiguration is visible instead of silently degrading.
     */
    warning?: string;
}

/**
 * Resolves whether a prompt run should use native tool calling.
 *
 * @param input The resolved configuration layers plus whether the caller supplied tools
 * @returns The decision, the mode to record, and a warning when policy lost to capability
 */
export function ResolveNativeToolCalling(input: NativeToolCallingGateInput): NativeToolCallingDecision {
    const catalog = input.catalogConfiguration ?? null;

    // The prompt cascade merges the same way the catalog one does: prompt-model over prompt,
    // per key, so a prompt-model row overriding one knob inherits the prompt's others.
    const prompt = ResolveEffectiveModelConfiguration(
        input.promptConfiguration ?? null,
        input.promptModelConfiguration ?? null
    );

    // Capability — a hard gate. Absent resolves false: unknown support is not support.
    const supports = catalog?.LLM?.SupportsNativeToolCalling ?? false;

    // Preference beats policy; absent (or explicitly null, i.e. "no preference") falls through.
    const wants = prompt?.LLM?.UseNativeToolCalling
        ?? catalog?.LLM?.DefaultToNativeToolCalling
        ?? false;

    if (wants && !supports) {
        return {
            useNativeTools: false,
            mode: 'Envelope',
            controlFlow: 'envelope',
            toolResults: false,
            warning:
                'Native tool calling was requested (prompt LLM.UseNativeToolCalling, or the model\'s ' +
                'LLM.DefaultToNativeToolCalling) but the resolved model/vendor does not declare ' +
                'LLM.SupportsNativeToolCalling. Capability always beats policy — running on the ' +
                'envelope path instead. Set LLM.SupportsNativeToolCalling on the AI Model or AI Model ' +
                'Vendor row if this model does in fact support tools.'
        };
    }

    // Tools are the last requirement, and deliberately NOT a warning: a prompt may legitimately opt
    // in for the calls where the agent framework supplies tools and pass none on the calls where it
    // does not. With no tools, native mode is simply a no-op.
    // Control flow is a catalog policy, consulted only once native is on. Under 'implicit' the
    // control tools alone are enough to go native (a pure orchestrator has no Actions); under the
    // hybrid the runner strips them, so they do not count towards "tools provided".
    const implicitWanted = catalog?.LLM?.NativeControlFlow === 'implicit';
    const controlTools = input.controlToolsProvided === true;
    const useNativeTools = supports && wants && (input.toolsProvided || (implicitWanted && controlTools));
    const controlFlow: NativeControlFlow = useNativeTools && implicitWanted && controlTools ? 'implicit' : 'envelope';
    return {
        useNativeTools,
        controlFlow,
        toolResults: useNativeTools && catalog?.LLM?.NativeToolResults === true,
        mode: !useNativeTools ? 'Envelope' : controlFlow === 'implicit' ? 'NativeImplicit' : 'Native'
    };
}

// =============================================================================
// Mode recording — carrying the decision from the model call to the prompt run
// =============================================================================

/**
 * The mode a request/result was tagged with, kept OUT of the public `ChatParams` / `ChatResult`
 * shapes. Those are provider-facing types in `@memberjunction/ai`; which tool-calling path the MJ
 * prompt runner chose is the runner's own bookkeeping and has no business on the wire contract.
 *
 * A WeakMap keyed by the request/result object is safe under concurrency — every prompt run builds
 * its own `ChatParams` — and leaks nothing, since entries disappear with the objects.
 */
const toolCallingDecisionByObject = new WeakMap<ChatParams | ChatResult, NativeToolCallingDecision>();

/**
 * Tags a request (at gate time) or a result (after a fallback) with the tool-calling mode.
 *
 * @param target The `ChatParams` being sent, or the `ChatResult` that came back
 * @param mode The mode to record
 */
export function RecordToolCallingMode(target: ChatParams | ChatResult, mode: ToolCallingMode): void {
    // Mode-only convenience over RecordToolCallingDecision: a caller that only knows the mode (the
    // NativeFallback retry) keeps whatever control-flow / tool-results terms were recorded before.
    const existing = toolCallingDecisionByObject.get(target);
    toolCallingDecisionByObject.set(target, {
        useNativeTools: mode !== 'Envelope',
        controlFlow: existing?.controlFlow ?? 'envelope',
        toolResults: existing?.toolResults ?? false,
        mode
    });
}

/** Tags a request (at gate time) or a result with the gate's whole decision; the loop reads `toolResults` back. */
export function RecordToolCallingDecision(target: ChatParams | ChatResult, decision: NativeToolCallingDecision): void {
    toolCallingDecisionByObject.set(target, decision);
}

/** Reads back the whole decision for a request or result, or undefined when nothing tagged it. */
export function GetToolCallingDecision(target: ChatParams | ChatResult | null | undefined): NativeToolCallingDecision | undefined {
    return target ? toolCallingDecisionByObject.get(target) : undefined;
}

/**
 * Reads back the mode for a request or result.
 *
 * @param target The `ChatParams` that was sent, or the `ChatResult` that came back
 * @returns The recorded mode, or undefined when nothing tagged it (a path that never reached the gate)
 */
export function GetToolCallingMode(target: ChatParams | ChatResult | null | undefined): ToolCallingMode | undefined {
    return GetToolCallingDecision(target)?.mode;
}
