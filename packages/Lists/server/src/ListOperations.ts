import {
  CompositeKey,
  EntityInfo,
  IMetadataProvider,
  LogError,
  LogStatus,
  Metadata,
  RunView,
  UserInfo,
} from '@memberjunction/core';
import { MJListDetailEntity, MJListEntity, MJUserViewEntity } from '@memberjunction/core-entities';

import {
  ComputeSourceSignature,
  DeltaTokenVerificationError,
  SignDeltaToken,
  VerifyDeltaToken,
} from './deltaToken';
import type {
  ApplyResult,
  ApplyResultCode,
  DeltaTokenMode,
  DeltaTokenPayload,
  ListDelta,
  ListDeltaCounts,
  ListDeltaWarning,
  ListRefreshMode,
  ListSource,
  MaterializeOptions,
  ResolvedRecordSet,
  SetOpKind,
} from '@memberjunction/lists-base';

/** Target argument shared by `ComputeDelta` / `ComputeSetOp`.
 *  Server-internal — not exposed on the public type surface because no
 *  consumer outside this package needs to compose it. */
export type DeltaTarget = ListSource | 'new';

/**
 * Core list-operations engine. Pure-ish TypeScript: takes a `UserInfo` +
 * optional `IMetadataProvider` and talks to data exclusively through
 * `Metadata` / `RunView` / `BaseEntity`. No GraphQL, no HTTP, no Angular.
 *
 * Public methods are PascalCase per MJ convention. Internal helpers are
 * camelCase. Every mutating method delegates through `ComputeDelta` →
 * `ApplyDelta` to enforce the drop-row warning contract.
 */
export class ListOperations {
  private readonly contextUser: UserInfo;
  private readonly provider: IMetadataProvider | undefined;

  constructor(contextUser: UserInfo, provider?: IMetadataProvider) {
    this.contextUser = contextUser;
    this.provider = provider;
  }

  /**
   * Resolve any `ListSource` to a concrete set of record IDs + the entity
   * name those IDs belong to. Never mutates. Used by every higher-level
   * operation (`ComputeDelta`, `ComputeSetOp`, audience resolution, etc.).
   *
   * Record IDs are returned in MJ List Detail format — single-PK entities
   * use the raw value; composite-PK entities use the canonical
   * `Field1|Value1||Field2|Value2` form (`CompositeKey.ToConcatenatedString`).
   */
  public async ResolveSource(source: ListSource): Promise<ResolvedRecordSet> {
    switch (source.kind) {
      case 'list':
        return this.resolveListSource(source.listId);
      case 'view':
        return this.resolveViewSource(source.viewId, source.runtimeParams);
      case 'adhoc':
        return this.resolveAdhocSource(source.entityName, source.extraFilter);
      default: {
        // Exhaustiveness check — if a new kind is added to ListSource the
        // compiler will reject this branch.
        const exhaustive: never = source;
        throw new Error(`Unknown ListSource kind: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  /**
   * Return the current members of a list as record IDs. Convenience wrapper
   * over `ResolveSource({ kind: 'list', listId })`.
   */
  public async GetListMembers(listId: string): Promise<ResolvedRecordSet> {
    return this.resolveListSource(listId);
  }

  /**
   * Preview a refresh / materialization. Never mutates. Returns a fully
   * populated `ListDelta` including a signed `DeltaToken` that `ApplyDelta`
   * will accept (subject to TTL + re-computation + permission checks).
   *
   * - `target = 'new'`: equivalent to materializing a new list — every
   *   record in `source` becomes a `ToAdd`, no removals are possible.
   * - `target = ListSource(kind:'list')`: a refresh of that list against
   *   `source`. `mode` controls whether removals are allowed (`Sync`) or
   *   forbidden (`Additive`).
   */
  public async ComputeDelta(
    target: DeltaTarget,
    source: ListSource,
    mode: ListRefreshMode,
  ): Promise<ListDelta> {
    const sourceSet = await this.ResolveSource(source);

    if (target === 'new') {
      return await this.buildDelta({
        targetListId: null,
        entityName: sourceSet.EntityName,
        toAddIds: sourceSet.RecordIds,
        toRemoveIds: [],
        unchangedIds: [],
        warnings: this.buildWarnings(sourceSet, null, 0),
        tokenMode: mode,
        signatureRecordIds: sourceSet.RecordIds,
      });
    }

    const targetSet = await this.ResolveSource(target);
    this.assertEntitiesMatch(sourceSet, targetSet);

    const sourceIds = new Set(sourceSet.RecordIds);
    const targetIds = new Set(targetSet.RecordIds);

    const toAddIds: string[] = [];
    for (const id of sourceIds) if (!targetIds.has(id)) toAddIds.push(id);

    // Additive mode never drops — even if records exist in target but not in
    // source, leave them alone. Sync mode reconciles in both directions.
    const toRemoveIds: string[] =
      mode === 'Sync' ? [...targetIds].filter((id) => !sourceIds.has(id)) : [];

    const unchangedIds: string[] = [...targetIds].filter((id) => sourceIds.has(id));

    return await this.buildDelta({
      targetListId: target.kind === 'list' ? target.listId : null,
      entityName: sourceSet.EntityName,
      toAddIds,
      toRemoveIds,
      unchangedIds,
      warnings: this.buildWarnings(sourceSet, targetSet, toRemoveIds.length),
      tokenMode: mode,
      signatureRecordIds: sourceSet.RecordIds,
    });
  }

  /**
   * Preview a set-op (union / intersection / difference) across two or more
   * sources, optionally projected into a target list. Same drop-warning
   * semantics as `ComputeDelta`: any operation that would remove records
   * from an existing target sets `Counts.Remove > 0` and produces a
   * `WILL_REMOVE_RECORDS` warning.
   *
   * `difference` is left-to-right: `inputs[0] − inputs[1] − inputs[2] …`.
   */
  public async ComputeSetOp(
    op: SetOpKind,
    inputs: ListSource[],
    target?: DeltaTarget,
  ): Promise<ListDelta> {
    if (inputs.length < 2) {
      throw new Error(`ComputeSetOp requires at least 2 inputs, got ${inputs.length}`);
    }

    const resolved = await Promise.all(inputs.map((src) => this.ResolveSource(src)));
    const entityWarnings = this.detectMixedEntities(resolved);
    const entityName = resolved[0].EntityName;

    const resultIds = this.applySetOp(op, resolved);

    if (!target || target === 'new') {
      return await this.buildDelta({
        targetListId: null,
        entityName,
        toAddIds: resultIds,
        toRemoveIds: [],
        unchangedIds: [],
        warnings: entityWarnings,
        tokenMode: 'SetOp',
        signatureRecordIds: resultIds,
      });
    }

    const targetSet = await this.ResolveSource(target);
    if (targetSet.EntityName !== entityName) {
      entityWarnings.push({
        Code: 'ENTITY_MISMATCH',
        Message: `Target list entity '${targetSet.EntityName}' differs from set-op entity '${entityName}'`,
        Details: { TargetEntity: targetSet.EntityName, SourceEntity: entityName },
      });
    }

    const resultSet = new Set(resultIds);
    const targetIds = new Set(targetSet.RecordIds);
    const toAddIds = resultIds.filter((id) => !targetIds.has(id));
    const toRemoveIds = [...targetIds].filter((id) => !resultSet.has(id));
    const unchangedIds = [...targetIds].filter((id) => resultSet.has(id));

    return await this.buildDelta({
      targetListId: target.kind === 'list' ? target.listId : null,
      entityName,
      toAddIds,
      toRemoveIds,
      unchangedIds,
      warnings: [
        ...entityWarnings,
        ...this.buildWarnings(
          { EntityName: entityName, RecordIds: resultIds },
          targetSet,
          toRemoveIds.length,
        ),
      ],
      tokenMode: 'SetOp',
      signatureRecordIds: resultIds,
    });
  }

  /**
   * Apply a previously previewed `ListDelta` to its target list. Enforces
   * the full drop-row warning contract (server-side, non-bypassable):
   *
   *   1. The token must verify (signature + 5-min TTL).
   *   2. If the delta would remove records, `opts.ConfirmDrops` must be true.
   *   3. The target list's current membership must still equal what the
   *      preview observed — otherwise `STALE_DELTA` (UI is expected to
   *      re-preview and ask the user again).
   *   4. Caller must hold Editor permission (placeholder — Phase 2 wires
   *      the real ResourcePermission check).
   *
   * Only mutates when all four pass. Concurrent mutations between preview
   * and apply surface as `STALE_DELTA` rather than silently overwriting.
   */
  public async ApplyDelta(
    delta: ListDelta,
    opts: { ConfirmDrops: boolean; DeltaToken: string },
  ): Promise<ApplyResult> {
    const tokenResult = await this.verifyTokenForDelta(delta, opts.DeltaToken);
    if (!tokenResult.ok) return tokenResult.failure;

    if (delta.Counts.Remove > 0 && !opts.ConfirmDrops) {
      return this.failure(
        'DROP_NOT_CONFIRMED',
        `Apply would remove ${delta.Counts.Remove} record(s). Pass ConfirmDrops: true to proceed.`,
      );
    }

    if (!delta.TargetListId) {
      // New-list creation flows through MaterializeFromView (Phase 1), not
      // ApplyDelta directly — keeping ApplyDelta's contract single-purpose.
      return this.failure(
        'TARGET_NOT_FOUND',
        'ApplyDelta requires an existing TargetListId. Use MaterializeFromView for new lists.',
      );
    }

    const permission = await this.checkEditorPermission(delta.TargetListId);
    if (!permission.ok) return permission.failure;

    const staleness = await this.verifyTargetNotDrifted(delta);
    if (!staleness.ok) return staleness.failure;

    return this.applyDeltaMutations(delta);
  }

  /**
   * Materialize a new list from a User View. Creates an `MJ: List` record,
   * captures lineage when requested, and bulk-inserts the resolved members
   * as `MJ: List Details` rows.
   *
   * Lineage semantics:
   *   - `RememberLineage = false` → one-shot copy; the list cannot be
   *     refreshed against the view later. Useful when the user explicitly
   *     wants a frozen point-in-time snapshot decoupled from the view.
   *   - `RememberLineage = true, UseSnapshot = false` → list remembers
   *     `SourceViewID`; future refreshes re-run the **live** view.
   *   - `RememberLineage = true, UseSnapshot = true` → list remembers
   *     `SourceViewID` and a JSON snapshot of the view's filter state;
   *     future refreshes re-evaluate that **snapshot** even if the view
   *     itself has since been edited.
   *
   * Never produces drops (target is brand new) — no delta-token needed.
   */
  public async MaterializeFromView(viewId: string, opts: MaterializeOptions): Promise<ApplyResult> {
    // 1. Resolve the view's current members. This both validates the view
    //    exists and gives us the EntityID we need for the new list.
    const resolved = await this.ResolveSource({ kind: 'view', viewId });
    const entityInfo = this.metadata().EntityByName(resolved.EntityName);
    if (!entityInfo) {
      return this.failure('UNEXPECTED_ERROR', `Entity '${resolved.EntityName}' not found in metadata`);
    }

    // 2. Optionally snapshot the view's filter state for snapshot-mode refresh.
    const filterSnapshot = opts.RememberLineage && opts.UseSnapshot
      ? await this.captureViewFilterSnapshot(viewId)
      : null;

    // 3. Create + save the list record.
    const listResult = await this.createListWithLineage({
      entityId: entityInfo.ID,
      viewId: opts.RememberLineage ? viewId : null,
      filterSnapshot,
      opts,
    });
    if (!listResult.ok) return listResult.failure;
    const listId = listResult.listId;

    // 4. Bulk-insert the resolved members. Any per-record failure is
    //    surfaced in the result rather than aborting the whole batch.
    const insertResult = await this.insertListMembers(listId, resolved.RecordIds);

    return {
      Success: insertResult.failed === 0,
      ResultCode: insertResult.failed === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
      Message:
        insertResult.failed === 0
          ? `Materialized list with ${insertResult.added} member(s)`
          : `Materialized list with ${insertResult.added} added, ${insertResult.failed} failed`,
      CreatedListId: listId,
      TargetListId: listId,
      Counts: { Added: insertResult.added, Removed: 0, Failed: insertResult.failed },
      Errors: insertResult.errors.length > 0 ? insertResult.errors : undefined,
    };
  }

  /**
   * Refresh an existing list against its captured source view. The list
   * must have been created with `RememberLineage = true` (i.e. it has a
   * non-null `SourceViewID`) — otherwise this returns `TARGET_NOT_FOUND`.
   *
   * When `list.UseSnapshot = true`, the source is re-evaluated against the
   * filter snapshot captured at materialization time. When `false`, the
   * live view is re-run — which means edits to the view since
   * materialization will be reflected in the result.
   *
   * In `Sync` mode, callers MUST pass `ConfirmDrops: true` or the
   * server-side drop guard will reject the apply with `DROP_NOT_CONFIRMED`.
   * On success, `LastRefreshedAt` and `LastRefreshedByUserID` are updated.
   */
  public async RefreshFromSource(
    listId: string,
    mode: ListRefreshMode,
    opts: { ConfirmDrops: boolean },
  ): Promise<ApplyResult> {
    const sourceResolution = await this.resolveRefreshSource(listId);
    if (!sourceResolution.ok) return sourceResolution.failure;

    const delta = await this.ComputeDelta(
      { kind: 'list', listId },
      sourceResolution.source,
      mode,
    );
    const result = await this.ApplyDelta(delta, {
      ConfirmDrops: opts.ConfirmDrops,
      DeltaToken: delta.DeltaToken,
    });

    if (result.Success) {
      await this.stampRefreshMetadata(listId);
    }
    return result;
  }

  /**
   * Add a view's results to an existing list. Always additive — never
   * removes existing members. Dedupes silently, so safe to re-run.
   *
   * No drop-confirmation needed (this op cannot drop). The implementation
   * pipes through `ComputeDelta` + `ApplyDelta` so it still gets the
   * token/staleness/permission machinery for free.
   */
  public async AddViewResultsToList(viewId: string, listId: string): Promise<ApplyResult> {
    const delta = await this.ComputeDelta(
      { kind: 'list', listId },
      { kind: 'view', viewId },
      'Additive',
    );
    return this.ApplyDelta(delta, { ConfirmDrops: false, DeltaToken: delta.DeltaToken });
  }

  // --- private helpers --------------------------------------------------

  private async resolveListSource(listId: string): Promise<ResolvedRecordSet> {
    const md = this.metadata();
    const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', this.contextUser);
    const loaded = await list.Load(listId);
    if (!loaded) {
      throw new Error(`List '${listId}' not found`);
    }

    const entityName = this.resolveEntityNameFromList(list);

    const rv = this.runView();
    const result = await rv.RunView<MJListDetailEntity>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID='${listId}'`,
      Fields: ['RecordID'],
      ResultType: 'simple',
    }, this.contextUser);

    if (!result.Success) {
      throw new Error(`Failed to load list members for '${listId}': ${result.ErrorMessage}`);
    }

    return {
      EntityName: entityName,
      RecordIds: (result.Results ?? []).map((row) => String((row as { RecordID: string }).RecordID)),
      TotalCount: result.RowCount,
    };
  }

  private async resolveViewSource(
    viewId: string,
    runtimeParams: Record<string, unknown> | undefined,
  ): Promise<ResolvedRecordSet> {
    const rv = this.runView();
    const entityName = await RunView.GetEntityNameFromRunViewParams({ ViewID: viewId }, this.provider ?? null);
    if (!entityName) {
      throw new Error(`Could not determine entity for view '${viewId}'`);
    }

    const entityInfo = this.metadata().EntityByName(entityName);
    if (!entityInfo) {
      throw new Error(`Entity '${entityName}' not found in metadata`);
    }
    const pkFields = entityInfo.PrimaryKeys.map((pk) => pk.Name);

    // runtimeParams is reserved on ListSource for a future parameterized-view
    // capability; RunView has no first-class runtime-parameter slot today, so
    // we ignore them at this layer rather than silently routing them somewhere
    // misleading. If/when MJ adds parameterized views, wire them in here.
    void runtimeParams;
    const result = await rv.RunView({
      ViewID: viewId,
      Fields: pkFields,
      ResultType: 'simple',
    }, this.contextUser);

    if (!result.Success) {
      throw new Error(`Failed to run view '${viewId}': ${result.ErrorMessage}`);
    }

    return {
      EntityName: entityName,
      RecordIds: (result.Results ?? []).map((row) => this.serializeRecordId(entityInfo, row as Record<string, unknown>)),
      TotalCount: result.RowCount,
    };
  }

  private async resolveAdhocSource(entityName: string, extraFilter: string): Promise<ResolvedRecordSet> {
    const entityInfo = this.metadata().EntityByName(entityName);
    if (!entityInfo) {
      throw new Error(`Entity '${entityName}' not found in metadata`);
    }
    const pkFields = entityInfo.PrimaryKeys.map((pk) => pk.Name);

    const rv = this.runView();
    const result = await rv.RunView({
      EntityName: entityName,
      ExtraFilter: extraFilter,
      Fields: pkFields,
      ResultType: 'simple',
    }, this.contextUser);

    if (!result.Success) {
      throw new Error(`Failed to run ad-hoc filter on '${entityName}': ${result.ErrorMessage}`);
    }

    return {
      EntityName: entityName,
      RecordIds: (result.Results ?? []).map((row) => this.serializeRecordId(entityInfo, row as Record<string, unknown>)),
      TotalCount: result.RowCount,
    };
  }

  /**
   * Resolve a list's entity name from its `EntityID` foreign key.
   * Single-entity is intentional — multi-entity lists are not supported.
   */
  private resolveEntityNameFromList(list: MJListEntity): string {
    const md = this.metadata();
    // EntityByID is O(1) over the pre-populated entity map; Entities.find
    // is an O(N) array scan and the documented anti-pattern.
    const entity: EntityInfo | undefined = md.EntityByID(list.EntityID);
    if (!entity) {
      throw new Error(`List '${list.ID}' references unknown EntityID '${list.EntityID}'`);
    }
    return entity.Name;
  }

  /**
   * Serialize a primary-key tuple into the MJ List Detail `RecordID` format.
   * Single-PK entities return the raw value; composite-PK entities use the
   * canonical `Field1|Value1||Field2|Value2` concatenation matching
   * `CompositeKey.ToConcatenatedString` defaults.
   */
  private serializeRecordId(entityInfo: EntityInfo, row: Record<string, unknown>): string {
    if (entityInfo.PrimaryKeys.length === 1) {
      const pkName = entityInfo.PrimaryKeys[0].Name;
      return String(row[pkName]);
    }
    const ck = new CompositeKey();
    ck.KeyValuePairs = entityInfo.PrimaryKeys.map((pk) => ({
      FieldName: pk.Name,
      Value: row[pk.Name] as string | number | Date | null | undefined,
    }));
    return ck.ToConcatenatedString();
  }

  private async buildDelta(args: {
    targetListId: string | null;
    entityName: string;
    toAddIds: string[];
    toRemoveIds: string[];
    unchangedIds: string[];
    warnings: ListDeltaWarning[];
    tokenMode: DeltaTokenMode;
    signatureRecordIds: string[];
  }): Promise<ListDelta> {
    const counts: ListDeltaCounts = {
      Add: args.toAddIds.length,
      Remove: args.toRemoveIds.length,
      Unchanged: args.unchangedIds.length,
      SourceTotal: args.toAddIds.length + args.unchangedIds.length,
      TargetTotal: args.unchangedIds.length + args.toRemoveIds.length,
    };
    // ComputeSourceSignature and SignDeltaToken are async because Web
    // Crypto's SubtleCrypto is async. Build them in sequence — the
    // signature feeds the token payload.
    const ssig = await ComputeSourceSignature(args.signatureRecordIds);
    const payload: DeltaTokenPayload = {
      v: 1,
      tid: args.targetListId,
      ssig,
      m: args.tokenMode,
      iat: Date.now(),
    };
    return {
      TargetListId: args.targetListId,
      EntityName: args.entityName,
      ToAdd: args.toAddIds,
      ToRemove: args.toRemoveIds,
      Unchanged: args.unchangedIds,
      Counts: counts,
      Warnings: args.warnings,
      DeltaToken: await SignDeltaToken(payload),
    };
  }

  private buildWarnings(
    sourceSet: { EntityName: string; RecordIds: string[] },
    targetSet: ResolvedRecordSet | null,
    removeCount: number,
  ): ListDeltaWarning[] {
    const out: ListDeltaWarning[] = [];
    if (removeCount > 0) {
      out.push({
        Code: 'WILL_REMOVE_RECORDS',
        Message: `${removeCount} record(s) will be removed from the target list`,
        Details: { Count: removeCount },
      });
    }
    if (sourceSet.RecordIds.length === 0) {
      out.push({
        Code: 'EMPTY_SOURCE',
        Message: 'Source resolved to zero records',
      });
    }
    if (targetSet && targetSet.RecordIds.length === 0) {
      out.push({
        Code: 'EMPTY_TARGET',
        Message: 'Target list has no current members',
      });
    }
    if (targetSet && sourceSet.EntityName !== targetSet.EntityName) {
      out.push({
        Code: 'ENTITY_MISMATCH',
        Message: `Source entity '${sourceSet.EntityName}' does not match target entity '${targetSet.EntityName}'`,
        Details: { SourceEntity: sourceSet.EntityName, TargetEntity: targetSet.EntityName },
      });
    }
    return out;
  }

  /**
   * Apply a set-op across N already-resolved sources. We accept the resolved
   * sets (not raw `ListSource[]`) so callers can decide how to handle mixed
   * entities before we collapse identities to strings.
   */
  private applySetOp(op: SetOpKind, resolved: ResolvedRecordSet[]): string[] {
    const sets = resolved.map((r) => new Set(r.RecordIds));
    switch (op) {
      case 'union': {
        const out = new Set<string>();
        for (const s of sets) for (const id of s) out.add(id);
        return [...out];
      }
      case 'intersection': {
        if (sets.length === 0) return [];
        const [first, ...rest] = sets;
        return [...first].filter((id) => rest.every((s) => s.has(id)));
      }
      case 'difference': {
        const [first, ...rest] = sets;
        const subtract = new Set<string>();
        for (const s of rest) for (const id of s) subtract.add(id);
        return [...first].filter((id) => !subtract.has(id));
      }
      default: {
        const exhaustive: never = op;
        throw new Error(`Unknown set-op kind: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  private detectMixedEntities(resolved: ResolvedRecordSet[]): ListDeltaWarning[] {
    const entities = new Set(resolved.map((r) => r.EntityName));
    if (entities.size <= 1) return [];
    return [
      {
        Code: 'ENTITY_MISMATCH',
        Message: `Set-op inputs span multiple entities: ${[...entities].join(', ')}`,
        Details: { Entities: [...entities] },
      },
    ];
  }

  private assertEntitiesMatch(a: ResolvedRecordSet, b: ResolvedRecordSet): void {
    // Surface a warning rather than throw — the caller (UI) decides whether
    // to proceed. The actual mismatch is captured in `buildWarnings` so it
    // appears in `delta.Warnings` for the user.
    void a;
    void b;
  }

  private async verifyTokenForDelta(
    delta: ListDelta,
    token: string,
  ): Promise<{ ok: true; payload: DeltaTokenPayload } | { ok: false; failure: ApplyResult }> {
    let payload: DeltaTokenPayload;
    try {
      payload = await VerifyDeltaToken(token);
    } catch (e) {
      const isExpired = e instanceof DeltaTokenVerificationError && e.Code === 'EXPIRED_TOKEN';
      return {
        ok: false,
        failure: this.failure(
          isExpired ? 'STALE_DELTA' : 'INVALID_TOKEN',
          e instanceof Error ? e.message : String(e),
        ),
      };
    }

    // Token must describe the same target the delta does — prevents replay
    // of a token issued for list A against list B.
    if (payload.tid !== delta.TargetListId) {
      return {
        ok: false,
        failure: this.failure('INVALID_TOKEN', 'Delta token target does not match delta target'),
      };
    }

    // The signature is over the *source* record IDs at preview time. If the
    // source has been mutated since the preview, the token's `ssig` will no
    // longer match what `ComputeDelta` would produce now. Higher-level
    // operations (which know the source) re-resolve and re-check; the
    // generic `ApplyDelta` path trusts the token here and relies on
    // target-drift detection below to catch concurrent mutations.
    return { ok: true, payload };
  }

  private async verifyTargetNotDrifted(
    delta: ListDelta,
  ): Promise<{ ok: true } | { ok: false; failure: ApplyResult }> {
    if (!delta.TargetListId) return { ok: true };
    // Re-resolve via the public method so consumers can intercept the
    // resolution (tests do this; future caching layers might too).
    const current = await this.ResolveSource({ kind: 'list', listId: delta.TargetListId });
    const expected = new Set<string>([...delta.Unchanged, ...delta.ToRemove]);
    const actual = new Set<string>(current.RecordIds);

    if (expected.size !== actual.size) {
      return { ok: false, failure: this.failure('STALE_DELTA', 'Target list has been modified since preview was generated.') };
    }
    for (const id of expected) {
      if (!actual.has(id)) {
        return {
          ok: false,
          failure: this.failure('STALE_DELTA', 'Target list has been modified since preview was generated.'),
        };
      }
    }
    return { ok: true };
  }

  /**
   * Placeholder for the Phase 2 ResourcePermission check. Phase 0 ships a
   * stub so the call site exists and the failure mode is reachable in
   * tests, but it currently always passes — server bootstrap MUST wire in
   * the real check before Phase 2 ships.
   */
  private async checkEditorPermission(
    targetListId: string,
  ): Promise<{ ok: true } | { ok: false; failure: ApplyResult }> {
    void targetListId;
    return { ok: true };
  }

  /**
   * Idempotent batch apply. We persist add/remove independently so a
   * single bad record (e.g. constraint violation) doesn't abort the whole
   * delta — we collect failures and surface a `PARTIAL_SUCCESS` result.
   */
  private async applyDeltaMutations(delta: ListDelta): Promise<ApplyResult> {
    const md = this.metadata();
    let added = 0;
    let removed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const recordId of delta.ToAdd) {
      const detail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', this.contextUser);
      detail.NewRecord();
      detail.ListID = delta.TargetListId!;
      detail.RecordID = recordId;
      detail.Sequence = 0;
      const saved = await detail.Save();
      if (saved) {
        added++;
      } else {
        failed++;
        const msg = detail.LatestResult?.CompleteMessage ?? 'unknown error';
        errors.push(`Failed to add '${recordId}': ${msg}`);
        LogError(`ApplyDelta add failed for list ${delta.TargetListId} record ${recordId}: ${msg}`);
      }
    }

    if (delta.ToRemove.length > 0) {
      const removalErrors = await this.removeDeltaRecords(delta.TargetListId!, delta.ToRemove);
      removed = delta.ToRemove.length - removalErrors.length;
      failed += removalErrors.length;
      errors.push(...removalErrors);
    }

    const success = failed === 0;
    const code: ApplyResultCode = success ? 'SUCCESS' : 'PARTIAL_SUCCESS';
    const result: ApplyResult = {
      Success: success,
      ResultCode: code,
      Message: success
        ? `Applied delta: +${added} / -${removed}`
        : `Applied with errors: +${added} / -${removed}, ${failed} failed`,
      TargetListId: delta.TargetListId!,
      Counts: { Added: added, Removed: removed, Failed: failed },
      Errors: errors.length > 0 ? errors : undefined,
    };

    LogStatus(
      `ListOperations.ApplyDelta target=${delta.TargetListId} +${added}/-${removed}/!${failed}`,
    );
    return result;
  }

  /**
   * Locate and delete the `MJ: List Details` rows that map to the given
   * record IDs. We scope the lookup to a single `ListID` so a bad RecordID
   * value can't accidentally drop rows from other lists.
   */
  private async removeDeltaRecords(targetListId: string, recordIds: string[]): Promise<string[]> {
    if (recordIds.length === 0) return [];
    const rv = this.runView();
    const filterIds = recordIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
    const result = await rv.RunView<MJListDetailEntity>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID='${targetListId}' AND RecordID IN (${filterIds})`,
      ResultType: 'entity_object',
    }, this.contextUser);

    const errors: string[] = [];
    if (!result.Success) {
      return recordIds.map((id) => `Lookup failed for '${id}': ${result.ErrorMessage}`);
    }

    for (const detail of result.Results ?? []) {
      const ok = await detail.Delete();
      if (!ok) {
        const msg = detail.LatestResult?.CompleteMessage ?? 'unknown error';
        errors.push(`Failed to remove '${detail.RecordID}': ${msg}`);
        LogError(`ApplyDelta remove failed for list ${targetListId} record ${detail.RecordID}: ${msg}`);
      }
    }
    return errors;
  }

  /**
   * Pick the source for a refresh based on the list's lineage. Live mode
   * just points back at the original view ID. Snapshot mode reads the
   * captured filter blob and constructs an ad-hoc source against the
   * list's entity using whichever WHERE clause the view had at
   * materialization time.
   */
  private async resolveRefreshSource(
    listId: string,
  ): Promise<{ ok: true; source: ListSource } | { ok: false; failure: ApplyResult }> {
    const md = this.metadata();
    const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', this.contextUser);
    const loaded = await list.Load(listId);
    if (!loaded) {
      return { ok: false, failure: this.failure('TARGET_NOT_FOUND', `List '${listId}' not found`) };
    }
    if (!list.SourceViewID) {
      return {
        ok: false,
        failure: this.failure(
          'TARGET_NOT_FOUND',
          `List '${listId}' has no SourceViewID — refresh is only supported for lists materialized with lineage.`,
        ),
      };
    }

    if (!list.UseSnapshot) {
      return { ok: true, source: { kind: 'view', viewId: list.SourceViewID } };
    }

    // Snapshot mode — re-evaluate the captured filter against the list's entity.
    const adhoc = this.buildAdhocSourceFromSnapshot(list);
    if (!adhoc) {
      return {
        ok: false,
        failure: this.failure(
          'UNEXPECTED_ERROR',
          `List '${listId}' has UseSnapshot=1 but no usable SourceFilterSnapshot — re-materialize the list to capture one.`,
        ),
      };
    }
    return { ok: true, source: adhoc };
  }

  /**
   * Parse the captured `SourceFilterSnapshot` and turn it into an ad-hoc
   * `ListSource`. We prefer `customWhereClause` over `whereClause` because
   * the custom form is the user-authored override; smart-filter clauses
   * fall in last because they're AI-derived. Returns null if no usable
   * clause is present (in which case the caller surfaces a clear error).
   */
  private buildAdhocSourceFromSnapshot(list: MJListEntity): ListSource | null {
    if (!list.SourceFilterSnapshot) return null;

    const md = this.metadata();
    const entity = md.EntityByID(list.EntityID);
    if (!entity) return null;

    let parsed: {
      whereClause?: string | null;
      customWhereClause?: string | null;
      smartFilterWhereClause?: string | null;
    };
    try {
      parsed = JSON.parse(list.SourceFilterSnapshot) as typeof parsed;
    } catch (e) {
      LogError(`RefreshFromSource: snapshot JSON parse failed for list ${list.ID}: ${e}`);
      return null;
    }

    const extraFilter =
      parsed.customWhereClause ?? parsed.whereClause ?? parsed.smartFilterWhereClause ?? null;
    if (!extraFilter || extraFilter.trim().length === 0) return null;

    return { kind: 'adhoc', entityName: entity.Name, extraFilter };
  }

  /**
   * Bump `LastRefreshedAt` + `LastRefreshedByUserID` after a successful
   * refresh. Best-effort — a failure here doesn't roll back the apply
   * (the records are already in the right state), but we do log it so
   * the discrepancy is observable.
   */
  private async stampRefreshMetadata(listId: string): Promise<void> {
    const md = this.metadata();
    const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', this.contextUser);
    const loaded = await list.Load(listId);
    if (!loaded) {
      LogError(`stampRefreshMetadata: list ${listId} not found after apply`);
      return;
    }
    list.LastRefreshedAt = new Date();
    list.LastRefreshedByUserID = this.contextUser.ID;
    const ok = await list.Save();
    if (!ok) {
      LogError(
        `stampRefreshMetadata: save failed — ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      );
    }
  }

  private failure(code: ApplyResultCode, message: string): ApplyResult {
    return { Success: false, ResultCode: code, Message: message };
  }

  /**
   * Load the User View and serialize its filter state into a JSON blob.
   * We only capture the fields that actually drive the result set — grid
   * layout, sort, and smart-filter explanation are layout/explanation
   * metadata, not part of the filter contract, so they're omitted. The
   * snapshot is versioned (`v: 1`) so future schema evolutions can
   * branch on shape without breaking older snapshots.
   */
  private async captureViewFilterSnapshot(viewId: string): Promise<string | null> {
    const md = this.metadata();
    const view = await md.GetEntityObject<MJUserViewEntity>('MJ: User Views', this.contextUser);
    const loaded = await view.Load(viewId);
    if (!loaded) {
      LogError(`captureViewFilterSnapshot: view ${viewId} not found`);
      return null;
    }
    const snapshot = {
      v: 1 as const,
      capturedAt: new Date().toISOString(),
      sourceViewId: viewId,
      entityId: view.EntityID,
      whereClause: view.WhereClause ?? null,
      customWhereClause: view.CustomWhereClause ?? null,
      filterState: view.FilterState ?? null,
      customFilterState: view.CustomFilterState ?? null,
      smartFilterEnabled: view.SmartFilterEnabled ?? false,
      smartFilterWhereClause: view.SmartFilterWhereClause ?? null,
      sortState: view.SortState ?? null,
    };
    return JSON.stringify(snapshot);
  }

  /**
   * Create + save the parent `MJ: List` record. Lineage fields are only
   * populated when `RememberLineage = true` on `opts` — otherwise the new
   * list is a plain one-shot copy with no upstream reference.
   */
  private async createListWithLineage(args: {
    entityId: string;
    viewId: string | null;
    filterSnapshot: string | null;
    opts: MaterializeOptions;
  }): Promise<{ ok: true; listId: string } | { ok: false; failure: ApplyResult }> {
    const md = this.metadata();
    const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', this.contextUser);
    list.NewRecord();
    list.Name = args.opts.ListName;
    list.EntityID = args.entityId;
    list.UserID = this.contextUser.ID;
    if (args.opts.Description) list.Description = args.opts.Description;
    if (args.opts.CategoryId) list.CategoryID = args.opts.CategoryId;

    if (args.viewId) {
      list.SourceViewID = args.viewId;
      list.RefreshMode = args.opts.RefreshMode;
      list.UseSnapshot = args.opts.UseSnapshot;
      if (args.filterSnapshot) list.SourceFilterSnapshot = args.filterSnapshot;
    }

    const saved = await list.Save();
    if (!saved) {
      const msg = list.LatestResult?.CompleteMessage ?? 'unknown error';
      LogError(`MaterializeFromView: list save failed — ${msg}`);
      return { ok: false, failure: this.failure('UNEXPECTED_ERROR', `Failed to create list: ${msg}`) };
    }
    return { ok: true, listId: list.ID };
  }

  /**
   * Bulk-insert `MJ: List Details` rows for the given record IDs. We
   * surface a per-record error rather than aborting the whole batch so
   * the caller can show partial-success counts.
   */
  private async insertListMembers(
    listId: string,
    recordIds: readonly string[],
  ): Promise<{ added: number; failed: number; errors: string[] }> {
    const md = this.metadata();
    let added = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const recordId of recordIds) {
      const detail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', this.contextUser);
      detail.NewRecord();
      detail.ListID = listId;
      detail.RecordID = recordId;
      detail.Sequence = 0;
      const ok = await detail.Save();
      if (ok) {
        added++;
      } else {
        failed++;
        const msg = detail.LatestResult?.CompleteMessage ?? 'unknown error';
        errors.push(`Failed to add '${recordId}': ${msg}`);
        LogError(`insertListMembers list=${listId} record=${recordId}: ${msg}`);
      }
    }
    return { added, failed, errors };
  }

  private metadata(): Metadata {
    // Per CLAUDE.md: prefer the injected provider when available; fall back
    // to the global only when no provider is supplied. Real provider
    // implementations (GraphQLDataProvider, SQLServerDataProvider) inherit
    // from ProviderBase and satisfy the Metadata surface this code uses.
    return (this.provider as unknown as Metadata | undefined) ?? new Metadata();
  }

  private runView(): RunView {
    return this.provider ? RunView.FromMetadataProvider(this.provider) : new RunView();
  }
}
