import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { GameNightMetadataEngine, GameNightPlaySessionEntity } from '@memberjunction/gamenight';
import { BoardGameNightPlaySessionPlayerEntity } from 'mj_generatedentities';

/**
 * A name that could not be resolved to a record. Carries the ResultCode so the caller gets
 * 'UNKNOWN_GAME' / 'UNKNOWN_PLAYER' rather than a generic failure.
 */
class ResolutionError extends Error {
    constructor(public readonly Code: string, message: string) {
        super(message);
        this.name = 'ResolutionError';
    }
}

/** One participant as the caller describes them. Player is a nickname or full name, not a GUID. */
type ParticipantInput = {
    Player: string;
    Score?: number | null;
    Placement?: number | null;
    IsWinner?: boolean;
    FactionOrColor?: string | null;
    Notes?: string | null;
};

/**
 * Records a play session — the same thing a person does through the Play Sessions form.
 *
 * This exists so an agent can do the one genuinely useful *write* in this app. Everything else it might
 * want (leaderboards, box-time accuracy) is a read it can get from the dashboard's published context.
 *
 * Two design decisions carry the weight here:
 *
 * 1. **It saves the session and its participants as ONE graph** — `session.Participants.Create()` then a
 *    single `session.Save()`. That is not a stylistic choice: `BaseEntity.Save()` runs
 *    `GameNightPlaySessionEntity.ValidateAsync()`, so all seven session rules apply to the agent's write
 *    exactly as they apply to the form's. An action that inserted the session first and the rows
 *    afterwards would commit a session that no rule had yet seen, and a two-winner game would persist.
 *    Requires `@memberjunction/gamenight` to be loaded in MJAPI — see the import in index.ts.
 *
 * 2. **Players and games are resolved by NAME, not ID.** An agent is working from a sentence like
 *    "Cait won Wingspan last night with 84 points", and asking it to invent GUIDs is how you get
 *    hallucinated foreign keys. Resolution goes through the metadata engine's cached indexes, so it is
 *    in-memory rather than a query per name, and an unresolved name is a hard failure with the list of
 *    valid options rather than a silent skip.
 */
@RegisterClass(BaseAction, '__LogPlaySession')
export class LogPlaySessionAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const user = params.ContextUser;
        if (!user) {
            return this.fail('NO_CONTEXT_USER', 'This action requires a context user.');
        }

        try {
            const gameName = this.stringParam(params, 'Game');
            const playedAtRaw = this.stringParam(params, 'PlayedAt');
            const outcome = this.stringParam(params, 'Outcome') ?? 'Completed';
            const location = this.stringParam(params, 'LocationName');
            const durationRaw = this.stringParam(params, 'DurationMinutes');
            const notes = this.stringParam(params, 'Notes');
            const participantsRaw = this.rawParam(params, 'Participants');

            if (!gameName) {
                return this.fail('MISSING_GAME', 'Game is required (the name of the game played).');
            }

            const participants = this.parseParticipants(participantsRaw);
            if (participants.length === 0) {
                return this.fail(
                    'MISSING_PARTICIPANTS',
                    'Participants is required: an array of { Player, Score?, Placement?, IsWinner? }.',
                );
            }

            const md = new Metadata();
            await GameNightMetadataEngine.Instance.Config(false, user, Metadata.Provider);

            const game = this.resolveGame(gameName);
            const resolved = this.resolvePlayers(participants);

            // Build the graph in memory. Nothing touches the database until the single Save() below.
            const session = await md.GetEntityObject<GameNightPlaySessionEntity>('Play Sessions', user);
            session.NewRecord();
            session.GameID = game.ID;
            session.PlayedAt = playedAtRaw ? new Date(playedAtRaw) : new Date();
            session.Outcome = outcome as GameNightPlaySessionEntity['Outcome'];
            if (location) session.LocationName = location;
            if (notes) session.Notes = notes;
            if (durationRaw) {
                const duration = Number(durationRaw);
                if (!Number.isFinite(duration) || duration <= 0) {
                    return this.fail('INVALID_DURATION', `DurationMinutes must be a positive number; got '${durationRaw}'.`);
                }
                session.DurationMinutes = duration;
            }

            for (const p of resolved) {
                // Create() is async — it resolves the child entity object through the provider.
                const row = (await session.Participants.Create()) as BoardGameNightPlaySessionPlayerEntity;
                row.PlayerID = p.playerID;
                row.Score = p.input.Score ?? null;
                row.Placement = p.input.Placement ?? null;
                row.IsWinner = p.input.IsWinner === true;
                row.FactionOrColor = p.input.FactionOrColor ?? null;
                if (p.input.Notes) row.Notes = p.input.Notes;
            }

            // ONE save. Validation (including all seven session rules) runs inside it.
            const saved = await session.Save();
            if (!saved) {
                // Save() returns false on a logical failure rather than throwing, and CompleteMessage is
                // what carries the individual rule messages — .Message alone loses them.
                return this.fail(
                    'VALIDATION_FAILED',
                    session.LatestResult?.CompleteMessage ?? 'Save failed with no message.',
                );
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Logged ${game.name} on ${session.PlayedAt.toISOString().slice(0, 10)} with ${resolved.length} participants.`,
                Params: [
                    {
                        Name: 'SessionID',
                        Type: 'Output',
                        Value: session.ID,
                    },
                ],
            };
        } catch (e) {
            // A resolution failure is the agent's mistake and carries its own code + the valid options,
            // which is far more actionable than a generic FAILED.
            if (e instanceof ResolutionError) {
                return this.fail(e.Code, e.message);
            }
            return this.fail('FAILED', e instanceof Error ? e.message : String(e));
        }
    }

    // ---- Parameter helpers -----------------------------------------------------------------------

    private rawParam(params: RunActionParams, name: string): unknown {
        const target = name.trim().toLowerCase();
        return params.Params.find((p) => p.Name.trim().toLowerCase() === target)?.Value;
    }

    private stringParam(params: RunActionParams, name: string): string | null {
        const value = this.rawParam(params, name);
        if (value === null || value === undefined) return null;
        const s = String(value).trim();
        return s.length > 0 ? s : null;
    }

    /** Accepts either a real array or the JSON string an LLM will often hand over. */
    private parseParticipants(raw: unknown): ParticipantInput[] {
        if (Array.isArray(raw)) {
            return raw as ParticipantInput[];
        }
        if (typeof raw === 'string' && raw.trim().length > 0) {
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? (parsed as ParticipantInput[]) : [];
            } catch {
                return [];
            }
        }
        return [];
    }

    // ---- Name resolution -------------------------------------------------------------------------

    /** Throws ResolutionError('UNKNOWN_GAME') rather than returning a sentinel, so the caller cannot forget to check. */
    private resolveGame(name: string): { ID: string; name: string } {
        const games = GameNightMetadataEngine.Instance.Games;
        const target = name.trim().toLowerCase();

        const exact = games.find((g) => g.Name.trim().toLowerCase() === target);
        if (exact) return { ID: exact.ID, name: exact.Name };

        // A single unambiguous partial match is a convenience worth having ("Brass" -> "Brass: Birmingham").
        // Several matches is genuinely ambiguous and must be refused rather than guessed.
        const partial = games.filter((g) => g.Name.trim().toLowerCase().includes(target));
        if (partial.length === 1) return { ID: partial[0].ID, name: partial[0].Name };
        if (partial.length > 1) {
            throw new ResolutionError(
                'UNKNOWN_GAME',
                `'${name}' matches several games: ${partial.map((g) => g.Name).join(', ')}. Be specific.`,
            );
        }
        throw new ResolutionError(
            'UNKNOWN_GAME',
            `No game named '${name}'. Known games: ${games.map((g) => g.Name).join(', ')}.`,
        );
    }

    /** Throws ResolutionError('UNKNOWN_PLAYER') on the first name that does not resolve. */
    private resolvePlayers(inputs: ParticipantInput[]): { playerID: string; input: ParticipantInput }[] {
        const engine = GameNightMetadataEngine.Instance;
        const rows: { playerID: string; input: ParticipantInput }[] = [];

        for (const input of inputs) {
            const name = (input.Player ?? '').trim();
            if (name.length === 0) {
                throw new ResolutionError('UNKNOWN_PLAYER', 'Every participant needs a Player name.');
            }

            // Nickname first — that is what people actually say at the table.
            const player =
                engine.PlayerByNickname(name) ??
                engine.Players.find(
                    (p) =>
                        `${p.FirstName} ${p.LastName}`.trim().toLowerCase() === name.toLowerCase() ||
                        p.FirstName.trim().toLowerCase() === name.toLowerCase(),
                );

            if (!player) {
                const known = engine.Players.map((p) => p.Nickname ?? p.FirstName).join(', ');
                throw new ResolutionError('UNKNOWN_PLAYER', `No player named '${name}'. Known players: ${known}.`);
            }
            rows.push({ playerID: player.ID, input });
        }

        return rows;
    }

    private fail(code: string, message: string): ActionResultSimple {
        return { Success: false, ResultCode: code, Message: message };
    }
}

/** Tree-shaking guard — the action is only ever resolved through ClassFactory by name. */
export function LoadLogPlaySessionAction(): void {
    // intentionally empty
}
