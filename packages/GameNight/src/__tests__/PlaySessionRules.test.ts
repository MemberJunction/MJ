import { describe, expect, it } from 'vitest';
import {
    AllowsMultipleWinners,
    ChanceBaselinePct,
    EvaluatePlaySessionRules,
    GameFacts,
    IsCooperativeOutcome,
    ParticipantFacts,
    PlaySessionRuleCode,
} from '../PlaySessionRules.js';

/** Terse participant builder — `w` marks the winner, score/placement default to a competitive shape. */
function p(
    id: string,
    opts: { score?: number | null; placement?: number | null; w?: boolean } = {},
): ParticipantFacts {
    return {
        PlayerID: id,
        Score: opts.score === undefined ? 10 : opts.score,
        Placement: opts.placement === undefined ? 1 : opts.placement,
        IsWinner: opts.w ?? false,
    };
}

/** A cooperative participation row: no individual result, shared win flag. */
function coop(id: string, isWinner: boolean): ParticipantFacts {
    return { PlayerID: id, Score: null, Placement: null, IsWinner: isWinner };
}

const WINGSPAN: GameFacts = { Name: 'Wingspan', Category: 'Strategy', MinPlayers: 1, MaxPlayers: 5 };
const CODENAMES: GameFacts = { Name: 'Codenames', Category: 'Party', MinPlayers: 2, MaxPlayers: 8 };
const PATCHWORK: GameFacts = { Name: 'Patchwork', Category: 'Abstract', MinPlayers: 2, MaxPlayers: 2 };
const POKER: GameFacts = { Name: 'Poker', Category: 'Strategy', MinPlayers: 2, MaxPlayers: 10 };

const codes = (v: { Rule: PlaySessionRuleCode }[]): PlaySessionRuleCode[] => v.map((x) => x.Rule);

describe('EvaluatePlaySessionRules', () => {
    describe('participant set', () => {
        it('reports an empty session once and stops, rather than cascading', () => {
            const v = EvaluatePlaySessionRules('Completed', [], WINGSPAN);
            expect(codes(v)).toEqual(['SessionHasParticipants']);
        });
    });

    describe('competitive sessions', () => {
        it('accepts exactly one winner', () => {
            const v = EvaluatePlaySessionRules(
                'Completed',
                [p('a', { w: true, placement: 1 }), p('b', { placement: 2 }), p('c', { placement: 3 })],
                WINGSPAN,
            );
            expect(v).toEqual([]);
        });

        it('rejects two winners', () => {
            const v = EvaluatePlaySessionRules(
                'Completed',
                [p('a', { w: true }), p('b', { w: true }), p('c')],
                WINGSPAN,
            );
            expect(codes(v)).toContain('CompetitiveHasExactlyOneWinner');
            expect(v[0].Message).toContain('2 are marked');
        });

        it('rejects zero winners', () => {
            const v = EvaluatePlaySessionRules('Completed', [p('a'), p('b')], WINGSPAN);
            expect(codes(v)).toContain('CompetitiveHasExactlyOneWinner');
        });

        it('stays strict when game facts are absent, so a missing load cannot relax the rule', () => {
            const v = EvaluatePlaySessionRules('Completed', [p('a', { w: true }), p('b', { w: true })]);
            expect(codes(v)).toContain('CompetitiveHasExactlyOneWinner');
        });
    });

    describe('team (Party) games', () => {
        it('allows several winners on one team', () => {
            const v = EvaluatePlaySessionRules(
                'Completed',
                [
                    p('a', { score: 1, placement: 1, w: true }),
                    p('b', { score: 1, placement: 1, w: true }),
                    p('c', { score: 1, placement: 1, w: true }),
                    p('d', { score: 0, placement: 2 }),
                    p('e', { score: 0, placement: 2 }),
                    p('f', { score: 0, placement: 2 }),
                ],
                CODENAMES,
            );
            expect(v).toEqual([]);
        });

        it('still requires at least one winner', () => {
            const v = EvaluatePlaySessionRules(
                'Completed',
                [p('a', { score: 0, placement: 2 }), p('b', { score: 0, placement: 2 })],
                CODENAMES,
            );
            expect(codes(v)).toEqual(['TeamGameHasAtLeastOneWinner']);
        });
    });

    describe('cooperative sessions', () => {
        it('accepts a shared win with no individual results', () => {
            const v = EvaluatePlaySessionRules(
                'Co-op Win',
                [coop('a', true), coop('b', true), coop('c', true)],
                undefined,
            );
            expect(v).toEqual([]);
        });

        it('accepts a shared loss', () => {
            const v = EvaluatePlaySessionRules('Co-op Loss', [coop('a', false), coop('b', false)]);
            expect(v).toEqual([]);
        });

        it('rejects individual scores or placements', () => {
            const v = EvaluatePlaySessionRules('Co-op Win', [
                { PlayerID: 'a', Score: 55, Placement: null, IsWinner: true },
                coop('b', true),
            ]);
            expect(codes(v)).toContain('CooperativeHasNoIndividualResults');
        });

        it('rejects a split outcome on a win', () => {
            const v = EvaluatePlaySessionRules('Co-op Win', [coop('a', true), coop('b', false)]);
            expect(codes(v)).toContain('CooperativeOutcomeIsShared');
        });

        it('rejects winners on a loss', () => {
            const v = EvaluatePlaySessionRules('Co-op Loss', [coop('a', true), coop('b', false)]);
            expect(codes(v)).toContain('CooperativeOutcomeIsShared');
        });
    });

    describe('abandoned sessions', () => {
        it('accepts no results at all', () => {
            const v = EvaluatePlaySessionRules('Abandoned', [coop('a', false), coop('b', false)]);
            expect(v).toEqual([]);
        });

        it('rejects a recorded winner', () => {
            const v = EvaluatePlaySessionRules('Abandoned', [coop('a', true), coop('b', false)]);
            expect(codes(v)).toContain('AbandonedHasNoResults');
        });

        it('rejects recorded scores', () => {
            const v = EvaluatePlaySessionRules('Abandoned', [
                { PlayerID: 'a', Score: 12, Placement: null, IsWinner: false },
            ]);
            expect(codes(v)).toContain('AbandonedHasNoResults');
        });
    });

    describe('participant count vs the game range', () => {
        it('rejects too few players', () => {
            const v = EvaluatePlaySessionRules('Completed', [p('a', { w: true })], PATCHWORK);
            expect(codes(v)).toContain('ParticipantCountWithinGameRange');
            expect(v[0].Message).toContain('Patchwork supports 2-2 players');
        });

        it('rejects too many players', () => {
            const v = EvaluatePlaySessionRules(
                'Completed',
                [p('a', { w: true }), p('b'), p('c')],
                PATCHWORK,
            );
            expect(codes(v)).toContain('ParticipantCountWithinGameRange');
        });

        it('is skipped entirely when game facts are absent', () => {
            const v = EvaluatePlaySessionRules('Completed', [p('a', { w: true })]);
            expect(codes(v)).not.toContain('ParticipantCountWithinGameRange');
        });
    });

    it('reports every violation at once rather than failing on the first', () => {
        // 3 players at a 2-player game, and nobody marked as the winner.
        const v = EvaluatePlaySessionRules('Completed', [p('a'), p('b'), p('c')], PATCHWORK);
        expect(codes(v)).toEqual(['ParticipantCountWithinGameRange', 'CompetitiveHasExactlyOneWinner']);
    });

    // The two integrity queries in create-schema.sql return 0 rows against the shipped seed data.
    // These shapes are lifted from it, so if the rules ever disagree with the demo data, this fails.
    describe('agrees with the shipped seed data', () => {
        it('S01 Wingspan — 4p competitive, one winner', () => {
            expect(
                EvaluatePlaySessionRules(
                    'Completed',
                    [
                        p('cait', { score: 78, placement: 4 }),
                        p('mars', { score: 91, placement: 2 }),
                        p('pree', { score: 84, placement: 3 }),
                        p('han', { score: 95, placement: 1, w: true }),
                    ],
                    WINGSPAN,
                ),
            ).toEqual([]);
        });

        it('S03 Pandemic — 4p co-op loss', () => {
            expect(
                EvaluatePlaySessionRules('Co-op Loss', [
                    coop('cait', false),
                    coop('mars', false),
                    coop('dee', false),
                    coop('ada', false),
                ]),
            ).toEqual([]);
        });

        it('S24 Root — 4p abandoned, nothing recorded', () => {
            expect(
                EvaluatePlaySessionRules('Abandoned', [
                    coop('cait', false),
                    coop('mars', false),
                    coop('han', false),
                    coop('jo', false),
                ]),
            ).toEqual([]);
        });

        it('S25 Poker — 6p heads-up-style competitive, one winner', () => {
            expect(
                EvaluatePlaySessionRules(
                    'Completed',
                    [
                        p('a', { score: 240, placement: 1, w: true }),
                        p('b', { score: 150, placement: 2 }),
                        p('c', { score: 110, placement: 3 }),
                        p('d', { score: 60, placement: 4 }),
                        p('e', { score: 40, placement: 5 }),
                        p('f', { score: 0, placement: 6 }),
                    ],
                    POKER,
                ),
            ).toEqual([]);
        });
    });
});

describe('helpers', () => {
    it('IsCooperativeOutcome covers both co-op outcomes only', () => {
        expect(IsCooperativeOutcome('Co-op Win')).toBe(true);
        expect(IsCooperativeOutcome('Co-op Loss')).toBe(true);
        expect(IsCooperativeOutcome('Completed')).toBe(false);
        expect(IsCooperativeOutcome('Abandoned')).toBe(false);
    });

    it('AllowsMultipleWinners is Party-only and defaults closed', () => {
        expect(AllowsMultipleWinners(CODENAMES)).toBe(true);
        expect(AllowsMultipleWinners(WINGSPAN)).toBe(false);
        expect(AllowsMultipleWinners(undefined)).toBe(false);
    });

    describe('ChanceBaselinePct', () => {
        it('is 1/N for competitive sessions', () => {
            expect(ChanceBaselinePct('Completed', 6)).toBeCloseTo(16.667, 2);
            expect(ChanceBaselinePct('Completed', 2)).toBe(50);
        });

        it('is null where winning is not a per-player event', () => {
            expect(ChanceBaselinePct('Co-op Win', 4)).toBeNull();
            expect(ChanceBaselinePct('Abandoned', 4)).toBeNull();
        });

        it('is null for a degenerate count rather than dividing by zero', () => {
            expect(ChanceBaselinePct('Completed', 0)).toBeNull();
        });
    });
});
