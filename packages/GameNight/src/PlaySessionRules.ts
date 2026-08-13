import type { BoardGameNightGameEntity, BoardGameNightPlaySessionEntity } from 'mj_generatedentities';

/**
 * The invariants a Board Game Night play session must satisfy.
 *
 * These are the same rules the Phase 5 integrity queries in `Demos/BoardGameNight/create-schema.sql`
 * assert *after* the fact. Encoding them here moves them from "a SELECT that tells you the data went
 * bad" to "a save that refuses to make it bad", and — because this module is pure — lets them be
 * exercised without a database.
 *
 * Deliberately NOT encoded: placement uniqueness. The seed data happens to have distinct placements
 * in competitive sessions, but nothing in the schema or the integrity checks asserts it, and ties are
 * legitimate in plenty of games. Inventing a rule the source of truth never claimed would reject
 * valid data.
 */

/**
 * Outcome union, derived from the generated entity rather than restated. `PlaySession.Outcome` is
 * constrained by `CK_BGN_PlaySession_Outcome`, so CodeGen regenerates this union whenever that CHECK
 * changes — and a hand-copied literal union would silently stop matching. See
 * `.claude/rules/typescript-style.md`.
 */
export type PlaySessionOutcome = BoardGameNightPlaySessionEntity['Outcome'];

/** Category union, derived from `CK_BGN_Game_Category` via the generated entity for the same reason. */
export type GameCategory = BoardGameNightGameEntity['Category'];

/**
 * The only facts about a participant the rules need. A structural type rather than the entity itself,
 * so the rules can be unit-tested with plain objects and reused against a projection from a view.
 */
export type ParticipantFacts = {
    readonly PlayerID: string;
    readonly Score: number | null;
    readonly Placement: number | null;
    readonly IsWinner: boolean;
};

/**
 * The only facts about the game the rules need. Supplied separately because `PlaySession` carries just
 * `GameID` — `Category`, `MinPlayers` and `MaxPlayers` live on `Game`, so any rule touching them
 * requires a load and therefore belongs in an async path.
 */
export type GameFacts = {
    readonly Name: string;
    readonly Category: GameCategory;
    readonly MinPlayers: number;
    readonly MaxPlayers: number;
};

/** Stable identifiers so callers can branch on a specific violation instead of matching message text. */
export type PlaySessionRuleCode =
    | 'SessionHasParticipants'
    | 'ParticipantCountWithinGameRange'
    | 'CompetitiveHasExactlyOneWinner'
    | 'TeamGameHasAtLeastOneWinner'
    | 'CooperativeHasNoIndividualResults'
    | 'CooperativeOutcomeIsShared'
    | 'AbandonedHasNoResults';

export type PlaySessionRuleViolation = {
    readonly Rule: PlaySessionRuleCode;
    readonly Message: string;
};

const COOPERATIVE_OUTCOMES: readonly string[] = ['Co-op Win', 'Co-op Loss'];

/** Cooperative sessions have a shared result, which is what makes `Score` legitimately nullable. */
export function IsCooperativeOutcome(outcome: PlaySessionOutcome): boolean {
    return COOPERATIVE_OUTCOMES.includes(outcome);
}

/**
 * Party games are scored by team, so several players share first place. This is the same exception the
 * integrity query in `create-schema.sql` carves out with `AND g.[Category] <> 'Party'`.
 *
 * Absent game facts this returns false, which keeps the stricter one-winner rule as the default —
 * a missing load should not silently relax an invariant.
 */
export function AllowsMultipleWinners(game?: GameFacts): boolean {
    return game?.Category === 'Party';
}

/**
 * Evaluates every rule that the supplied facts can support and returns all violations, rather than
 * failing on the first. A caller fixing three problems wants to see three problems.
 *
 * @param outcome      The session's outcome.
 * @param participants The session's participation rows.
 * @param game         The parent game. Omit it and the game-dependent rules are skipped; the rest
 *                     still run, so a caller without a loaded game is not left unvalidated.
 */
export function EvaluatePlaySessionRules(
    outcome: PlaySessionOutcome,
    participants: readonly ParticipantFacts[],
    game?: GameFacts,
): PlaySessionRuleViolation[] {
    const violations: PlaySessionRuleViolation[] = [];

    // Every rule below reads the participant set, so an empty session is reported once and returns
    // rather than producing a cascade of derived complaints about a session that simply isn't built yet.
    if (participants.length === 0) {
        violations.push({
            Rule: 'SessionHasParticipants',
            Message: 'A play session must have at least one participant.',
        });
        return violations;
    }

    if (game && (participants.length < game.MinPlayers || participants.length > game.MaxPlayers)) {
        violations.push({
            Rule: 'ParticipantCountWithinGameRange',
            Message:
                `${game.Name} supports ${game.MinPlayers}-${game.MaxPlayers} players, ` +
                `but this session has ${participants.length}.`,
        });
    }

    const winners = participants.filter((p) => p.IsWinner).length;
    const scored = participants.filter((p) => p.Score !== null).length;
    const placed = participants.filter((p) => p.Placement !== null).length;

    if (outcome === 'Completed') {
        if (AllowsMultipleWinners(game)) {
            if (winners < 1) {
                violations.push({
                    Rule: 'TeamGameHasAtLeastOneWinner',
                    Message: `A completed team game must have at least one winner, but none is marked.`,
                });
            }
        } else if (winners !== 1) {
            violations.push({
                Rule: 'CompetitiveHasExactlyOneWinner',
                Message: `A completed competitive session must have exactly one winner, but ${winners} are marked.`,
            });
        }
    } else if (IsCooperativeOutcome(outcome)) {
        if (scored > 0 || placed > 0) {
            violations.push({
                Rule: 'CooperativeHasNoIndividualResults',
                Message:
                    'Cooperative sessions have no individual scores or placements, but ' +
                    `${scored} participant(s) have a Score and ${placed} have a Placement.`,
            });
        }
        // 'Co-op Win' means everyone won; 'Co-op Loss' means everyone lost. A split is incoherent.
        const expectedIsWinner = outcome === 'Co-op Win';
        if (participants.some((p) => p.IsWinner !== expectedIsWinner)) {
            violations.push({
                Rule: 'CooperativeOutcomeIsShared',
                Message: `Every participant in a '${outcome}' session must have IsWinner = ${expectedIsWinner}.`,
            });
        }
    } else if (outcome === 'Abandoned') {
        if (scored > 0 || placed > 0 || winners > 0) {
            violations.push({
                Rule: 'AbandonedHasNoResults',
                Message: 'An abandoned session records no scores, placements, or winners.',
            });
        }
    }

    return violations;
}

/**
 * The share of sessions this participant count would win by chance alone — the baseline the
 * leaderboard in `create-schema.sql` measures lift against.
 *
 * Returns null for cooperative and abandoned outcomes, where "winning" is not a per-player event and
 * a baseline would be meaningless rather than merely uninteresting.
 */
export function ChanceBaselinePct(outcome: PlaySessionOutcome, participantCount: number): number | null {
    if (outcome !== 'Completed' || participantCount < 1) {
        return null;
    }
    return 100 / participantCount;
}
