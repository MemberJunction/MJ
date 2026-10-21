import { describe, it, expect } from 'vitest';
import {
    TurnTakingPolicy,
    ModelSideAddressedMatcher,
    BuildAddressedMatcher,
    ResolveAddressingMode,
    IsBackchannel,
    BACKCHANNEL_MAX_DURATION_MS,
    BACKCHANNEL_MAX_WORDS,
    MODEL_ADDRESSED_SIGNAL_WINDOW_MS,
} from '../turn-taking-policy';

/** A controllable clock. */
function makeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
    let t = start;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('ResolveAddressingMode', () => {
    it('defaults to model-side when the model is full-duplex', () => {
        expect(ResolveAddressingMode(undefined, true)).toBe('ModelSide');
        expect(ResolveAddressingMode('Auto', true)).toBe('ModelSide');
        expect(ResolveAddressingMode('ModelSide', true)).toBe('ModelSide');
    });

    it('honours an explicit Regex request even on a full-duplex model', () => {
        expect(ResolveAddressingMode('Regex', true)).toBe('Regex');
    });

    it('falls back to Regex when the model cannot judge addressing itself, whatever was asked', () => {
        expect(ResolveAddressingMode(undefined, false)).toBe('Regex');
        expect(ResolveAddressingMode('Auto', false)).toBe('Regex');
        expect(ResolveAddressingMode('ModelSide', false)).toBe('Regex');
    });
});

describe('ModelSideAddressedMatcher', () => {
    it('is not addressed until the model signals', () => {
        const m = new ModelSideAddressedMatcher();
        expect(m.IsAddressed({ Text: 'anything at all' })).toBe(false);
    });

    it('is addressed once the model signals, and the signal is consumed by the first read', () => {
        const m = new ModelSideAddressedMatcher();
        m.NoteModelAddressed();
        expect(m.HasPendingSignal).toBe(true);
        expect(m.IsAddressed({ Text: 'what do you think?' })).toBe(true);
        expect(m.IsAddressed({ Text: 'and again?' })).toBe(false);
    });

    it('lets a signal expire so a stale one cannot address the agent for a later segment', () => {
        const clock = makeClock(1000);
        const m = new ModelSideAddressedMatcher(MODEL_ADDRESSED_SIGNAL_WINDOW_MS, clock.now);
        m.NoteModelAddressed();
        clock.advance(MODEL_ADDRESSED_SIGNAL_WINDOW_MS + 1);
        expect(m.HasPendingSignal).toBe(false);
        expect(m.IsAddressed({ Text: 'much later' })).toBe(false);
    });

    it('never treats an agent-spoken segment as addressing (no self-trigger loop) and keeps the signal for a human one', () => {
        const m = new ModelSideAddressedMatcher();
        m.NoteModelAddressed();
        expect(m.IsAddressed({ Text: 'I am an agent', IsAgent: true })).toBe(false);
        expect(m.IsAddressed({ Text: 'a person' })).toBe(true);
    });

    it('drives the policy: Passive speaks only after the model signalled', () => {
        const m = new ModelSideAddressedMatcher();
        const policy = new TurnTakingPolicy({ Mode: 'Passive', Matcher: m });
        expect(policy.EvaluateTurn({ Segment: { Text: 'hello room' } }).Action).toBe('Silent');
        m.NoteModelAddressed();
        expect(policy.EvaluateTurn({ Segment: { Text: 'hello room' } }).Action).toBe('Speak');
    });
});

describe('BuildAddressedMatcher', () => {
    it('builds the model-side matcher (and exposes it) for a full-duplex model by default', () => {
        const built = BuildAddressedMatcher(['Sage'], undefined, true);
        expect(built.Mode).toBe('ModelSide');
        expect(built.ModelSide).toBeInstanceOf(ModelSideAddressedMatcher);
        expect(built.Matcher).toBe(built.ModelSide);
    });

    it('builds the name matcher for a model without the capability', () => {
        const built = BuildAddressedMatcher(['Sage'], 'Auto', false);
        expect(built.Mode).toBe('Regex');
        expect(built.ModelSide).toBeUndefined();
        expect(built.Matcher.IsAddressed({ Text: 'hey sage' })).toBe(true);
        expect(built.Matcher.IsAddressed({ Text: 'hey someone' })).toBe(false);
    });

    it('threads the injected clock into the model-side freshness window', () => {
        const clock = makeClock(0);
        const built = BuildAddressedMatcher(['Sage'], 'ModelSide', true, clock.now);
        built.ModelSide!.NoteModelAddressed();
        clock.advance(MODEL_ADDRESSED_SIGNAL_WINDOW_MS + 1);
        expect(built.Matcher.IsAddressed({ Text: 'late' })).toBe(false);
    });
});

describe('IsBackchannel', () => {
    it('treats short acknowledgements as backchannels', () => {
        expect(IsBackchannel({ Text: 'mm-hm' })).toBe(true);
        expect(IsBackchannel({ Text: 'Right, got it', DurationMs: 900 })).toBe(true);
        expect(IsBackchannel({ DurationMs: BACKCHANNEL_MAX_DURATION_MS })).toBe(true);
    });

    it('treats anything over the duration bound as a turn', () => {
        expect(IsBackchannel({ Text: 'yeah', DurationMs: BACKCHANNEL_MAX_DURATION_MS + 1 })).toBe(false);
        expect(IsBackchannel({ DurationMs: 4000 })).toBe(false);
    });

    it('treats anything over the word bound as a turn', () => {
        const words = Array.from({ length: BACKCHANNEL_MAX_WORDS + 1 }, () => 'word').join(' ');
        expect(IsBackchannel({ Text: words })).toBe(false);
    });

    it('treats a question as a turn however short, because it asks for a reply', () => {
        expect(IsBackchannel({ Text: 'Right?', DurationMs: 400 })).toBe(false);
    });

    it('cannot classify an utterance with no information, so it is a turn', () => {
        expect(IsBackchannel({})).toBe(false);
        expect(IsBackchannel({ Text: '   ' })).toBe(false);
    });
});
