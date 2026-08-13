import { BaseEntity, IMetadataProvider, RunView } from '@memberjunction/core';
import { RegisterClass, ValidationErrorInfo, ValidationResult } from '@memberjunction/global';
import {
    BoardGameNightPlaySessionEntity,
    BoardGameNightPlaySessionPlayerEntity,
} from 'mj_generatedentities';
import { GameNightMetadataEngine } from './GameNightMetadataEngine.js';
import {
    ChanceBaselinePct,
    EvaluatePlaySessionRules,
    GameFacts,
    IsCooperativeOutcome,
    ParticipantFacts,
    PlaySessionRuleViolation,
} from './PlaySessionRules.js';

/**
 * Custom `Play Sessions` entity — the Board Game Night business logic, encapsulated.
 *
 * Registered against the same key as the generated class. `ClassFactory` priority auto-increments by
 * load order, so this wins simply by being loaded after `mj_generatedentities` — no priority number to
 * keep in sync. Nothing here edits generated code; the generated class is extended.
 *
 * Why the rules live in `ValidateAsync` and not `Validate`: every interesting invariant spans records.
 * `PlaySession` carries only `GameID`, so `Category` / `MinPlayers` / `MaxPlayers` need a load, and the
 * participation rows need one too. `Validate()` is synchronous and cannot do either. `ValidateAsync()`
 * is awaited by `Save()` and exists for exactly this case.
 *
 * The framework skips async validation by default *unless* a subclass overrides `ValidateAsync` — it
 * detects the override via `IsMemberOverridden`. That auto-detection is what makes this enforced
 * rather than decorative; see the note in `BaseEntity` about an order that confirmed with no lines
 * because the flag defaulted the other way.
 */
@RegisterClass(BaseEntity, 'Play Sessions')
export class GameNightPlaySessionEntity extends BoardGameNightPlaySessionEntity {
    /**
     * The session's participation rows, loading and persisting as one unit with the session.
     *
     * `Load: 'explicit'` because a session list should not fan out into N participant queries;
     * `OnRemove: 'delete'` because a participation row has no meaning without its session — it is not
     * an orphan, it is garbage. Declared here rather than in `EntityRelationship.RelatedRecordCollection`
     * only because this subclass exists anyway; the metadata route is preferable when you want the
     * collection on the *generated* class for both tiers.
     */
    public readonly Participants = this.DeclareRelatedRecords<BoardGameNightPlaySessionPlayerEntity>({
        Name: 'Participants',
        RelatedEntity: 'Play Session Players',
        RelatedEntityJoinField: 'PlaySessionID',
        OrderBy: 'Placement ASC',
        Load: 'explicit',
        Source: 'database',
        OnRemove: 'delete',
        ReadOnly: false,
    });

    /** Cooperative sessions share one outcome, which is why Score and Placement are nullable. */
    public get IsCooperative(): boolean {
        return IsCooperativeOutcome(this.Outcome);
    }

    /** A competitive session — exactly one winner, individual scores and placements. */
    public get IsCompetitive(): boolean {
        return this.Outcome === 'Completed';
    }

    /**
     * Win share attributable to chance for this table size, or null when the participants have not been
     * loaded (so callers cannot mistake "not loaded" for "no baseline"). This is the same figure the
     * leaderboard's `ChancePct` column computes in SQL — defined once, here.
     */
    public get ChanceBaselinePct(): number | null {
        if (!this.Participants.IsLoaded) {
            return null;
        }
        return ChanceBaselinePct(this.Outcome, this.Participants.Items.length);
    }

    /**
     * Runs the session rules without saving — for a form that wants to warn before the user commits,
     * an Action validating an agent's proposal, or a batch audit.
     *
     * Public because pre-flighting is a legitimate need and the alternative is callers re-deriving
     * these rules; that duplication is how the UI and an agent end up disagreeing about what is valid.
     */
    public async CheckRulesAsync(): Promise<PlaySessionRuleViolation[]> {
        const participants = await this.participantFactsAsync();
        const game = await this.gameFactsAsync();
        return EvaluatePlaySessionRules(this.Outcome, participants, game);
    }

    /**
     * Cross-record invariants, enforced on every save.
     *
     * Chains `super.ValidateAsync()` first so field-level and companion results are preserved — a
     * subclass that returns a fresh result discards everything the base class found.
     */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();

        for (const violation of await this.CheckRulesAsync()) {
            result.Success = false;
            result.Errors.push(new ValidationErrorInfo(violation.Rule, violation.Message, null));
        }

        return result;
    }

    /**
     * A `RunView` bound to this entity's own provider rather than the process-global one, so the rules
     * read from the same server the record came from (see the multi-provider rule in
     * `.claude/rules/data-access.md`).
     *
     * The cast is unavoidable and centralized here rather than repeated at each call site. At runtime
     * the provider is a `ProviderBase`, which implements `IEntityDataProvider`, `IMetadataProvider` and
     * `IRunViewProvider` alike; `BaseEntity.ProviderToUse` is typed as only the first, so widening it is
     * the documented approach — `RunView.FromMetadataProvider` carries the same note for the same reason.
     */
    private runView(): RunView {
        return RunView.FromMetadataProvider(this.ProviderToUse as unknown as IMetadataProvider);
    }

    /**
     * Participation rows as plain facts. Prefers the in-memory collection so a caller that built the
     * graph client-side is validated against what they are about to save, not against what is still in
     * the database.
     */
    private async participantFactsAsync(): Promise<ParticipantFacts[]> {
        const rows = await this.participantRowsAsync();

        return rows.map((r) => ({
            PlayerID: r.PlayerID,
            Score: r.Score,
            Placement: r.Placement,
            IsWinner: r.IsWinner,
        }));
    }

    /**
     * The rows the rules should judge.
     *
     * Order matters, and getting it wrong is not a subtle failure. Keying only on `IsLoaded` looks
     * right and is wrong: a caller who builds the graph in memory — `session.Participants.Create()`
     * then one `Save()`, which is the documented way to save a parent with its children — leaves
     * `IsLoaded` FALSE, because the collection was never *loaded* from the database, it was
     * *populated* by hand. That fell through to a database read which correctly returned nothing for
     * an unsaved session, so every single graph save failed `SessionHasParticipants` while the form
     * path (where the rows really had been loaded) passed. Pending rows therefore win outright.
     */
    private async participantRowsAsync(): Promise<BoardGameNightPlaySessionPlayerEntity[]> {
        // Anything held in memory is what the caller is about to persist — judge that.
        if (this.Participants.Items.length > 0) {
            return [...this.Participants.Items];
        }
        // Genuinely empty: either loaded-and-empty, or a new session with no children attached. Both
        // mean zero participants, and SessionHasParticipants firing is the correct outcome.
        if (this.Participants.IsLoaded || !this.IsSaved) {
            return [];
        }
        return this.loadParticipantsFromDatabaseAsync();
    }

    /** An unsaved session has no rows to fetch, so skip the round trip entirely. */
    private async loadParticipantsFromDatabaseAsync(): Promise<BoardGameNightPlaySessionPlayerEntity[]> {
        if (!this.IsSaved || !this.ID) {
            return [];
        }

        const result = await this.runView().RunView<BoardGameNightPlaySessionPlayerEntity>(
            {
                EntityName: 'Play Session Players',
                ExtraFilter: `PlaySessionID = '${this.ID}'`,
                OrderBy: 'Placement ASC',
                ResultType: 'entity_object',
            },
            this.ContextCurrentUser ?? undefined,
        );

        // RunView reports failure in the result rather than throwing. Treating a failed read as "no
        // participants" would let a broken query silently pass the one-winner rule.
        if (!result.Success) {
            throw new Error(
                `Could not load participants for play session ${this.ID}: ${result.ErrorMessage}`,
            );
        }
        return result.Results ?? [];
    }

    /**
     * The parent game's rule-relevant fields, served from the metadata engine's cache.
     *
     * Games are reference data read on every save, so this used to be a filtered `RunView` per save —
     * which the API's redundancy telemetry duly flagged. `Config(false, …)` is idempotent, so the first
     * caller pays for one load of the catalog and every subsequent save is an in-memory map lookup.
     *
     * The `RunView` fallback stays for the case where the game genuinely is not in the cache: a row
     * created after the engine loaded and before any save invalidated it. Returning undefined instead
     * would silently skip the game-dependent rules, which is the failure mode worth avoiding — a
     * missing load must not quietly relax an invariant.
     */
    private async gameFactsAsync(): Promise<GameFacts | undefined> {
        if (!this.GameID) {
            return undefined;
        }

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        await GameNightMetadataEngine.Instance.Config(false, this.ContextCurrentUser ?? undefined, provider);

        const cached = GameNightMetadataEngine.Instance.GameByID(this.GameID);
        if (cached) {
            return {
                Name: cached.Name,
                Category: cached.Category,
                MinPlayers: cached.MinPlayers,
                MaxPlayers: cached.MaxPlayers,
            };
        }

        return this.gameFactsFromDatabaseAsync();
    }

    /**
     * Cache-miss fallback. `ResultType: 'simple'` with a narrow `Fields` list — a read-only lookup has
     * no reason to pay for entity objects (and `Fields` is ignored for `entity_object` anyway).
     */
    private async gameFactsFromDatabaseAsync(): Promise<GameFacts | undefined> {
        const result = await this.runView().RunView<GameFacts>(
            {
                EntityName: 'Games',
                ExtraFilter: `ID = '${this.GameID}'`,
                Fields: ['Name', 'Category', 'MinPlayers', 'MaxPlayers'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser ?? undefined,
        );

        if (!result.Success) {
            throw new Error(`Could not load game ${this.GameID}: ${result.ErrorMessage}`);
        }
        return result.Results?.[0];
    }
}
