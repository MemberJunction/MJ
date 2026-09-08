/**
 * Unit tests for `ResolveResponseDoneUsage` — the shared reader that pulls the usage payload out of
 * an OpenAI-protocol `response.done` frame.
 *
 * The two providers disagree on WHERE usage lives, and the disagreement is not cosmetic: it silently
 * cost every Grok Voice session its token accounting. Both wire shapes below are copied from live
 * captures, so this file is the executable record of what each provider actually sends.
 */
import { describe, it, expect } from 'vitest';
import { ResolveResponseDoneUsage, RealtimeResponseDoneFrame } from '../generic/realtimeUsage';

/** Captured off `wss://api.openai.com` — usage NESTED, no top-level key. */
const OPENAI_FRAME = {
    response: {
        id: 'resp_openai_1',
        status: 'completed',
        usage: {
            total_tokens: 27,
            input_tokens: 17,
            output_tokens: 10,
            input_token_details: { text_tokens: 17, audio_tokens: 0 },
            output_token_details: { text_tokens: 4, audio_tokens: 6 },
        },
    },
} as unknown as RealtimeResponseDoneFrame;

/** Captured off `wss://api.x.ai/v1/realtime` — usage TOP-LEVEL, nested slot present but EMPTY. */
const XAI_FRAME = {
    response: { id: 'resp_xai_1', status: 'completed', usage: {} },
    usage: {
        input_tokens: 6,
        input_token_details: { text_tokens: 6, audio_tokens: 0, grok_tokens: 0 },
        output_tokens: 87,
        output_token_details: { text_tokens: 7, audio_tokens: 80, grok_tokens: 0 },
        total_tokens: 93,
        output_audio_seconds: 1.5895,
        billable_audio_seconds: 1,
    },
} as unknown as RealtimeResponseDoneFrame;

describe('ResolveResponseDoneUsage', () => {
    it('reads the NESTED payload for OpenAI-shaped frames', () => {
        const usage = ResolveResponseDoneUsage(OPENAI_FRAME);
        expect(usage?.input_tokens).toBe(17);
        expect(usage?.output_tokens).toBe(10);
    });

    it('reads the TOP-LEVEL payload for xAI-shaped frames, where the nested slot is empty', () => {
        const usage = ResolveResponseDoneUsage(XAI_FRAME);
        expect(usage?.input_tokens).toBe(6);
        expect(usage?.output_tokens).toBe(87);
    });

    it('preserves the per-modality detail the caller needs for cost attribution', () => {
        // Audio and text bill at very different rates — the totals alone force a wrong blended rate.
        expect(ResolveResponseDoneUsage(XAI_FRAME)).toMatchObject({
            output_token_details: { text_tokens: 7, audio_tokens: 80, grok_tokens: 0 },
            output_audio_seconds: 1.5895,
            billable_audio_seconds: 1,
        });
    });

    it('treats an EMPTY nested object as "no usage" rather than as a payload', () => {
        // The whole defect in one assertion: `{}` is truthy, so a plain `if (!usage)` guard passes
        // it through and emits an all-undefined delta that downstream clamps to zero and drops.
        expect(ResolveResponseDoneUsage({ response: { usage: {} } })).toBeUndefined();
    });

    it('returns undefined when neither slot carries token counts', () => {
        expect(ResolveResponseDoneUsage({})).toBeUndefined();
        expect(ResolveResponseDoneUsage({ response: {} })).toBeUndefined();
        expect(ResolveResponseDoneUsage({ response: { usage: {} }, usage: {} })).toBeUndefined();
        // Present-but-wrong-typed counts are not counts.
        expect(ResolveResponseDoneUsage({ usage: { input_tokens: '6' as unknown as number } })).toBeUndefined();
    });

    it('prefers the nested payload when BOTH carry counts', () => {
        // Forward-compatibility: if xAI ever populates the nested slot too, nothing has to change.
        const both = {
            response: { usage: { input_tokens: 1, output_tokens: 2 } },
            usage: { input_tokens: 99, output_tokens: 99 },
        } as unknown as RealtimeResponseDoneFrame;
        expect(ResolveResponseDoneUsage(both)).toMatchObject({ input_tokens: 1, output_tokens: 2 });
    });

    it('accepts a payload carrying only ONE of the two counts', () => {
        expect(ResolveResponseDoneUsage({ usage: { output_tokens: 5 } })?.output_tokens).toBe(5);
        expect(ResolveResponseDoneUsage({ response: { usage: { input_tokens: 5 } } })?.input_tokens).toBe(5);
    });

    it('accepts explicit zeros — a real, reportable count', () => {
        // Zero tokens is meaningful (e.g. a cancelled turn that still billed nothing); it must not
        // be confused with "absent".
        expect(ResolveResponseDoneUsage({ usage: { input_tokens: 0, output_tokens: 0 } })).toEqual({
            input_tokens: 0,
            output_tokens: 0,
        });
    });
});
