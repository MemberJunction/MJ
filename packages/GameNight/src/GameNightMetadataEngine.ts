import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import {
    BoardGameNightDesignerEntity,
    BoardGameNightGameEntity,
    BoardGameNightPlayerEntity,
    BoardGameNightPublisherEntity,
} from 'mj_generatedentities';
import { GroupByField, IndexByField, IndexByID, NormalizeKey } from './GameNightIndexes.js';

/**
 * Caches the Board Game Night *catalog* — the write-light, read-heavy half of the schema.
 *
 * The split follows the data, not taste. Games (21), Players (8), Publishers (19) and Designers (20)
 * are reference data: edited rarely, read on nearly every screen and on every session save. Play
 * Sessions (27) and Play Session Players (120) are the opposite — they are the append-only fact table,
 * they grow without bound, and caching them would mean holding a table that only gets bigger while
 * invalidating it on every game night. Those stay on `RunView`.
 *
 * What this buys beyond avoiding queries: the derived indexes below are computed once per load instead
 * of per caller. Before this engine, `GameNightPlaySessionEntity` ran a filtered `RunView` on Games for
 * every single save, which the API's own telemetry flagged as redundant.
 *
 * Usage — idempotent, so every entry point can call it without coordinating:
 *
 *     await GameNightMetadataEngine.Instance.Config(false, contextUser, provider);
 *     const game = GameNightMetadataEngine.Instance.GameByID(session.GameID);
 */
export class GameNightMetadataEngine extends BaseEngine<GameNightMetadataEngine> {
    public static get Instance(): GameNightMetadataEngine {
        return super.getInstance<GameNightMetadataEngine>();
    }

    /**
     * No `OrderBy` on any config, deliberately. An ordered config cannot be maintained by in-place
     * mutation, so the engine responds to a save by fully refreshing and *reassigning* the array — which
     * invalidates any reference a caller is holding, and disqualifies the cache as a donor for
     * `BaseEngineRegistry`. Callers that want a particular order can sort the array they get.
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            { Type: 'entity', EntityName: 'Games', PropertyName: '_games', CacheLocal: true },
            { Type: 'entity', EntityName: 'Players', PropertyName: '_players', CacheLocal: true },
            { Type: 'entity', EntityName: 'Publishers', PropertyName: '_publishers', CacheLocal: true },
            { Type: 'entity', EntityName: 'Designers', PropertyName: '_designers', CacheLocal: true },
        ];
        await this.Load(c, provider ?? Metadata.Provider, forceRefresh, contextUser);
    }

    private _games: BoardGameNightGameEntity[] = [];
    private _players: BoardGameNightPlayerEntity[] = [];
    private _publishers: BoardGameNightPublisherEntity[] = [];
    private _designers: BoardGameNightDesignerEntity[] = [];

    private gamesByID = new Map<string, BoardGameNightGameEntity>();
    private gamesByCategory = new Map<string, BoardGameNightGameEntity[]>();
    private playersByID = new Map<string, BoardGameNightPlayerEntity>();
    private playersByNickname = new Map<string, BoardGameNightPlayerEntity>();
    private publishersByID = new Map<string, BoardGameNightPublisherEntity>();

    /**
     * Rebuilds the derived indexes after every load.
     *
     * This hook is the reason the indexes can be trusted: the engine calls it on the initial load *and*
     * on any refresh triggered by a save or a remote invalidation, so an index can never describe a
     * stale array.
     */
    protected override async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        await super.AdditionalLoading(contextUser);

        this.gamesByID = IndexByID(this._games);
        this.gamesByCategory = GroupByField(this._games, (g) => g.Category);
        this.playersByID = IndexByID(this._players);
        this.playersByNickname = IndexByField(this._players, (p) => p.Nickname);
        this.publishersByID = IndexByID(this._publishers);
    }

    // ---- Cached collections ----------------------------------------------------------------------
    //
    // Every getter goes through GetConfigData, which throws PermissionConstrainedError when the user
    // cannot read the entity. Returning the raw backing field instead would hand back an empty array,
    // and a caller would read "no games exist" where the truth is "you may not see them".

    public get Games(): BoardGameNightGameEntity[] {
        return this.GetConfigData<BoardGameNightGameEntity>('_games');
    }

    public get Players(): BoardGameNightPlayerEntity[] {
        return this.GetConfigData<BoardGameNightPlayerEntity>('_players');
    }

    public get Publishers(): BoardGameNightPublisherEntity[] {
        return this.GetConfigData<BoardGameNightPublisherEntity>('_publishers');
    }

    public get Designers(): BoardGameNightDesignerEntity[] {
        return this.GetConfigData<BoardGameNightDesignerEntity>('_designers');
    }

    // ---- Reactive streams for Angular -----------------------------------------------------------
    //
    // Subscribers get the current array immediately, then again automatically whenever a row is saved,
    // deleted, or remote-invalidated. A component using these never writes reload-after-mutation code.
    // Lazily created, so they cost nothing until something subscribes.

    public get Games$() {
        return this.ObserveProperty<BoardGameNightGameEntity>('_games');
    }

    public get Players$() {
        return this.ObserveProperty<BoardGameNightPlayerEntity>('_players');
    }

    // ---- Indexed lookups -------------------------------------------------------------------------

    /** O(1) game lookup, case-insensitive on the GUID. Undefined when absent or not yet configured. */
    public GameByID(id: string | null | undefined): BoardGameNightGameEntity | undefined {
        return this.gamesByID.get(NormalizeKey(id));
    }

    /** O(1) player lookup by GUID. */
    public PlayerByID(id: string | null | undefined): BoardGameNightPlayerEntity | undefined {
        return this.playersByID.get(NormalizeKey(id));
    }

    /** O(1) publisher lookup by GUID. */
    public PublisherByID(id: string | null | undefined): BoardGameNightPublisherEntity | undefined {
        return this.publishersByID.get(NormalizeKey(id));
    }

    /**
     * Games in a category, e.g. `'Party'` — the distinction the one-winner rule turns on.
     * Returns a copy so a caller cannot mutate the engine's own grouping.
     */
    public GamesInCategory(category: string | null | undefined): BoardGameNightGameEntity[] {
        return [...(this.gamesByCategory.get(NormalizeKey(category)) ?? [])];
    }

    /** Player by nickname ('Cait', 'Han'), case-insensitive. First match wins on a collision. */
    public PlayerByNickname(nickname: string | null | undefined): BoardGameNightPlayerEntity | undefined {
        return this.playersByNickname.get(NormalizeKey(nickname));
    }
}
