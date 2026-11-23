import { Subscription } from 'rxjs';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { MJAISkillEntity, MJQueryEntityExtended, QueryEngine, UserInfoEngine } from '@memberjunction/core-entities';
import { BaseEntity, BaseEntityEvent, UserInfo, Metadata, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { AIEngineBase, AIAgentPermissionHelper, AISkillPermissionHelper } from '@memberjunction/ai-engine-base';
import { BaseSingleton, MJEvent, MJEventType, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { IntersectAcceptedSkills } from './SkillNarrowing';
import {
  MentionGroupKey,
  MentionPerson,
  MentionPopulationFilter,
  MentionSearchField,
  MentionSuggestion,
  MentionSuggestionPreset,
  MentionSuggestionScope,
} from './MentionSuggestion';

interface MentionFrecencyEntry {
  uses: number;
  lastUsedAt: string;
}

interface RankedMentionItem {
  suggestion: MentionSuggestion;
  queryScore: number;
  totalScore: number;
  uses: number;
}

const GROUP_LABELS: Record<MentionGroupKey, string> = {
  frequent: 'Frequent & Recent',
  'my-agents': 'My Agents',
  shared: 'Shared',
  people: 'People',
  results: 'Results',
};

const FRECENCY_SETTING_KEY = 'chat.mentionFrecency';
const MAX_FRECENCY_ENTRIES = 100;
const FRECENCY_DECAY_HOURS = 72;
const FRECENCY_USE_WEIGHT = 6;
const BOOST_IN_THREAD = 25;
const BOOST_DEFAULT_CHAT_AGENT = 18;
const BOOST_MY_AGENT = 12;
const MAX_FREQUENT_ITEMS = 3;
const AUTO_SYNC_DEBOUNCE_MS = 50;

const AGENT_WATCHED_ENTITIES = new Set<string>(['mj: ai agents', 'mj: ai agent permissions']);
const SKILL_WATCHED_ENTITIES = new Set<string>(['mj: ai skills']);

/**
 * Shared engine behind the conversations composer plugins (the agent-mentions /
 * record-mentions / skill-commands `ComposerTriggerProvider`s) and the mention-parsing
 * consumers (message routing, saved-message badge rendering). Loads the
 * permission-filtered agent / user / entity / query / skill caches once per session and
 * serves ranked `MentionSuggestion` lists per trigger char.
 *
 * Framework-agnostic by construction: a `BaseSingleton` with no Angular, no DOM and no renderer
 * in its graph. That is what lets the ClassFactory-instantiated trigger providers (which live
 * outside Angular DI), the Angular components, and a React Native host all share ONE instance and
 * one cache warm-up.
 *
 * It previously lived in `@memberjunction/ng-conversations` and was Angular-coupled only by
 * location — no import from `@angular/*`, no decorator. A native host cannot depend on an Angular
 * library, so the same permission filtering, skill narrowing and ranking would have had to be
 * written a second time to reach mobile, and a second copy of a permission rule is the copy that
 * drifts. Angular keeps a thin DI shim over this so its call sites are unchanged.
 */
export class MentionAutocomplete extends BaseSingleton<MentionAutocomplete> {
  protected constructor() {
    super();
  }

  /** The process-wide shared instance (Global Object Store backed). */
  public static get Instance(): MentionAutocomplete {
    return super.getInstance<MentionAutocomplete>();
  }

  private agentsCache: MJAIAgentEntityExtended[] = [];
  private usersCache: UserInfo[] = [];
  private entitiesCache: EntityInfo[] = [];
  private queriesCache: MJQueryEntityExtended[] = [];
  /** Active skills the current user can Run — surfaced under the '/' trigger. */
  private skillsCache: MJAISkillEntity[] = [];
  /** The provider this instance was initialised against (multi-provider hosts); undefined = global. */
  private provider: IMetadataProvider | undefined;
  /** The user this instance was initialised for (used for auto-sync permission filtering and ownership checks). */
  private currentUser: UserInfo | undefined;
  /** Default icon for a skill with no IconClass of its own. */
  private defaultSkillIcon = 'fa-solid fa-wand-magic-sparkles';
  /** Generic icon for all query mentions, sourced from the 'MJ: Queries' entity. */
  private queriesEntityIcon = 'fa-solid fa-database';
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  /** In-memory frecency map keyed by lowercased mention ID. */
  private frecencyMap: Map<string, MentionFrecencyEntry> = new Map();
  /** Raw JSON string last read from or written to `UserInfoEngine`, to avoid clobbering newer in-memory updates. */
  private lastSyncedFrecencyRaw: string | null = null;

  /** Process-wide BaseEntity event subscription (attached once). */
  private entityEventSubscription: Subscription | null = null;
  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAgentSync = false;
  private pendingSkillSync = false;

  /** True once the caches have loaded (agents/users/entities/queries/skills). */
  public get IsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Initialize the service by loading agents and users
   * Prevents concurrent initialization with promise lock
   */
  async initialize(currentUser: UserInfo, provider?: IMetadataProvider): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Create initialization promise and store it
    this.initializationPromise = this._initializeInternal(currentUser, provider);

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Internal initialization logic
   */
  private async _initializeInternal(currentUser: UserInfo, provider?: IMetadataProvider): Promise<void> {
    try {
      this.currentUser = currentUser;
      this.provider = provider;

      // Load agents from AIEngineBase
      const aiEngine = this.aiEngineFor(provider);
      await aiEngine.Config(false);

      this.agentsCache = await this.loadRunnableAgents(currentUser, provider);

      // Load users from the system (optional - can be expanded later)
      // For now, we'll just use the current user
      this.usersCache = [currentUser];

      // Load entities the current user can read (candidates for #entity mentions)
      this.entitiesCache = this.loadReadableEntities(currentUser, provider);

      // Load queries the current user can run (also surfaced under the '#' trigger)
      this.queriesCache = await this.loadRunnableQueries(currentUser, provider);
      this.queriesEntityIcon = this.resolveQueriesEntityIcon(provider);

      // Load Active skills the current user can Run (surfaced under the '/' trigger). Mirrors the
      // agent filter: open-by-default unless a skill has explicit permission rows. This is the user's
      // full run-permitted set; when the host names the target agent (getSuggestions' targetAgentId)
      // the picker narrows it to what that agent accepts, and the server's RequestedSkills guard is
      // the backstop either way.
      this.skillsCache = await this.filterSkillsByRunPermission(currentUser);

      // Hydrate frecency cache from UserInfoEngine if already loaded
      this.syncFrecencyFromUserSettings();

      // Subscribe once to BaseEntity events so agent/permission/skill changes auto-sync
      this.ensureEntityEventSubscription();

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize MentionAutocomplete:', error);
      throw error;
    }
  }

  /**
   * Returns the AIEngineBase for the given provider, or the global singleton when none is given.
   */
  private aiEngineFor(provider?: IMetadataProvider): AIEngineBase {
    if (provider && typeof AIEngineBase.GetProviderInstance === 'function') {
      return AIEngineBase.GetProviderInstance<AIEngineBase>(provider, AIEngineBase) as AIEngineBase;
    }
    return AIEngineBase.Instance;
  }

  /**
   * Reads `AIEngineBase.ReadableAgents`, applies eligibility filters, and filters by run permission.
   */
  private async loadRunnableAgents(
    currentUser: UserInfo,
    provider?: IMetadataProvider
  ): Promise<MJAIAgentEntityExtended[]> {
    const aiEngine = this.aiEngineFor(provider);
    const allAgents = aiEngine.ReadableAgents; // none for a user with no read on MJ: AI Agents, not a throw (MJ#5240)

    // Filter by status, hierarchy, invocation mode, and instantiation mode first.
    // Templates with InstantiationMode === 'Required' (e.g., Chief of Staff) are instantiated
    // into personal derived agents rather than mentioned directly in chat.
    const candidateAgents = allAgents.filter(
      a =>
        !a.ParentID &&
        a.Status === 'Active' &&
        a.InvocationMode !== 'Sub-Agent' &&
        !a.IsRestricted &&
        a.InstantiationMode !== 'Required'
    );

    // Filter by user's 'run' permission — respects open-by-default + explicit permissions
    return this.filterAgentsByRunPermission(candidateAgents, currentUser);
  }

  /**
   * Subscribe once to MJGlobal `BaseEntity` events (`save`, `delete`, `remote-invalidate`) for
   * `'MJ: AI Agents'`, `'MJ: AI Agent Permissions'`, and `'MJ: AI Skills'`, debouncing cache
   * re-syncs (~50ms) so callers never need manual `Refresh()` calls.
   */
  private ensureEntityEventSubscription(): void {
    if (this.entityEventSubscription) {
      return;
    }
    if (!MJGlobal?.Instance || typeof MJGlobal.Instance.GetEventListener !== 'function') {
      return;
    }
    const listener = MJGlobal.Instance.GetEventListener(false);
    if (!listener || typeof listener.subscribe !== 'function') {
      return;
    }
    this.entityEventSubscription = listener.subscribe((event: MJEvent) => {
      this.handleGlobalEvent(event);
    });
  }

  /**
   * Filters MJGlobal events down to relevant BaseEntity mutations and schedules a debounced sync.
   */
  private handleGlobalEvent(event: MJEvent): void {
    const baseEventCode = BaseEntity?.BaseEventCode ?? 'BaseEntityEvent';
    if (event.event !== MJEventType.ComponentEvent || event.eventCode !== baseEventCode) {
      return;
    }

    const entityEvent = this.extractBaseEntityEvent(event.args);
    if (!entityEvent) {
      return;
    }

    if (
      entityEvent.type !== 'save' &&
      entityEvent.type !== 'delete' &&
      entityEvent.type !== 'remote-invalidate'
    ) {
      return;
    }

    const rawName = entityEvent.baseEntity?.EntityInfo?.Name || entityEvent.entityName || '';
    const entityName = rawName.trim().toLowerCase();
    if (!entityName) {
      return;
    }

    let shouldSchedule = false;
    if (AGENT_WATCHED_ENTITIES.has(entityName)) {
      this.pendingAgentSync = true;
      shouldSchedule = true;
    }
    if (SKILL_WATCHED_ENTITIES.has(entityName)) {
      this.pendingSkillSync = true;
      shouldSchedule = true;
    }

    if (shouldSchedule) {
      this.scheduleAutoSync();
    }
  }

  /**
   * Type guard narrowing an `MJEvent.args` payload into a `BaseEntityEvent` shape.
   */
  private extractBaseEntityEvent(args: MJEvent['args']): BaseEntityEvent | null {
    if (typeof args !== 'object' || args === null) {
      return null;
    }
    const candidate: Partial<BaseEntityEvent> = args;
    if (typeof candidate.type !== 'string') {
      return null;
    }
    return candidate as BaseEntityEvent;
  }

  /**
   * Debounces cache re-sync so bursts of entity events coalesce into a single re-sync after ~50ms.
   */
  private scheduleAutoSync(): void {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }
    this.syncDebounceTimer = setTimeout(() => {
      this.syncDebounceTimer = null;
      this.flushAutoSync().catch(err => {
        console.error('MentionAutocomplete: auto-sync failed:', err);
      });
    }, AUTO_SYNC_DEBOUNCE_MS);
  }

  /**
   * Re-syncs `agentsCache` and/or `skillsCache` from `AIEngineBase` without forcing a server reload.
   */
  private async flushAutoSync(): Promise<void> {
    const syncAgents = this.pendingAgentSync;
    const syncSkills = this.pendingSkillSync;
    this.pendingAgentSync = false;
    this.pendingSkillSync = false;

    const user = this.currentUser ?? this.usersCache[0];
    if (!user) {
      return;
    }

    if (syncAgents) {
      this.agentsCache = await this.loadRunnableAgents(user, this.provider);
    }
    if (syncSkills) {
      this.skillsCache = await this.filterSkillsByRunPermission(user);
    }
  }

  /**
   * Record that the user selected a mention suggestion so future suggestions boost it via
   * exponentially decayed frecency (`uses * 6 * exp(-hours / 72)`).
   *
   * Persists to `UserInfoEngine.Instance` under `'chat.mentionFrecency'` (capped at top 100 entries)
   * when user/setting context is available, while always updating the in-memory map immediately.
   */
  RecordMentionUse(id: string, type: MentionSuggestion['type'], currentUser?: UserInfo): void {
    const normalizedId = id?.trim().toLowerCase();
    if (!normalizedId || !type) {
      return;
    }

    this.syncFrecencyFromUserSettings();

    const nowMs = Date.now();
    const existing = this.frecencyMap.get(normalizedId);
    const updatedEntry: MentionFrecencyEntry = {
      uses: (existing?.uses ?? 0) + 1,
      lastUsedAt: new Date(nowMs).toISOString(),
    };
    this.frecencyMap.set(normalizedId, updatedEntry);

    this.pruneFrecencyMap(nowMs);

    const serialized = this.serializeFrecencyMap();
    this.lastSyncedFrecencyRaw = serialized;
    this.persistFrecencySetting(serialized, currentUser);
  }

  /**
   * Reads `chat.mentionFrecency` from `UserInfoEngine.Instance` if it changed since last sync.
   * Safe no-op in mocked or uninitialized test environments.
   */
  private syncFrecencyFromUserSettings(): void {
    const raw = this.readUserSetting(FRECENCY_SETTING_KEY);
    if (raw == null || raw === this.lastSyncedFrecencyRaw) {
      return;
    }
    this.lastSyncedFrecencyRaw = raw;
    this.frecencyMap.clear();

    try {
      const parsed: Record<string, Partial<MentionFrecencyEntry>> | null = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return;
      }
      for (const [key, candidate] of Object.entries(parsed)) {
        if (typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)) {
          if (
            typeof candidate.uses === 'number' &&
            Number.isFinite(candidate.uses) &&
            candidate.uses > 0 &&
            typeof candidate.lastUsedAt === 'string' &&
            candidate.lastUsedAt.length > 0
          ) {
            this.frecencyMap.set(key.trim().toLowerCase(), {
              uses: candidate.uses,
              lastUsedAt: candidate.lastUsedAt,
            });
          }
        }
      }
    } catch {
      // Malformed JSON in user setting — ignore and start fresh
    }
  }

  /**
   * Caps `frecencyMap` at {@link MAX_FRECENCY_ENTRIES} entries ranked by current frecency score.
   */
  private pruneFrecencyMap(nowMs: number): void {
    if (this.frecencyMap.size <= MAX_FRECENCY_ENTRIES) {
      return;
    }
    const ranked = Array.from(this.frecencyMap.entries()).sort((a, b) => {
      const scoreDiff =
        this.calculateFrecencyValue(b[1], nowMs) - this.calculateFrecencyValue(a[1], nowMs);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return b[1].lastUsedAt.localeCompare(a[1].lastUsedAt);
    });
    this.frecencyMap = new Map(ranked.slice(0, MAX_FRECENCY_ENTRIES));
  }

  private serializeFrecencyMap(): string {
    const record: Record<string, MentionFrecencyEntry> = {};
    for (const [key, entry] of this.frecencyMap.entries()) {
      record[key] = entry;
    }
    return JSON.stringify(record);
  }

  private readUserSetting(settingKey: string): string | undefined {
    try {
      if (!UserInfoEngine?.Instance || typeof UserInfoEngine.Instance.GetSetting !== 'function') {
        return undefined;
      }
      return UserInfoEngine.Instance.GetSetting(settingKey);
    } catch {
      return undefined;
    }
  }

  private persistFrecencySetting(serialized: string, currentUser?: UserInfo): void {
    try {
      if (
        !UserInfoEngine?.Instance ||
        typeof UserInfoEngine.Instance.SetSettingDebounced !== 'function'
      ) {
        return;
      }
      const engine = UserInfoEngine.Instance;
      const userForSetting = currentUser ?? this.currentUser ?? this.getMetadataCurrentUser();
      const hasUserContext = Boolean(userForSetting?.ID);
      // Real unconfigured BaseEngine has Loaded === false; skip scheduling a failing background save
      // when UserInfoEngine has not been loaded or has no user context (e.g. isolated unit tests).
      if (engine.Loaded === false || (!hasUserContext && engine.Loaded !== true)) {
        return;
      }
      engine.SetSettingDebounced(FRECENCY_SETTING_KEY, serialized, userForSetting);
    } catch {
      // Safe no-op when UserInfoEngine has no user/setting context
    }
  }

  private getMetadataCurrentUser(): UserInfo | undefined {
    try {
      const md = this.provider ?? Metadata?.Provider;
      return md?.CurrentUser;
    } catch {
      return undefined;
    }
  }

  private calculateFrecencyValue(entry: MentionFrecencyEntry, nowMs: number): number {
    if (!entry || entry.uses <= 0) {
      return 0;
    }
    const lastUsedMs = Date.parse(entry.lastUsedAt);
    if (!Number.isFinite(lastUsedMs)) {
      return 0;
    }
    const hoursSinceLastUse = Math.max(0, (nowMs - lastUsedMs) / 3_600_000);
    return entry.uses * FRECENCY_USE_WEIGHT * Math.exp(-hoursSinceLastUse / FRECENCY_DECAY_HOURS);
  }

  private getFrecencyForId(id: string, nowMs: number): { uses: number; score: number } {
    const entry = this.frecencyMap.get(id.trim().toLowerCase());
    if (!entry) {
      return { uses: 0, score: 0 };
    }
    return {
      uses: entry.uses,
      score: this.calculateFrecencyValue(entry, nowMs),
    };
  }

  /**
   * Filter agents to only those the current user has 'run' permission for.
   * Agents with no permission records are open to everyone (canRun = true).
   * Agents with explicit permission records are checked against the user.
   */
  private async filterAgentsByRunPermission(
    agents: MJAIAgentEntityExtended[],
    user: UserInfo
  ): Promise<MJAIAgentEntityExtended[]> {
    const permitted: MJAIAgentEntityExtended[] = [];
    for (const agent of agents) {
      try {
        const canRun = await AIAgentPermissionHelper.HasPermission(agent.ID, user, 'run');
        if (canRun) {
          permitted.push(agent);
        }
      } catch {
        // Fail closed — exclude agent on error
      }
    }
    return permitted;
  }

  /**
   * Filter Active skills to those the current user has 'run' permission for.
   * Skills with no permission records are open to everyone (canRun = true);
   * skills with explicit records are checked against the user (open-by-default).
   */
  private async filterSkillsByRunPermission(user: UserInfo): Promise<MJAISkillEntity[]> {
    try {
      const runnable = await AISkillPermissionHelper.GetAccessibleSkills(user, 'run');
      return runnable.filter(s => s.Status === 'Active');
    } catch {
      // Fail closed — no skills on error.
      return [];
    }
  }

  /**
   * Load entities the current user has read permission for.
   * These are the candidates surfaced for #entity mentions.
   */
  private loadReadableEntities(user: UserInfo, provider?: IMetadataProvider): EntityInfo[] {
    try {
      const md = provider ?? Metadata.Provider;
      return (md.Entities || []).filter(entity => {
        try {
          return entity.GetUserPermisions(user).CanRead;
        } catch {
          // Fail closed — exclude entity on permission-check error
          return false;
        }
      });
    } catch (error) {
      console.error('Failed to load entities for mention autocomplete:', error);
      return [];
    }
  }

  /**
   * Load Approved queries the current user can run, from the provider's QueryEngine (loaded here
   * if it has not loaded yet). A query is runnable when the user holds its run permission and, for
   * a query without explicit permission rows, can read every entity it references. Pending queries
   * are drafts (for example one saved from a conversation so a list can refresh from it) and are
   * not offered. These are the candidates surfaced for #query mentions.
   */
  private async loadRunnableQueries(user: UserInfo, provider?: IMetadataProvider): Promise<MJQueryEntityExtended[]> {
    try {
      const engine = this.queryEngineFor(provider);
      await engine.Config(false, user, provider);
      return engine.Queries.filter(query => query.Status === 'Approved' && this.userCanRunQuery(query, user));
    } catch (error) {
      console.error('Failed to load queries for mention autocomplete:', error);
      return [];
    }
  }

  /** The QueryEngine for the given provider, or the global one when no provider is given. */
  private queryEngineFor(provider?: IMetadataProvider): QueryEngine {
    return provider ? (QueryEngine.GetProviderInstance<QueryEngine>(provider, QueryEngine) as QueryEngine) : QueryEngine.Instance;
  }

  /** Whether the user can run the query; a permission-check error excludes it (fail closed). */
  private userCanRunQuery(query: MJQueryEntityExtended, user: UserInfo): boolean {
    try {
      return query.UserCanRun(user).canRun;
    } catch {
      return false;
    }
  }

  /**
   * Resolve the generic icon used for all query mentions from the 'MJ: Queries' entity.
   */
  private resolveQueriesEntityIcon(provider?: IMetadataProvider): string {
    try {
      const md = provider ?? Metadata.Provider;
      return md.EntityByName('MJ: Queries')?.Icon || 'fa-solid fa-database';
    } catch {
      return 'fa-solid fa-database';
    }
  }

  /**
   * Get suggestions based on search query
   * @param query The search text after the trigger character
   * @param includeUsers Whether to include users in suggestions
   * @param trigger '@' (agents + users), '#' (entities + queries) or '/' (skills)
   * @param targetAgentId When the host knows which agent the message will go to (the '/' trigger
   * only), skill suggestions are narrowed to what THAT agent accepts — `AcceptsSkills` + its
   * `MJ: AI Agent Skills` grants — via {@link AIEngineBase.GetSkillsForAgent}. Without it (or for an
   * agent not in the user's runnable set) the user's full runnable catalog is shown, as before, and
   * the server's `RequestedSkills` guard is the backstop.
   * @param scope Narrows the '@' list for one composer: the agents it may offer, the people it
   * offers, population/field filters, and thread/default-agent context boosts. Passed per call,
   * never stored, because this engine is shared by every composer on the page.
   * @returns Filtered, ranked, and grouped suggestions
   */
  GetSuggestions(
    query: string,
    includeUsers: boolean = true,
    trigger: string = '@',
    targetAgentId: string | null = null,
    scope: MentionSuggestionScope | null = null
  ): MentionSuggestion[] {
    // The '#' trigger searches entities + queries; '/' searches skills; '@' searches agents + users
    if (trigger === '#') {
      return this.getEntityAndQuerySuggestions(query);
    }
    if (trigger === '/') {
      return this.getSkillSuggestions(query, targetAgentId);
    }

    this.syncFrecencyFromUserSettings();

    const lowerQuery = query.toLowerCase().trim();
    const populationFilter: MentionPopulationFilter = scope?.PopulationFilter ?? 'all';
    const searchField: MentionSearchField = scope?.SearchField ?? 'all';
    const nowMs = Date.now();

    const includeAgents = populationFilter !== 'people';
    const includePeople = includeUsers && (populationFilter === 'all' || populationFilter === 'people');

    const rankedItems: RankedMentionItem[] = [
      ...(includeAgents
        ? this.getRankedAgentSuggestions(lowerQuery, scope, populationFilter, searchField, nowMs)
        : []),
      ...(includePeople
        ? this.getRankedPeopleSuggestions(lowerQuery, scope?.People ?? null, searchField, nowMs)
        : []),
    ];

    if (!lowerQuery && populationFilter === 'all') {
      return this.groupEmptyAllSuggestions(rankedItems);
    }

    rankedItems.sort((a, b) => this.compareRankedItems(a, b));

    const groupKey: MentionGroupKey = lowerQuery
      ? 'results'
      : populationFilter === 'my-agents'
        ? 'my-agents'
        : populationFilter === 'shared'
          ? 'shared'
          : 'people';
    const groupLabel = GROUP_LABELS[groupKey];

    return rankedItems.map(item => ({
      ...item.suggestion,
      group: groupKey,
      groupLabel,
    }));
  }

  /** @deprecated Use {@link GetSuggestions}. */
  getSuggestions(
    query: string,
    includeUsers: boolean = true,
    trigger: string = '@',
    targetAgentId: string | null = null,
    scope: MentionSuggestionScope | null = null
  ): MentionSuggestion[] {
    return this.GetSuggestions(query, includeUsers, trigger, targetAgentId, scope);
  }

  /**
   * Groups empty-query `'all'` suggestions into:
   *   1. `'frequent'` (top up-to-3 items with `uses >= 1 || isInCurrentThread || isDefaultChatAgent`)
   *   2. `'my-agents'` (remaining personal derived instances)
   *   3. `'shared'` (remaining shared agents)
   *   4. `'people'` (remaining users)
   * ordered by group sequence and by `totalScore` descending within each group.
   */
  private groupEmptyAllSuggestions(items: RankedMentionItem[]): MentionSuggestion[] {
    const sorted = [...items].sort((a, b) => this.compareRankedItems(a, b));

    const frequentItems: RankedMentionItem[] = [];
    const frequentIds = new Set<string>();

    for (const item of sorted) {
      if (frequentItems.length >= MAX_FREQUENT_ITEMS) {
        break;
      }
      const isFrequentCandidate =
        item.uses >= 1 ||
        Boolean(item.suggestion.isInCurrentThread) ||
        Boolean(item.suggestion.isDefaultChatAgent);
      if (isFrequentCandidate) {
        frequentItems.push(item);
        frequentIds.add(`${item.suggestion.type}:${item.suggestion.id.toLowerCase()}`);
      }
    }

    const myAgentItems: RankedMentionItem[] = [];
    const sharedItems: RankedMentionItem[] = [];
    const peopleItems: RankedMentionItem[] = [];

    for (const item of sorted) {
      const compositeKey = `${item.suggestion.type}:${item.suggestion.id.toLowerCase()}`;
      if (frequentIds.has(compositeKey)) {
        continue;
      }
      if (item.suggestion.type === 'agent') {
        if (item.suggestion.isMyAgent) {
          myAgentItems.push(item);
        } else {
          sharedItems.push(item);
        }
      } else {
        peopleItems.push(item);
      }
    }

    const assignGroup = (list: RankedMentionItem[], group: MentionGroupKey): MentionSuggestion[] => {
      const groupLabel = GROUP_LABELS[group];
      return list.map(item => ({
        ...item.suggestion,
        group,
        groupLabel,
      }));
    };

    return [
      ...assignGroup(frequentItems, 'frequent'),
      ...assignGroup(myAgentItems, 'my-agents'),
      ...assignGroup(sharedItems, 'shared'),
      ...assignGroup(peopleItems, 'people'),
    ];
  }

  private compareRankedItems(a: RankedMentionItem, b: RankedMentionItem): number {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (a.suggestion.type !== b.suggestion.type) {
      return a.suggestion.type === 'agent' ? -1 : 1;
    }
    return a.suggestion.name.localeCompare(b.suggestion.name);
  }

  /**
   * Resolves the current user ID for personal-agent ownership checks (`isMyAgent`).
   */
  private resolveCurrentUserId(): string | null {
    return this.currentUser?.ID ?? this.usersCache[0]?.ID ?? this.getMetadataCurrentUser()?.ID ?? null;
  }

  /**
   * Resolves the human-readable base agent name for a derived agent instance.
   */
  private resolveBaseAgentName(agent: MJAIAgentEntityExtended): string | null {
    if (!agent.BaseAgentID) {
      return null;
    }

    // Check view-joined BaseAgent property first if already populated
    if (typeof agent.BaseAgent === 'string' && agent.BaseAgent.trim().length > 0) {
      return agent.BaseAgent.trim();
    }

    // Look up in AIEngineBase (includes templates with InstantiationMode === 'Required')
    try {
      const aiEngine = this.aiEngineFor(this.provider);
      if (typeof aiEngine.GetAgentByID === 'function') {
        const base = aiEngine.GetAgentByID(agent.BaseAgentID);
        if (base?.Name) {
          return base.Name;
        }
      }
      const readable = aiEngine.ReadableAgents;
      if (Array.isArray(readable)) {
        const base = readable.find(a => UUIDsEqual(a.ID, agent.BaseAgentID));
        if (base?.Name) {
          return base.Name;
        }
      }
    } catch {
      // Ignore engine lookup errors (e.g. mocked engine without GetAgentByID/ReadableAgents)
    }

    const fromCache = this.agentsCache.find(a => UUIDsEqual(a.ID, agent.BaseAgentID));
    return fromCache?.Name ?? null;
  }

  /**
   * Builds the provenance/lineage badge text for an agent.
   */
  private formatAgentLineage(isMyAgent: boolean, baseAgentName: string | null): string {
    if (isMyAgent) {
      return baseAgentName ? `${baseAgentName} · My Agent` : 'My Agent';
    }
    return baseAgentName ? `Shared · ${baseAgentName}` : 'Shared';
  }

  /**
   * Ranked agent suggestions for '@' with frecency, context boosts, lineage, and multi-field matching.
   */
  private getRankedAgentSuggestions(
    lowerQuery: string,
    scope: MentionSuggestionScope | null,
    populationFilter: MentionPopulationFilter,
    searchField: MentionSearchField,
    nowMs: number
  ): RankedMentionItem[] {
    const allowedAgentIDs = scope?.AllowedAgentIDs ?? null;
    const inThreadIDs = scope?.InThreadAgentIDs ?? null;
    const defaultChatAgentID = scope?.DefaultChatAgentID ?? null;
    const currentUserId = this.resolveCurrentUserId();

    const results: RankedMentionItem[] = [];

    for (const agent of this.agentsCache) {
      if (allowedAgentIDs != null && !allowedAgentIDs.some(id => UUIDsEqual(id, agent.ID))) {
        continue;
      }

      const isMyAgent = Boolean(
        agent.BaseAgentID != null &&
          currentUserId != null &&
          agent.OwnerUserID != null &&
          UUIDsEqual(agent.OwnerUserID, currentUserId)
      );

      if (populationFilter === 'my-agents' && !isMyAgent) {
        continue;
      }
      if (populationFilter === 'shared' && isMyAgent) {
        continue;
      }

      const name = agent.Name || 'Unknown';
      const description = agent.Description || undefined;
      const baseAgentName = this.resolveBaseAgentName(agent);
      const lineage = this.formatAgentLineage(isMyAgent, baseAgentName);

      const queryScore = lowerQuery
        ? this.scoreAgentQuery(name, description, baseAgentName, lineage, lowerQuery, searchField)
        : 0;
      if (lowerQuery && queryScore <= 0) {
        continue;
      }

      const isInCurrentThread = Boolean(inThreadIDs?.some(id => UUIDsEqual(id, agent.ID)));
      const isDefaultChatAgent = Boolean(defaultChatAgentID && UUIDsEqual(defaultChatAgentID, agent.ID));
      const { uses, score: frecencyScore } = this.getFrecencyForId(agent.ID, nowMs);

      const contextBoost =
        (isInCurrentThread ? BOOST_IN_THREAD : 0) +
        (isDefaultChatAgent ? BOOST_DEFAULT_CHAT_AGENT : 0) +
        (isMyAgent ? BOOST_MY_AGENT : 0);

      const suggestion: MentionSuggestion = {
        type: 'agent',
        id: agent.ID,
        name,
        displayName: name,
        description,
        imageUrl: agent.LogoURL || undefined,
        icon: this.getAgentIcon(agent),
        // Configuration presets ride on the suggestion — the (AI-blind) composer
        // renders a preset picker on the inserted chip when there are 2+.
        presets: this.getAgentPresets(agent.ID),
        lineage,
        isMyAgent,
        isDefaultChatAgent,
        isInCurrentThread,
        frecencyScore,
      };

      results.push({
        suggestion,
        queryScore,
        totalScore: queryScore + frecencyScore + contextBoost,
        uses,
      });
    }

    return results;
  }

  /**
   * Ranked people suggestions for '@': the host's list when a composer supplies one, otherwise the
   * engine's own (which holds only the current user).
   */
  private getRankedPeopleSuggestions(
    lowerQuery: string,
    people: readonly MentionPerson[] | null,
    searchField: MentionSearchField,
    nowMs: number
  ): RankedMentionItem[] {
    const candidates: readonly MentionPerson[] =
      people ?? this.usersCache.map(user => ({ ID: user.ID, Name: user.Name, Email: user.Email }));

    const results: RankedMentionItem[] = [];

    for (const person of candidates) {
      const name = person.Name || 'Unknown';
      const email = person.Email || undefined;

      const queryScore = lowerQuery
        ? this.scorePersonQuery(name, email, lowerQuery, searchField)
        : 0;
      if (lowerQuery && queryScore <= 0) {
        continue;
      }

      const { uses, score: frecencyScore } = this.getFrecencyForId(person.ID, nowMs);

      const suggestion: MentionSuggestion = {
        type: 'user',
        id: person.ID,
        name,
        displayName: name,
        description: email,
        isMyAgent: false,
        isDefaultChatAgent: false,
        isInCurrentThread: false,
        frecencyScore,
      };

      results.push({
        suggestion,
        queryScore,
        totalScore: queryScore + frecencyScore,
        uses,
      });
    }

    return results;
  }

  /**
   * Multi-field + acronym query scorer for agents:
   * - Exact name: 140
   * - Prefix name: 105
   * - Multi-word acronym prefix (len >= 2, e.g. `fcs` -> `FDA Clinical Scout`): 88
   * - Substring name: 70
   * - Base-agent lineage match: 58
   * - Token-AND match across name + description + lineage (e.g. `sql` -> `Query Builder`): 48
   */
  private scoreAgentQuery(
    name: string,
    description: string | undefined,
    baseAgentName: string | null,
    lineage: string,
    lowerQuery: string,
    searchField: MentionSearchField
  ): number {
    let best = 0;

    if (searchField === 'all' || searchField === 'name') {
      best = Math.max(best, this.calculateNameMatchScore(name, lowerQuery));
    }

    if (searchField === 'all' || searchField === 'lineage') {
      best = Math.max(best, this.calculateLineageMatchScore(baseAgentName, lineage, lowerQuery));
    }

    if (searchField === 'capabilities') {
      best = Math.max(best, this.calculateTokenAndScore(description ?? '', lowerQuery));
    } else if (searchField === 'all') {
      const combined = `${name} ${description ?? ''} ${baseAgentName ?? ''} ${lineage}`;
      best = Math.max(best, this.calculateTokenAndScore(combined, lowerQuery));
    }

    return best;
  }

  /**
   * Multi-field + acronym query scorer for people.
   */
  private scorePersonQuery(
    name: string,
    email: string | undefined,
    lowerQuery: string,
    searchField: MentionSearchField
  ): number {
    if (searchField === 'lineage') {
      return 0;
    }
    if (searchField === 'capabilities') {
      return this.calculateTokenAndScore(email ?? '', lowerQuery);
    }
    const nameScore = this.calculateNameMatchScore(name, lowerQuery);
    if (searchField === 'name') {
      return nameScore;
    }
    return Math.max(nameScore, this.calculateTokenAndScore(`${name} ${email ?? ''}`, lowerQuery));
  }

  /**
   * Name scorer supporting exact (140), prefix (105), multi-word acronym prefix length >= 2 (88),
   * and substring (70).
   */
  private calculateNameMatchScore(name: string, lowerQuery: string): number {
    const lowerName = name.toLowerCase().trim();
    if (!lowerName || !lowerQuery) {
      return 0;
    }
    if (lowerName === lowerQuery) {
      return 140;
    }
    if (lowerName.startsWith(lowerQuery)) {
      return 105;
    }
    if (lowerQuery.length >= 2 && !/\s/.test(lowerQuery)) {
      const words = lowerName.split(/[\s\-_/.]+/).filter(Boolean);
      if (words.length >= 2) {
        const acronym = words.map(w => w[0]).join('');
        if (acronym.startsWith(lowerQuery)) {
          return 88;
        }
      }
    }
    if (lowerName.includes(lowerQuery)) {
      return 70;
    }
    return 0;
  }

  /**
   * Base-agent / lineage scorer (58).
   */
  private calculateLineageMatchScore(
    baseAgentName: string | null,
    lineage: string,
    lowerQuery: string
  ): number {
    if (!lowerQuery) {
      return 0;
    }
    const lowerBase = baseAgentName?.toLowerCase() ?? '';
    const lowerLineage = lineage.toLowerCase();
    if (lowerBase.includes(lowerQuery) || lowerLineage.includes(lowerQuery)) {
      return 58;
    }
    const tokens = lowerQuery.split(/\s+/).filter(Boolean);
    if (tokens.length > 0 && tokens.every(t => lowerBase.includes(t) || lowerLineage.includes(t))) {
      return 58;
    }
    return 0;
  }

  /**
   * Token-AND matcher across a combined text haystack (48).
   */
  private calculateTokenAndScore(haystack: string, lowerQuery: string): number {
    if (!haystack || !lowerQuery) {
      return 0;
    }
    const lowerHaystack = haystack.toLowerCase();
    const tokens = lowerQuery.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return 0;
    }
    return tokens.every(token => lowerHaystack.includes(token)) ? 48 : 0;
  }

  /**
   * Get entity + query suggestions for #mentions, ranked by query match.
   * Capped to keep the dropdown light (entity/query sets can be large).
   */
  private getEntityAndQuerySuggestions(query: string): MentionSuggestion[] {
    const lowerQuery = query.toLowerCase().trim();
    const MAX_SUGGESTIONS = 50;

    const entityItems = this.entitiesCache.map(entity => ({
      label: entity.DisplayNameOrName,
      score: Math.max(
        this.calculateMatchScore(entity.Name || '', lowerQuery),
        this.calculateMatchScore(entity.DisplayName || '', lowerQuery)
      ),
      suggestion: {
        type: 'entity' as const,
        id: entity.ID,
        name: entity.Name,
        displayName: entity.DisplayNameOrName,
        description: entity.Description || undefined,
        icon: entity.Icon || 'fa-solid fa-table'
      }
    }));

    const queryItems = this.queriesCache.map(q => ({
      label: q.Name || '',
      score: this.calculateMatchScore(q.Name || '', lowerQuery),
      suggestion: {
        type: 'query' as const,
        id: q.ID,
        name: q.Name || '',
        displayName: q.Name || '',
        description: q.Description || undefined,
        icon: this.queriesEntityIcon
      }
    }));

    return [...entityItems, ...queryItems]
      .filter(x => x.score > 0 || !lowerQuery)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // When scores tie, prioritize entities over queries
        if (a.suggestion.type !== b.suggestion.type) {
          return a.suggestion.type === 'entity' ? -1 : 1;
        }
        return a.label.localeCompare(b.label);
      })
      .slice(0, MAX_SUGGESTIONS)
      .map(x => x.suggestion);
  }

  /**
   * The skills to offer under '/': the user's runnable catalog, narrowed to the target agent's
   * accepted set when the agent is known. Intersection only — the agent filter never adds a skill
   * the user could not run. Unknown agent id (not in the user's runnable agents) → no narrowing.
   */
  private skillsForTarget(targetAgentId: string | null): MJAISkillEntity[] {
    if (!targetAgentId) {
      return this.skillsCache;
    }
    const agent = this.agentsCache.find(a => UUIDsEqual(a.ID, targetAgentId));
    if (!agent) {
      return this.skillsCache;
    }
    const engine = this.aiEngineFor(this.provider);
    return IntersectAcceptedSkills(this.skillsCache, engine.GetSkillsForAgent(agent));
  }


  /**
   * Get skill suggestions for '/'-mentions, ranked by query match. Each carries the skill's own
   * IconClass/Color (UX metadata) so the dropdown + inserted chip render distinctly per skill.
   */
  private getSkillSuggestions(query: string, targetAgentId: string | null = null): MentionSuggestion[] {
    const lowerQuery = query.toLowerCase().trim();
    const MAX_SUGGESTIONS = 12;

    return this.skillsForTarget(targetAgentId)
      .map(skill => ({
        score: this.calculateMatchScore(skill.Name || '', lowerQuery),
        suggestion: {
          type: 'skill' as const,
          id: skill.ID,
          name: skill.Name || 'Unknown Skill',
          displayName: skill.Name || 'Unknown Skill',
          description: skill.Description || undefined,
          icon: skill.IconClass || this.defaultSkillIcon,
          color: skill.Color || undefined
        }
      }))
      .filter(x => x.score > 0 || !lowerQuery)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.suggestion.name.localeCompare(b.suggestion.name);
      })
      .slice(0, MAX_SUGGESTIONS)
      .map(x => x.suggestion);
  }

  /**
   * Calculate match score for ranking `#` (entities/queries) and `/` (skills) triggers.
   * Higher score = better match.
   */
  private calculateMatchScore(name: string, query: string): number {
    if (!query) return 1; // Show all if no query

    const lowerName = name.toLowerCase();
    const lowerQuery = query.toLowerCase();

    // Exact match
    if (lowerName === lowerQuery) return 100;

    // Starts with
    if (lowerName.startsWith(lowerQuery)) return 50;

    // Contains
    if (lowerName.includes(lowerQuery)) return 25;

    // Word boundary match (e.g., "MA" matches "Marketing Agent")
    const words = lowerName.split(/\s+/);
    for (const word of words) {
      if (word.startsWith(lowerQuery)) return 40;
    }

    return 0; // No match
  }

  /**
   * Map an agent's AI Agent Configuration presets into the composer's generic
   * `MentionSuggestionPreset` shape so the chip's preset picker works without the
   * composer knowing anything about agents.
   *
   * IMPORTANT: preset.ID is the AIAgentConfiguration.ID (preset ID), not
   * AIConfigurationID — the backend mapping converts preset ID -> AIConfigurationID.
   */
  private getAgentPresets(agentId: string): MentionSuggestionPreset[] | undefined {
    try {
      const presets = this.aiEngineFor(this.provider).GetAgentConfigurationPresets(agentId, true);
      if (!presets || presets.length === 0) {
        return undefined;
      }
      return presets.map(p => ({
        ID: p.ID,
        Name: p.Name,
        DisplayName: p.DisplayName || undefined,
        Description: p.Description || undefined,
        IsDefault: p.IsDefault
      }));
    } catch {
      // Presets are a chip nicety — never let them break suggestion building
      return undefined;
    }
  }

  /**
   * Get icon for agent based on type/name
   */
  private getAgentIcon(agent: MJAIAgentEntityExtended): string {
    // Use agent's icon if available, otherwise default based on type
    if (agent.IconClass) return agent.IconClass;

    // Default icons based on agent name patterns
    const name = agent.Name?.toLowerCase() || '';
    if (name.includes('marketing')) return 'fa-megaphone';
    if (name.includes('data') || name.includes('analysis')) return 'fa-chart-line';
    if (name.includes('code') || name.includes('developer')) return 'fa-code';
    if (name.includes('design')) return 'fa-palette';
    if (name.includes('conversation') || name.includes('manager')) return 'fa-comments';

    return 'fa-robot'; // Default
  }

  /**
   * Get available agents for parsing
   */
  GetAvailableAgents(): MJAIAgentEntityExtended[] {
    return this.agentsCache;
  }

  /** @deprecated Use {@link GetAvailableAgents}. */
  getAvailableAgents(): MJAIAgentEntityExtended[] {
    return this.GetAvailableAgents();
  }

  /**
   * Get available users for parsing
   */
  GetAvailableUsers(): UserInfo[] {
    return this.usersCache;
  }

  /** @deprecated Use {@link GetAvailableUsers}. */
  getAvailableUsers(): UserInfo[] {
    return this.GetAvailableUsers();
  }

  /**
   * Get available entities for parsing
   */
  GetAvailableEntities(): EntityInfo[] {
    return this.entitiesCache;
  }

  /** @deprecated Use {@link GetAvailableEntities}. */
  getAvailableEntities(): EntityInfo[] {
    return this.GetAvailableEntities();
  }

  /**
   * Get available queries for parsing
   */
  GetAvailableQueries(): MJQueryEntityExtended[] {
    return this.queriesCache;
  }

  /** @deprecated Use {@link GetAvailableQueries}. */
  getAvailableQueries(): MJQueryEntityExtended[] {
    return this.GetAvailableQueries();
  }

  /**
   * Get the generic icon used for all query mentions.
   */
  GetQueriesEntityIcon(): string {
    return this.queriesEntityIcon;
  }

  /** @deprecated Use {@link GetQueriesEntityIcon}. */
  getQueriesEntityIcon(): string {
    return this.GetQueriesEntityIcon();
  }

  /**
   * Refresh the caches
   * Resets initialization state and reloads agents
   */
  async Refresh(currentUser: UserInfo): Promise<void> {
    this.isInitialized = false;
    this.initializationPromise = null;
    await this.initialize(currentUser, this.provider);
  }

  /** @deprecated Use {@link Refresh}. */
  async refresh(currentUser: UserInfo): Promise<void> {
    return this.Refresh(currentUser);
  }
}
