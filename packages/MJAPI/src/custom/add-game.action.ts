import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';
import { GameNightMetadataEngine } from '@memberjunction/gamenight';
import { BoardGameNightGameEntity, BoardGameNightPublisherEntity } from 'mj_generatedentities';

/** The nine values CK_BGN_Game_Category permits. A tenth would be rejected by the database. */
const CATEGORIES: BoardGameNightGameEntity['Category'][] = [
    'Strategy', 'Family', 'Party', 'Co-op', 'Deck Builder', 'Abstract', 'Dexterity', 'Trivia', 'Legacy',
];

/** The five values CK_BGN_Game_OwnershipStatus permits. */
const OWNERSHIP: BoardGameNightGameEntity['OwnershipStatus'][] = [
    'Owned', 'Wishlist', 'Loaned Out', 'Sold', 'Retired',
];

/** Sentinel publisher for traditional/public-domain games, seeded for Poker. */
const PUBLIC_DOMAIN = 'Public Domain';

/**
 * Adds a game to the collection — the same write a person does through the Games form.
 *
 * The interesting part is `Game.PublisherID`, which is **NOT NULL**. An agent asked to "add Skull" will
 * almost never know the publisher, and there is no nullable escape hatch, so this action has to make a
 * decision rather than pass the problem to the database:
 *
 * - A publisher NAME that already exists resolves to it.
 * - A name that does not exist is CREATED (a publisher row is just a name) and reported in the result,
 *   so the caller knows a new reference record appeared rather than discovering it later.
 * - No name at all falls back to the seeded 'Public Domain' sentinel, which is what the schema's own
 *   comments prescribe for traditional games.
 *
 * Category and OwnershipStatus are validated here against their CHECK-constraint value lists, so a bad
 * value comes back naming the legal options instead of as a raw SQL constraint violation the agent
 * cannot act on.
 */
@RegisterClass(BaseAction, '__AddGame')
export class AddGameAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const user = params.ContextUser;
        if (!user) {
            return this.fail('NO_CONTEXT_USER', 'This action requires a context user.');
        }

        try {
            const name = this.stringParam(params, 'Name');
            if (!name) {
                return this.fail('MISSING_NAME', 'Name is required (the game title).');
            }

            const md = new Metadata();
            await GameNightMetadataEngine.Instance.Config(false, user, Metadata.Provider);

            // Game.Name has no UNIQUE constraint, so a duplicate would silently succeed and then show up
            // twice in every list. Refuse and point at what already exists.
            const existing = GameNightMetadataEngine.Instance.Games.find(
                (g) => g.Name.trim().toLowerCase() === name.toLowerCase(),
            );
            if (existing) {
                return this.fail(
                    'ALREADY_EXISTS',
                    `'${existing.Name}' is already in the collection (category ${existing.Category}, ` +
                    `${existing.MinPlayers}-${existing.MaxPlayers} players).`,
                );
            }

            const category = this.validateFromList(params, 'Category', CATEGORIES, 'Strategy');
            if (typeof category !== 'string') return category;

            const ownership = this.validateFromList(params, 'OwnershipStatus', OWNERSHIP, 'Owned');
            if (typeof ownership !== 'string') return ownership;

            const minPlayers = this.intParam(params, 'MinPlayers') ?? 2;
            const maxPlayers = this.intParam(params, 'MaxPlayers') ?? minPlayers;
            if (minPlayers < 1 || maxPlayers < minPlayers) {
                return this.fail(
                    'INVALID_PLAYER_COUNT',
                    `MinPlayers must be at least 1 and MaxPlayers at least MinPlayers; got ${minPlayers}-${maxPlayers}.`,
                );
            }

            const weight = this.numberParam(params, 'Weight');
            if (weight !== null && (weight < 1 || weight > 5)) {
                return this.fail('INVALID_WEIGHT', `Weight must be between 1.00 and 5.00; got ${weight}.`);
            }

            const publisher = await this.resolvePublisherAsync(md, user, this.stringParam(params, 'Publisher'));

            const game = await md.GetEntityObject<BoardGameNightGameEntity>('Games', user);
            game.NewRecord();
            game.Name = name;
            game.PublisherID = publisher.ID;
            game.Category = category;
            game.OwnershipStatus = ownership;
            game.MinPlayers = minPlayers;
            game.MaxPlayers = maxPlayers;

            const year = this.intParam(params, 'YearPublished');
            if (year !== null) game.YearPublished = year;
            const minTime = this.intParam(params, 'MinPlayTimeMinutes');
            if (minTime !== null) game.MinPlayTimeMinutes = minTime;
            const maxTime = this.intParam(params, 'MaxPlayTimeMinutes');
            if (maxTime !== null) game.MaxPlayTimeMinutes = maxTime;
            if (weight !== null) game.Weight = weight;
            const price = this.numberParam(params, 'PurchasePrice');
            if (price !== null) game.PurchasePrice = price;
            const notes = this.stringParam(params, 'Notes');
            if (notes) game.Notes = notes;

            if (!(await game.Save())) {
                return this.fail(
                    'SAVE_FAILED',
                    game.LatestResult?.CompleteMessage ?? 'Save failed with no message.',
                );
            }

            // The engine caches Games, so a new row must invalidate it or every later read in this
            // process — including Log Play Session's own game lookup — would not see the new game.
            await GameNightMetadataEngine.Instance.Config(true, user, Metadata.Provider);

            const publisherNote = publisher.created ? ` Created publisher '${publisher.Name}'.` : '';
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message:
                    `Added '${game.Name}' (${category}, ${minPlayers}-${maxPlayers} players, ` +
                    `publisher ${publisher.Name}).${publisherNote}`,
                Params: [{ Name: 'GameID', Type: 'Output', Value: game.ID }],
            };
        } catch (e) {
            return this.fail('FAILED', e instanceof Error ? e.message : String(e));
        }
    }

    /**
     * Resolves the required publisher, creating one when the name is new.
     *
     * Creating reference data inside an action deserves a justification: PublisherID is NOT NULL, a
     * publisher row carries nothing but a name, and the alternative is refusing every game whose
     * publisher is not already seeded — which would block almost every real addition. The result
     * message always reports a creation so it is never silent.
     */
    private async resolvePublisherAsync(
        md: Metadata,
        user: RunActionParams['ContextUser'],
        requested: string | null,
    ): Promise<{ ID: string; Name: string; created: boolean }> {
        const engine = GameNightMetadataEngine.Instance;
        const wanted = (requested ?? PUBLIC_DOMAIN).trim();

        const match =
            engine.Publishers.find((p) => p.Name.trim().toLowerCase() === wanted.toLowerCase()) ??
            engine.Publishers.find((p) => p.Name.trim().toLowerCase().includes(wanted.toLowerCase()));
        if (match) {
            return { ID: match.ID, Name: match.Name, created: false };
        }

        const publisher = await md.GetEntityObject<BoardGameNightPublisherEntity>('Publishers', user);
        publisher.NewRecord();
        publisher.Name = wanted;
        if (!(await publisher.Save())) {
            throw new Error(
                `Could not create publisher '${wanted}': ${publisher.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return { ID: publisher.ID, Name: publisher.Name, created: true };
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

    private numberParam(params: RunActionParams, name: string): number | null {
        const raw = this.stringParam(params, name);
        if (raw === null) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }

    private intParam(params: RunActionParams, name: string): number | null {
        const n = this.numberParam(params, name);
        return n === null ? null : Math.round(n);
    }

    /**
     * Validates a value-list parameter, returning the value or a failure result naming the legal options.
     * Returning the error rather than throwing keeps the ResultCode specific to the field.
     */
    private validateFromList<T extends string>(
        params: RunActionParams,
        name: string,
        allowed: readonly T[],
        fallback: T,
    ): T | ActionResultSimple {
        const raw = this.stringParam(params, name);
        if (raw === null) return fallback;

        const hit = allowed.find((a) => a.toLowerCase() === raw.toLowerCase());
        if (hit) return hit;

        return this.fail(
            `INVALID_${name.toUpperCase()}`,
            `'${raw}' is not a valid ${name}. Allowed values: ${allowed.join(', ')}.`,
        );
    }

    private fail(code: string, message: string): ActionResultSimple {
        return { Success: false, ResultCode: code, Message: message };
    }
}

/** Tree-shaking guard — resolved through ClassFactory by name only. */
export function LoadAddGameAction(): void {
    // intentionally empty
}
