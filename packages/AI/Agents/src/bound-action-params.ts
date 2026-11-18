/**
 * Bound action parameters: values a caller fixes for an action's inputs before the run, hidden from
 * the model and applied at dispatch (`ExecuteAgentParams.boundActionParams`).
 *
 * The rules live here, free of `BaseAgent`, so they are testable on their own and so a host that
 * dispatches actions outside the agent loop can apply the same ones. `BaseAgent` uses them in four
 * places: the prose catalog and the native tool schema (what the model is shown), `ExecuteSingleAction`
 * (what the action receives) and the result echo (what the model is shown afterwards).
 */
import { BoundActionParams } from '@memberjunction/ai-core-plus';
import { MJActionParamEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/** One action's bindings: the parameter name as the caller spelled it → the fixed value. */
export type ActionBindings = Record<string, unknown>;

/** The outcome of applying one action's bindings to one call. */
export interface BoundParamsApplication {
    /**
     * The parameters to dispatch: the model's, minus every bound name, plus each bound value under
     * the action's own spelling of the parameter. With no bindings this is the model's object itself.
     */
    Params: Record<string, unknown>;
    /** Parameter names (the action's spelling) whose values came from a binding. */
    Bound: string[];
    /** Keys the model supplied for a bound parameter. Their values were discarded. */
    Overridden: string[];
    /** Why the call must not be dispatched, or `null` when it may proceed. */
    Refusal: string | null;
    /** False when the run binds nothing on this action, so the caller can keep today's path exactly. */
    HasBindings: boolean;
}

/**
 * The bindings declared for one action, or `undefined` when the run binds nothing on it. Action IDs
 * compare as UUIDs, so a caller's casing never matters.
 */
export function BindingsForAction(bound: BoundActionParams | undefined, actionID: string): ActionBindings | undefined {
    if (!bound || !actionID) {
        return undefined;
    }
    const key = Object.keys(bound).find((id) => UUIDsEqual(id, actionID));
    const bindings = key ? bound[key] : undefined;
    return bindings && Object.keys(bindings).length > 0 ? bindings : undefined;
}

/**
 * The parameters the model may be shown: every parameter whose name is not bound. With no bindings
 * the input array is returned as is, so an unbound run renders exactly what it rendered before.
 * Find Best Action and Find Candidate Actions keep their own copy of this rule
 * (`BaseFindActionsAction.visibleParams` in core-actions); a parity test there runs both on the same inputs.
 */
export function UnboundParams(params: readonly MJActionParamEntity[], bindings: ActionBindings | undefined): readonly MJActionParamEntity[] {
    if (!bindings) {
        return params;
    }
    return params.filter((p) => !IsBoundParamName(p.Name, bindings));
}

/**
 * True when `name` is one of the bound parameters (names compare case-insensitively); false with no
 * bindings. For the places that handle runtime `ActionParam`s rather than definitions, such as the
 * result echoed to the model, which must not show a bound `Both` parameter on the way out either.
 */
export function IsBoundParamName(name: string, bindings: ActionBindings | undefined): boolean {
    return bindings !== undefined && isBoundName(name, bindings);
}

/**
 * Applies one action's bindings to the parameters the model sent.
 *
 * Every binding must name one of the action's input parameters (`Input` or `Both`), or the call is
 * refused: a misspelled binding would otherwise leave the real parameter open to the model, which is
 * the one outcome a binding exists to prevent. A required parameter bound to `null` or `undefined`
 * refuses the call; an optional one bound to nothing stays hidden and is left out of the dispatch.
 */
export function ApplyBoundActionParams(
    modelParams: Record<string, unknown> | null | undefined,
    bindings: ActionBindings | undefined,
    definitions: readonly MJActionParamEntity[],
    actionName: string
): BoundParamsApplication {
    const supplied = modelParams ?? {};
    if (!bindings) {
        return { Params: supplied, Bound: [], Overridden: [], Refusal: null, HasBindings: false };
    }
    const params: Record<string, unknown> = {};
    const overridden: string[] = [];
    for (const [key, value] of Object.entries(supplied)) {
        if (isBoundName(key, bindings)) {
            overridden.push(key);
        } else {
            params[key] = value;
        }
    }
    const bound: string[] = [];
    for (const [name, value] of Object.entries(bindings)) {
        const definition = findInputDefinition(definitions, name);
        if (!definition) {
            return refused(supplied, `Action '${actionName}' refused: bound parameter '${name}' is not one of its input parameters.`);
        }
        if (definition.IsRequired && (value === null || value === undefined)) {
            return refused(supplied, `Action '${actionName}' refused: its required parameter '${definition.Name}' is bound to no value for this run.`);
        }
        if (value !== null && value !== undefined) {
            params[definition.Name] = value;
            bound.push(definition.Name);
        }
    }
    return { Params: params, Bound: bound, Overridden: overridden, Refusal: null, HasBindings: true };
}

/** The application for a call the bindings refuse: nothing bound, the model's parameters left as they were. */
function refused(supplied: Record<string, unknown>, refusal: string): BoundParamsApplication {
    return { Params: supplied, Bound: [], Overridden: [], Refusal: refusal, HasBindings: true };
}

/** The action's input (`Input` or `Both`) parameter definition for a bound name, if it has one. */
function findInputDefinition(definitions: readonly MJActionParamEntity[], name: string): MJActionParamEntity | undefined {
    return definitions.find((d) => isInputParam(d) && sameName(d.Name, name));
}

function isInputParam(param: MJActionParamEntity): boolean {
    const type = (param.Type ?? '').trim().toLowerCase();
    return type === 'input' || type === 'both';
}

function isBoundName(name: string, bindings: ActionBindings): boolean {
    return Object.keys(bindings).some((bound) => sameName(bound, name));
}

function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
    return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}
