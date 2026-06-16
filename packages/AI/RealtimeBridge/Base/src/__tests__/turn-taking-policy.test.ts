import { describe, it, expect } from 'vitest';
import {
    TurnTakingPolicy,
    RegexAddressedMatcher,
    IAddressedMatcher,
    IWorthSayingScorer,
    TurnTranscriptSegment,
} from '../turn-taking-policy';

/** A controllable clock for deterministic silence-window / throttle tests. */
function makeClock(start = 0): { now: () => number; advance: (ms: number) => void; set: (ms: number) => void } {
    let t = start;
    return {
        now: () => t,
        advance: (ms: number) => { t += ms; },
        set: (ms: number) => { t = ms; },
    };
}

/** A scorer that always returns a fixed value. */
function fixedScorer(score: number): IWorthSayingScorer {
    return { Score: () => score };
}

/** A matcher that returns a fixed verdict, capturing the last segment it saw. */
function fixedMatcher(addressed: boolean): IAddressedMatcher & { last?: TurnTranscriptSegment } {
    const m: IAddressedMatcher & { last?: TurnTranscriptSegment } = {
        IsAddressed(seg) { m.last = seg; return addressed; },
    };
    return m;
}

describe('RegexAddressedMatcher', () => {
    it('matches the agent name as a whole word, case-insensitively', () => {
        const m = new RegexAddressedMatcher(['Sage']);
        expect(m.IsAddressed({ Text: 'Hey sage, what do you think?' })).toBe(true);
        expect(m.IsAddressed({ Text: 'SAGE help me' })).toBe(true);
    });

    it('does not match a substring within another word', () => {
        const m = new RegexAddressedMatcher(['Sage']);
        expect(m.IsAddressed({ Text: 'the sagebrush is dry' })).toBe(false);
    });

    it('matches any of several aliases', () => {
        const m = new RegexAddressedMatcher(['Sage', 'the assistant']);
        expect(m.IsAddressed({ Text: 'can the assistant summarize?' })).toBe(true);
    });

    it('never treats agent-spoken segments as addressing the agent', () => {
        const m = new RegexAddressedMatcher(['Sage']);
        expect(m.IsAddressed({ Text: 'This is Sage speaking', IsAgent: true })).toBe(false);
    });

    it('ignores empty / blank names', () => {
        const m = new RegexAddressedMatcher(['', '   ']);
        expect(m.IsAddressed({ Text: 'anything at all' })).toBe(false);
    });

    it('escapes regex-special characters in names (treats them literally, not as regex)', () => {
        // A name containing a regex metachar must be matched literally — 'a.b' should NOT
        // match 'axb' (which it would if '.' were left as a regex wildcard).
        const m = new RegexAddressedMatcher(['a.b']);
        expect(m.IsAddressed({ Text: 'ask a.b about it' })).toBe(true);
        expect(m.IsAddressed({ Text: 'ask axb about it' })).toBe(false);
    });

    it('handles empty text safely', () => {
        const m = new RegexAddressedMatcher(['Sage']);
        expect(m.IsAddressed({ Text: '' })).toBe(false);
    });
});

describe('TurnTakingPolicy — Passive', () => {
    it('speaks when addressed', () => {
        const policy = new TurnTakingPolicy({ Mode: 'Passive', Matcher: fixedMatcher(true) });
        const d = policy.EvaluateTurn({ Segment: { Text: 'Sage, help' } });
        expect(d.Action).toBe('Speak');
    });

    it('stays silent when not addressed', () => {
        const policy = new TurnTakingPolicy({ Mode: 'Passive', Matcher: fixedMatcher(false) });
        const d = policy.EvaluateTurn({ Segment: { Text: 'just chatting' } });
        expect(d.Action).toBe('Silent');
    });

    it('stays silent when no matcher configured', () => {
        const policy = new TurnTakingPolicy({ Mode: 'Passive' });
        const d = policy.EvaluateTurn({ Segment: { Text: 'Sage, help' } });
        expect(d.Action).toBe('Silent');
    });

    it('exposes its Mode', () => {
        const policy = new TurnTakingPolicy({ Mode: 'Passive' });
        expect(policy.Mode).toBe('Passive');
    });

    it('uses the real regex matcher end-to-end', () => {
        const policy = new TurnTakingPolicy({ Mode: 'Passive', Matcher: new RegexAddressedMatcher(['Sage']) });
        expect(policy.EvaluateTurn({ Segment: { Text: 'Hey Sage' } }).Action).toBe('Speak');
        expect(policy.EvaluateTurn({ Segment: { Text: 'no name here' } }).Action).toBe('Silent');
    });
});

describe('TurnTakingPolicy — Active', () => {
    it('speaks in a silence window when score clears the threshold', () => {
        const clock = makeClock(10000);
        const policy = new TurnTakingPolicy({
            Mode: 'Active',
            Scorer: fixedScorer(0.9),
            SilenceWindowMs: 1500,
            ScoreThreshold: 0.7,
            Now: clock.now,
        });
        // segment ended 2000ms ago -> silence window elapsed
        const d = policy.EvaluateTurn({ Segment: { Text: 'silence', EndMs: 8000 } });
        expect(d.Action).toBe('Speak');
    });

    it('stays silent when a human is speaking (never barges in)', () => {
        const clock = makeClock(10000);
        const policy = new TurnTakingPolicy({ Mode: 'Active', Scorer: fixedScorer(1), Now: clock.now });
        const d = policy.EvaluateTurn({ Segment: { Text: 'x', EndMs: 0 }, HumanSpeaking: true });
        expect(d.Action).toBe('Silent');
        expect(d.Reason).toContain('human');
    });

    it('stays silent when the silence window has not elapsed', () => {
        const clock = makeClock(10000);
        const policy = new TurnTakingPolicy({
            Mode: 'Active',
            Scorer: fixedScorer(1),
            SilenceWindowMs: 1500,
            Now: clock.now,
        });
        // segment ended 500ms ago -> still too soon
        const d = policy.EvaluateTurn({ Segment: { Text: 'x', EndMs: 9500 } });
        expect(d.Action).toBe('Silent');
        expect(d.Reason).toContain('Silence window');
    });

    it('stays silent when score is below the threshold', () => {
        const clock = makeClock(10000);
        const policy = new TurnTakingPolicy({
            Mode: 'Active',
            Scorer: fixedScorer(0.3),
            SilenceWindowMs: 1000,
            ScoreThreshold: 0.7,
            Now: clock.now,
        });
        const d = policy.EvaluateTurn({ Segment: { Text: 'x', EndMs: 0 } });
        expect(d.Action).toBe('Silent');
        expect(d.Reason).toContain('Not worth saying');
    });

    it('throttles a second speak within the throttle window', () => {
        const clock = makeClock(10000);
        const policy = new TurnTakingPolicy({
            Mode: 'Active',
            Scorer: fixedScorer(1),
            SilenceWindowMs: 0,
            ThrottleMs: 15000,
            Now: clock.now,
        });
        expect(policy.EvaluateTurn({ Segment: { Text: 'a', EndMs: 10000 } }).Action).toBe('Speak');
        // 5s later — still within the 15s throttle window
        clock.advance(5000);
        const d = policy.EvaluateTurn({ Segment: { Text: 'b', EndMs: clock.now() } });
        expect(d.Action).toBe('Silent');
        expect(d.Reason).toContain('Throttled');
    });

    it('allows speaking again once the throttle window passes', () => {
        const clock = makeClock(10000);
        const policy = new TurnTakingPolicy({
            Mode: 'Active',
            Scorer: fixedScorer(1),
            SilenceWindowMs: 0,
            ThrottleMs: 15000,
            Now: clock.now,
        });
        expect(policy.EvaluateTurn({ Segment: { Text: 'a', EndMs: 10000 } }).Action).toBe('Speak');
        clock.advance(16000); // past the throttle window
        const d = policy.EvaluateTurn({ Segment: { Text: 'b', EndMs: clock.now() } });
        expect(d.Action).toBe('Speak');
    });

    it('treats a missing EndMs as no measurable silence (stays silent)', () => {
        const clock = makeClock(10000);
        const policy = new TurnTakingPolicy({
            Mode: 'Active',
            Scorer: fixedScorer(1),
            SilenceWindowMs: 1500,
            Now: clock.now,
        });
        // No EndMs -> end defaults to now -> elapsed silence = 0 < 1500
        const d = policy.EvaluateTurn({ Segment: { Text: 'x' } });
        expect(d.Action).toBe('Silent');
    });

    it('scores 0 (silent) when no scorer is configured', () => {
        const clock = makeClock(10000);
        const policy = new TurnTakingPolicy({ Mode: 'Active', SilenceWindowMs: 0, Now: clock.now });
        const d = policy.EvaluateTurn({ Segment: { Text: 'x', EndMs: 10000 } });
        expect(d.Action).toBe('Silent');
    });
});

describe('TurnTakingPolicy — Hybrid', () => {
    it('speaks when addressed (regardless of chat)', () => {
        const policy = new TurnTakingPolicy({
            Mode: 'Hybrid',
            Matcher: fixedMatcher(true),
            Scorer: fixedScorer(1),
        });
        const d = policy.EvaluateTurn({ Segment: { Text: 'Sage!' }, ChatAvailable: true });
        expect(d.Action).toBe('Speak');
    });

    it('posts to chat when not addressed but has something and chat is available', () => {
        const policy = new TurnTakingPolicy({
            Mode: 'Hybrid',
            Matcher: fixedMatcher(false),
            Scorer: fixedScorer(0.9),
            ScoreThreshold: 0.7,
        });
        const d = policy.EvaluateTurn({ Segment: { Text: 'relevant point' }, ChatAvailable: true });
        expect(d.Action).toBe('PostToChat');
    });

    it('degrades to silent (plain passive) when chat is unavailable', () => {
        const policy = new TurnTakingPolicy({
            Mode: 'Hybrid',
            Matcher: fixedMatcher(false),
            Scorer: fixedScorer(0.9),
        });
        const d = policy.EvaluateTurn({ Segment: { Text: 'relevant point' }, ChatAvailable: false });
        expect(d.Action).toBe('Silent');
    });

    it('stays silent when not addressed and score is below threshold', () => {
        const policy = new TurnTakingPolicy({
            Mode: 'Hybrid',
            Matcher: fixedMatcher(false),
            Scorer: fixedScorer(0.2),
            ScoreThreshold: 0.7,
        });
        const d = policy.EvaluateTurn({ Segment: { Text: 'meh' }, ChatAvailable: true });
        expect(d.Action).toBe('Silent');
    });

    it('does not post to chat when no scorer is configured', () => {
        const policy = new TurnTakingPolicy({ Mode: 'Hybrid', Matcher: fixedMatcher(false) });
        const d = policy.EvaluateTurn({ Segment: { Text: 'x' }, ChatAvailable: true });
        expect(d.Action).toBe('Silent');
    });
});

describe('TurnTakingPolicy — defaults', () => {
    it('defaults the clock to Date.now when not injected (smoke)', () => {
        // Passive needs no clock; just confirm construction + evaluation works without Now.
        const policy = new TurnTakingPolicy({ Mode: 'Passive', Matcher: new RegexAddressedMatcher(['Sage']) });
        expect(policy.EvaluateTurn({ Segment: { Text: 'Sage' } }).Action).toBe('Speak');
    });
});
