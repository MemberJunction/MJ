/**
 * @module components/ml-component-engine
 *
 * **MLComponentEngine** — the reactive cache that makes the typed-component TREE readable at
 * runtime. Core owns the pure algorithms ({@link resolveComponentProfile}, {@link lintComponentTree});
 * this engine is the only thing that knows how to load the tree out of MJ and hand it to them.
 *
 * ## What it caches, and what it deliberately does not
 *
 * The three **type** tables — `MJ: ML Component Types`, `MJ: ML Component Type Properties`,
 * `MJ: ML Component Type Slots` — are catalog metadata: ~100 rows total, no large columns, changing
 * only when someone authors a component. They are cached, following the canonical `BaseEngine`
 * pattern (`FeaturePipelineEngine` / `ComponentMetadataEngine`), which also buys reactivity for
 * free: a save/delete on any of them refreshes the arrays and re-emits to observers with no manual
 * invalidation code.
 *
 * `MJ: ML Components` (the filled INSTANCES) is **not** cached, on purpose. Instances grow with every
 * trained model and carry `Spec` / `FittedState` / `StoryVector` blobs; bulk-loading them would be
 * the "huge column × many rows" case the caching rules tell you to punt on. Callers load instances
 * with a filtered `RunView` by `MLModelID` or `ComponentTypeID` instead.
 *
 * ## Resolved profiles are memoized
 *
 * `ResolveProfile` folds a leaf's whole inheritance chain, so it is memoized per type id. The memo is
 * cleared in `AdditionalLoading`, which `BaseEngine` invokes after the initial load AND after every
 * event-driven refresh — so an authored change to a property row can never serve a stale profile.
 */

import {
  BaseEngine,
  type BaseEnginePropertyConfig,
  type IMetadataProvider,
  type UserInfo,
} from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import type {
  MJMLComponentTypeEntity,
  MJMLComponentTypePropertyEntity,
  MJMLComponentTypeSlotEntity,
  MJMLAlgorithmEntity,
} from '@memberjunction/core-entities';
import type { Observable } from 'rxjs';
import {
  type ComponentKind,
  type ComponentTypeNode,
  type ComponentTypePropertyRow,
  type ComponentTypeSlotRow,
  type ResolvedComponentProfile,
  type TreeLintFinding,
  groupByType,
  isDescendantOrSelf,
  lintComponentTree,
  resolveComponentProfile,
} from '@memberjunction/predictive-studio-core';

/**
 * Reactive cache + resolution façade over the component-type tree. Singleton per provider; never
 * construct directly — use {@link Instance} or `BaseEngine.GetProviderInstance(provider, MLComponentEngine)`.
 */
export class MLComponentEngine extends BaseEngine<MLComponentEngine> {
  /** Standard singleton accessor for the default provider. */
  public static get Instance(): MLComponentEngine {
    return super.getInstance<MLComponentEngine>();
  }

  /** Catalog nodes of the inheritance tree (cached). */
  private _componentTypes: MJMLComponentTypeEntity[] = [];

  /** Inheritable property rows (cached). */
  private _componentTypeProperties: MJMLComponentTypePropertyEntity[] = [];

  /** Declared slots (cached). */
  private _componentTypeSlots: MJMLComponentTypeSlotEntity[] = [];

  /** Memoized resolved profiles, keyed by normalized component-type id. Cleared on every refresh. */
  private profileMemo = new Map<string, ResolvedComponentProfile>();

  /**
   * Lazy-load the three type caches. Safe to call from every entry point — a no-op once loaded
   * unless `forceRefresh`.
   *
   * @param forceRefresh re-run the underlying RunViews even if already loaded
   * @param contextUser the context user (required server-side for audit/security)
   * @param provider the metadata provider to scope this load to (multi-provider safe)
   */
  public async Config(
    forceRefresh?: boolean,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<void> {
    const configs: Partial<BaseEnginePropertyConfig>[] = [
      {
        Type: 'entity',
        EntityName: 'MJ: ML Component Types',
        PropertyName: '_componentTypes',
        OrderBy: 'Name',
        CacheLocal: true,
      },
      {
        Type: 'entity',
        EntityName: 'MJ: ML Component Type Properties',
        PropertyName: '_componentTypeProperties',
        // Sequence order matters for the append-mode property keys; the resolver re-sorts
        // defensively, but loading in order keeps the cached array readable in a debugger.
        OrderBy: 'Sequence',
        CacheLocal: true,
      },
      {
        Type: 'entity',
        EntityName: 'MJ: ML Component Type Slots',
        PropertyName: '_componentTypeSlots',
        OrderBy: 'Sequence',
        CacheLocal: true,
      },
    ];
    await this.Load(configs, provider, forceRefresh, contextUser);
  }

  /**
   * Drop memoized profiles after a load or an event-driven refresh. `BaseEngine` calls this on both
   * paths, which is precisely why the memo cannot go stale when a component is re-authored.
   */
  protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
    this.profileMemo.clear();
  }

  // ─── Read-side accessors ────────────────────────────────────────────────

  /** Every cached component-type node. */
  public get ComponentTypes(): MJMLComponentTypeEntity[] {
    return this._componentTypes ?? [];
  }

  /** Every cached inheritable property row. */
  public get ComponentTypeProperties(): MJMLComponentTypePropertyEntity[] {
    return this._componentTypeProperties ?? [];
  }

  /** Every cached slot declaration. */
  public get ComponentTypeSlots(): MJMLComponentTypeSlotEntity[] {
    return this._componentTypeSlots ?? [];
  }

  /** Observable of the component-type nodes; re-emits on any save/delete/remote-invalidate. */
  public get ComponentTypes$(): Observable<MJMLComponentTypeEntity[]> {
    return this.ObserveProperty<MJMLComponentTypeEntity>('_componentTypes');
  }

  // ─── Lookups ────────────────────────────────────────────────────────────

  /** Find a component type by id. */
  public FindTypeByID(id: string): MJMLComponentTypeEntity | undefined {
    if (!id) return undefined;
    const norm = NormalizeUUID(id);
    return this.ComponentTypes.find((t) => NormalizeUUID(t.ID) === norm);
  }

  /** Find a component type by its unique Name (case-insensitive). */
  public FindTypeByName(name: string): MJMLComponentTypeEntity | undefined {
    if (!name) return undefined;
    const target = name.trim().toLowerCase();
    return this.ComponentTypes.find((t) => t.Name.trim().toLowerCase() === target);
  }

  /** Every type in one Kind space, optionally only the concrete (instantiable) ones. */
  public TypesByKind(kind: ComponentKind, concreteOnly = false): MJMLComponentTypeEntity[] {
    return this.ComponentTypes.filter((t) => t.Kind === kind && (!concreteOnly || !t.IsAbstract));
  }

  /**
   * The component-type leaf an algorithm-catalog row maps onto, via the `MLAlgorithm.ComponentTypeID`
   * bridge. Returns `undefined` for a catalog row predating the component model.
   */
  public LeafForAlgorithm(algorithm: MJMLAlgorithmEntity): MJMLComponentTypeEntity | undefined {
    return algorithm.ComponentTypeID ? this.FindTypeByID(algorithm.ComponentTypeID) : undefined;
  }

  /** Whether `typeId` is `ancestorId` or descends from it — the slot-acceptance test. */
  public IsDescendantOf(typeId: string, ancestorId: string): boolean {
    return isDescendantOrSelf(NormalizeUUID(typeId), NormalizeUUID(ancestorId), this.nodesById());
  }

  // ─── Resolution + lint ──────────────────────────────────────────────────

  /**
   * The full inherited profile for one component type — the merged preprocessing/hyperparameter
   * banks, statistical gates, defaults and slots, with per-key provenance. Memoized.
   *
   * @param componentTypeID the type to resolve (usually a concrete leaf)
   * @throws when the id is unknown, or the tree has a cycle
   */
  public ResolveProfile(componentTypeID: string): ResolvedComponentProfile {
    const key = NormalizeUUID(componentTypeID);
    const memo = this.profileMemo.get(key);
    if (memo) return memo;
    const resolved = resolveComponentProfile(
      key,
      this.nodesById(),
      groupByType(this.propertyRows()),
      groupByType(this.slotRows()),
    );
    this.profileMemo.set(key, resolved);
    return resolved;
  }

  /**
   * Lint the whole cached tree — the principled-partition enforcer. `Error` findings mean the tree
   * is structurally unusable; `Warning` means a property was placed higher than it is actually true
   * (an ancestor's `Add` that a descendant vetoes).
   */
  public Lint(): TreeLintFinding[] {
    return lintComponentTree(this.nodeList(), this.propertyRows(), this.slotRows());
  }

  // ─── Entity → structural-shape mapping ──────────────────────────────────
  // Core's algorithms are dependency-free and take plain shapes, so the entity rows are projected
  // here (ids normalized once, so every downstream comparison is a plain string compare).

  /** Cached nodes projected to Core's structural node shape. */
  private nodeList(): ComponentTypeNode[] {
    return this.ComponentTypes.map((t) => ({
      ID: NormalizeUUID(t.ID),
      ParentID: t.ParentID ? NormalizeUUID(t.ParentID) : null,
      Name: t.Name,
      Kind: t.Kind,
      IsAbstract: t.IsAbstract,
      Trainable: t.Trainable,
      DriverClass: t.DriverClass,
      SpecSchema: t.SpecSchema,
      DefaultSpec: t.DefaultSpec,
      Story: t.Story,
      Status: t.Status,
    }));
  }

  /** Cached nodes as an id-keyed map (the shape both Core algorithms want). */
  private nodesById(): Map<string, ComponentTypeNode> {
    return new Map(this.nodeList().map((n) => [n.ID, n]));
  }

  /** Cached property rows projected to Core's structural shape. */
  private propertyRows(): ComponentTypePropertyRow[] {
    return this.ComponentTypeProperties.map((p) => ({
      ComponentTypeID: NormalizeUUID(p.ComponentTypeID),
      PropertyKey: p.PropertyKey,
      Operation: p.Operation,
      ItemKey: p.ItemKey,
      Value: p.Value,
      Sequence: p.Sequence,
      Rationale: p.Rationale,
    }));
  }

  /** Cached slot rows projected to Core's structural shape. */
  private slotRows(): ComponentTypeSlotRow[] {
    return this.ComponentTypeSlots.map((s) => ({
      ComponentTypeID: NormalizeUUID(s.ComponentTypeID),
      Name: s.Name,
      Description: s.Description,
      AcceptsComponentTypeID: NormalizeUUID(s.AcceptsComponentTypeID),
      MinCount: s.MinCount,
      MaxCount: s.MaxCount,
      DefaultComponentTypeID: s.DefaultComponentTypeID ? NormalizeUUID(s.DefaultComponentTypeID) : null,
      Sequence: s.Sequence,
    }));
  }
}
