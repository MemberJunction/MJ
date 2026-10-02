/**
 * The native tool-calling gate — Layer 3 of the native tool-calling design.
 *
 * The centrepiece here is `§6.1 truth table`, which enumerates the plan's table row for row. It is
 * written as a data-driven table on purpose: the invariant it protects (capability beats policy,
 * always) is the one thing in this feature that must never regress, and a table makes a missing or
 * altered row obvious in review.
 */
import { describe, it, expect } from 'vitest';
import { AIModelConfiguration, AIPromptConfiguration, ChatParams, ChatResult } from '@memberjunction/ai';
import {
    ResolveNativeToolCalling,
    RecordToolCallingMode,
    RecordToolCallingDecision,
    GetToolCallingDecision,
    GetToolCallingMode,
    ToolCallingMode
} from '../nativeToolCallingGate';

/** Builds a catalog bag, or null when neither flag is expressed. */
const catalog = (supports?: boolean | null, defaultTo?: boolean | null): AIModelConfiguration | null => {
    if (supports === undefined && defaultTo === undefined) {
        return null;
    }
    const llm: Record<string, boolean | null> = {};
    if (supports !== undefined) llm.SupportsNativeToolCalling = supports;
    if (defaultTo !== undefined) llm.DefaultToNativeToolCalling = defaultTo;
    return { LLM: llm };
};

/** Builds a prompt-layer bag, or null when no preference is expressed. */
const promptBag = (use?: boolean | null): AIPromptConfiguration | null =>
    use === undefined ? null : { LLM: { UseNativeToolCalling: use } };

describe('ResolveNativeToolCalling — §6.1 truth table', () => {
    interface Row {
        name: string;
        promptModelUse?: boolean | null;
        promptUse?: boolean | null;
        vendorDefault?: boolean | null;
        supports?: boolean | null;
        expected: boolean;
        expectWarning?: boolean;
    }

    // `vendorDefault` stands in for the catalog cascade's already-merged DefaultToNativeToolCalling
    // (the resolver upstream has applied vendor-over-model-over-type before the gate sees it).
    const rows: Row[] = [
        { name: "today's behavior, untouched — nothing expressed anywhere", expected: false },
        { name: 'model-level default opts in', vendorDefault: true, supports: true, expected: true },
        { name: 'vendor default false beats a model default true (merged upstream)', vendorDefault: false, supports: true, expected: false },
        { name: 'prompt opts in', promptUse: true, vendorDefault: null, supports: true, expected: true },
        { name: 'prompt opts in but capability says no', promptUse: true, supports: false, expected: false, expectWarning: true },
        { name: 'promptModel false overrides prompt true', promptModelUse: false, promptUse: true, supports: true, expected: false },
        { name: 'promptModel true — most specific wins', promptModelUse: true, promptUse: false, supports: true, expected: true },
        { name: 'promptModel true but capability says no', promptModelUse: true, promptUse: false, supports: false, expected: false, expectWarning: true }
    ];

    it.each(rows)('$name', (row) => {
        const decision = ResolveNativeToolCalling({
            catalogConfiguration: catalog(row.supports, row.vendorDefault),
            promptConfiguration: promptBag(row.promptUse),
            promptModelConfiguration: promptBag(row.promptModelUse),
            toolsProvided: true
        });

        expect(decision.useNativeTools).toBe(row.expected);
        expect(decision.mode).toBe(row.expected ? 'Native' : 'Envelope');
        expect(decision.warning !== undefined).toBe(row.expectWarning === true);
    });
});

describe('ResolveNativeToolCalling — capability is a hard gate', () => {
    it('cannot be overridden by any combination of policy and preference', () => {
        for (const promptUse of [true, undefined]) {
            for (const defaultTo of [true, undefined]) {
                const decision = ResolveNativeToolCalling({
                    catalogConfiguration: catalog(false, defaultTo),
                    promptConfiguration: promptBag(promptUse),
                    promptModelConfiguration: promptBag(true),
                    toolsProvided: true
                });
                expect(decision.useNativeTools).toBe(false);
            }
        }
    });

    it('treats ABSENT capability as unsupported — unknown support is not support', () => {
        const decision = ResolveNativeToolCalling({
            catalogConfiguration: catalog(undefined, true),
            promptConfiguration: promptBag(true),
            promptModelConfiguration: null,
            toolsProvided: true
        });
        expect(decision.useNativeTools).toBe(false);
        expect(decision.warning).toBeDefined();
    });

    it('warns loudly enough to diagnose the misconfiguration', () => {
        const decision = ResolveNativeToolCalling({
            catalogConfiguration: catalog(false),
            promptConfiguration: promptBag(true),
            promptModelConfiguration: null,
            toolsProvided: true
        });
        expect(decision.warning).toContain('SupportsNativeToolCalling');
    });
});

describe('ResolveNativeToolCalling — tools must actually be supplied', () => {
    it('is a no-op when the gate is fully open but the caller passed no tools', () => {
        const decision = ResolveNativeToolCalling({
            catalogConfiguration: catalog(true, true),
            promptConfiguration: null,
            promptModelConfiguration: null,
            toolsProvided: false
        });
        expect(decision.useNativeTools).toBe(false);
        expect(decision.mode).toBe('Envelope');
    });

    it('does NOT warn about missing tools — a prompt may supply them only on some calls', () => {
        const decision = ResolveNativeToolCalling({
            catalogConfiguration: catalog(true, true),
            promptConfiguration: null,
            promptModelConfiguration: null,
            toolsProvided: false
        });
        expect(decision.warning).toBeUndefined();
    });
});

describe('ResolveNativeToolCalling — cascade semantics', () => {
    it('merges the prompt cascade per key, so a promptModel override keeps the prompt\'s other keys', () => {
        const decision = ResolveNativeToolCalling({
            catalogConfiguration: catalog(true),
            promptConfiguration: { LLM: { UseNativeToolCalling: true } },
            // A prompt-model bag that touches a DIFFERENT section must not wipe the prompt's LLM key.
            promptModelConfiguration: { Realtime: { TurnDetection: { Mode: 'serverVad' } } },
            toolsProvided: true
        });
        expect(decision.useNativeTools).toBe(true);
    });

    it('treats an explicit null preference as "no preference" and falls through to the model default', () => {
        const decision = ResolveNativeToolCalling({
            catalogConfiguration: catalog(true, true),
            promptConfiguration: promptBag(null),
            promptModelConfiguration: null,
            toolsProvided: true
        });
        expect(decision.useNativeTools).toBe(true);
    });

    it('tolerates every layer being absent', () => {
        const decision = ResolveNativeToolCalling({
            catalogConfiguration: null,
            promptConfiguration: null,
            promptModelConfiguration: null,
            toolsProvided: true
        });
        expect(decision.useNativeTools).toBe(false);
        expect(decision.mode).toBe('Envelope');
        expect(decision.warning).toBeUndefined();
    });
});

describe('tool-calling mode recording', () => {
    it('round-trips a mode through a request object', () => {
        const params = new ChatParams();
        RecordToolCallingMode(params, 'Native');
        expect(GetToolCallingMode(params)).toBe('Native');
    });

    it('keeps requests independent, so concurrent runs cannot cross-contaminate', () => {
        const a = new ChatParams();
        const b = new ChatParams();
        RecordToolCallingMode(a, 'Native');
        RecordToolCallingMode(b, 'Envelope');
        expect(GetToolCallingMode(a)).toBe('Native');
        expect(GetToolCallingMode(b)).toBe('Envelope');
    });

    it('returns undefined for an object nothing tagged, and for null', () => {
        expect(GetToolCallingMode(new ChatParams())).toBeUndefined();
        expect(GetToolCallingMode(null)).toBeUndefined();
        expect(GetToolCallingMode(undefined)).toBeUndefined();
    });

    it('lets a later write win, which is how a fallback overwrites the gated mode', () => {
        const result = new ChatResult(false, new Date(), new Date());
        RecordToolCallingMode(result, 'Native');
        RecordToolCallingMode(result, 'NativeFallback');
        expect(GetToolCallingMode(result)).toBe('NativeFallback');
    });

    it('accepts every value the column allows', () => {
        const modes: ToolCallingMode[] = ['Native', 'Envelope', 'NativeFallback'];
        for (const mode of modes) {
            const params = new ChatParams();
            RecordToolCallingMode(params, mode);
            expect(GetToolCallingMode(params)).toBe(mode);
        }
    });
});

describe('ResolveNativeToolCalling — control flow', () => {
    const open = { SupportsNativeToolCalling: true, DefaultToNativeToolCalling: true };

    it('resolves NativeImplicit when the catalog asks for implicit AND control tools were supplied', () => {
        const d = ResolveNativeToolCalling({
            catalogConfiguration: { LLM: { ...open, NativeControlFlow: 'implicit' } },
            promptConfiguration: null, promptModelConfiguration: null,
            toolsProvided: true, controlToolsProvided: true
        });
        expect(d).toMatchObject({ useNativeTools: true, controlFlow: 'implicit', mode: 'NativeImplicit' });
    });

    it('stays on the hybrid (Native, envelope control flow) when the catalog says nothing about control flow', () => {
        const d = ResolveNativeToolCalling({
            catalogConfiguration: { LLM: open },
            promptConfiguration: null, promptModelConfiguration: null,
            toolsProvided: true, controlToolsProvided: true
        });
        expect(d).toMatchObject({ useNativeTools: true, controlFlow: 'envelope', mode: 'Native' });
    });

    it('implicit wanted but no control tools supplied → hybrid, not implicit', () => {
        const d = ResolveNativeToolCalling({
            catalogConfiguration: { LLM: { ...open, NativeControlFlow: 'implicit' } },
            promptConfiguration: null, promptModelConfiguration: null,
            toolsProvided: true, controlToolsProvided: false
        });
        expect(d).toMatchObject({ controlFlow: 'envelope', mode: 'Native' });
    });

    it('an orchestrator with ONLY control tools goes native under implicit, and envelope under hybrid', () => {
        const base = { promptConfiguration: null, promptModelConfiguration: null, toolsProvided: false, controlToolsProvided: true };
        expect(ResolveNativeToolCalling({ ...base, catalogConfiguration: { LLM: { ...open, NativeControlFlow: 'implicit' } } }))
            .toMatchObject({ useNativeTools: true, mode: 'NativeImplicit' });
        expect(ResolveNativeToolCalling({ ...base, catalogConfiguration: { LLM: open } }))
            .toMatchObject({ useNativeTools: false, mode: 'Envelope' });
    });

    it('the envelope path always reports envelope control flow', () => {
        const d = ResolveNativeToolCalling({
            catalogConfiguration: { LLM: { SupportsNativeToolCalling: false, DefaultToNativeToolCalling: true, NativeControlFlow: 'implicit' } },
            promptConfiguration: null, promptModelConfiguration: null, toolsProvided: true, controlToolsProvided: true
        });
        expect(d).toMatchObject({ useNativeTools: false, controlFlow: 'envelope', mode: 'Envelope' });
    });
});

describe('ResolveNativeToolCalling — native tool results', () => {
    const open = { SupportsNativeToolCalling: true, DefaultToNativeToolCalling: true };
    it('toolResults is true only when native is on AND the catalog asks for it', () => {
        const base = { promptConfiguration: null, promptModelConfiguration: null, toolsProvided: true };
        expect(ResolveNativeToolCalling({ ...base, catalogConfiguration: { LLM: { ...open, NativeToolResults: true } } }).toolResults).toBe(true);
        expect(ResolveNativeToolCalling({ ...base, catalogConfiguration: { LLM: open } }).toolResults).toBe(false);
        expect(ResolveNativeToolCalling({ ...base, toolsProvided: false, catalogConfiguration: { LLM: { ...open, NativeToolResults: true } } }).toolResults).toBe(false);
    });
    it('records and reads back the whole decision, and the mode-only readers still work', () => {
        const target = new ChatParams();
        const d = { useNativeTools: true, mode: 'NativeImplicit' as const, controlFlow: 'implicit' as const, toolResults: true };
        RecordToolCallingDecision(target, d);
        expect(GetToolCallingDecision(target)).toEqual(d);
        expect(GetToolCallingMode(target)).toBe('NativeImplicit');
        RecordToolCallingMode(target, 'NativeFallback');
        expect(GetToolCallingDecision(target)).toMatchObject({ mode: 'NativeFallback', controlFlow: 'implicit', toolResults: true });
    });
});
