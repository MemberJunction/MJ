/**
 * @module agent/build-approval-claims
 *
 * `BuildApprovalClaims` — consuming an approval is an atomic claim made before the build is dispatched (D5-23). `Claim`
 * inserts one `MJ: ML Build Approval Claims` row for the request; the unique index on `AgentRequestID` (migration
 * section A2) is the arbiter, as PR 4's `TrainingClaims` makes the committed run row the claim: of two concurrent claims
 * one inserts, the other's save fails and it re-reads the row by `AgentRequestID` (`consumed`). No error text is parsed.
 * Only the run holding the claim dispatches the Pipeline Builder; `Settle` records `built` or `failed` and the pipeline.
 * A crash mid-build leaves the row `claimed`, so the approval is consumed and the next turn reports the build did not
 * finish (once the claiming run is not live, D5-38).
 *
 * The claim guard (`Register`): a `PreSave` and a `PreDelete` hook through `PreSaveHookRegistration` refuse every
 * create, update and delete of a claim row that is not `Claim`'s or `Settle`'s own authorised save
 * (`BuildApprovalClaimWriteAuthorisations`, instance-keyed).
 */
import { RunView, type BaseEntity, type IMetadataProvider, type PreDeleteHook, type PreSaveHook, type UserInfo } from '@memberjunction/core';
import { MJMLBuildApprovalClaimEntity, type MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type { BuildApproval } from '@memberjunction/predictive-studio-core';

import { PreSaveHookRegistration } from '../registry/pre-save-hook-registration';
import { BuildApprovalClaimWriteAuthorisations } from './build-approval-claim-write-authorisations';

/** A claim taken, or the claim that already consumed the approval. */
export type BuildApprovalClaimResult =
  | { readonly Claimed: true; readonly ClaimID: string }
  | { readonly kind: 'consumed'; readonly claimId: string };  // case-violation-ok-legacy-back-compat: the BuildApprovalRefusal 'consumed' JSON shape

/** The outcome `Settle` records. */
export type BuildApprovalClaimSettlement = Extract<MJMLBuildApprovalClaimEntity['Outcome'], 'built' | 'failed'>;

/** The claim row's columns a read returns. */
type ClaimRow = Pick<MJMLBuildApprovalClaimEntity, 'ID' | 'AgentRequestID' | 'ClaimingAgentRunID' | 'PlanHash' | 'Outcome' | 'MLTrainingPipelineID'>;

/** Set once this copy of the module has registered (or found) its hooks. */
let registered = false;

/** The approval claim: taking it, settling it, reading it, and the guard on its rows. */
export class BuildApprovalClaims {
  /** The entity the claim rows live in (CodeGen's name for `__mj.MLBuildApprovalClaim`, recorded in §9 D5-A2-2). */
  public static readonly EntityName = 'MJ: ML Build Approval Claims';
  /** The global mark the registered `PreSave` hook carries. */
  public static readonly HookMark: symbol = Symbol.for('@memberjunction/predictive-studio:build-approval-claim-guard');
  /** The global mark the registered `PreDelete` hook carries. */
  public static readonly DeleteHookMark: symbol = Symbol.for('@memberjunction/predictive-studio:build-approval-claim-delete-guard');

  /**
   * Claims the approved request for `runId`: one new row, `Outcome = 'claimed'`. When the request is already claimed (the
   * insert fails on the unique index) the existing claim is returned as `consumed`.
   *
   * @throws Error when the insert fails and no claim of the request exists (a database or permission failure)
   */
  public static async Claim(requestId: string, runId: string, planHash: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<BuildApprovalClaimResult> {
    const existing = await BuildApprovalClaims.ForRequest(requestId, provider, contextUser);
    if (existing) return { kind: 'consumed', claimId: existing.ID };
    const row = await provider.GetEntityObject<MJMLBuildApprovalClaimEntity>(BuildApprovalClaims.EntityName, contextUser);
    row.NewRecord();
    row.AgentRequestID = requestId;
    row.ClaimingAgentRunID = runId;
    row.PlanHash = planHash;
    row.Outcome = 'claimed';
    row.MLTrainingPipelineID = null;
    if (await BuildApprovalClaimWriteAuthorisations.SaveAuthorised(row, 'claim')) return { Claimed: true, ClaimID: row.ID };
    const winner = await BuildApprovalClaims.ForRequest(requestId, provider, contextUser);
    if (winner) return { kind: 'consumed', claimId: winner.ID };
    throw new Error(`Predictive Studio: the build approval claim of request ${requestId} could not be saved: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  /**
   * Records the build's outcome on a `claimed` claim, once.
   *
   * @throws Error when the claim is missing, already settled, or its save fails
   */
  public static async Settle(claimId: string, outcome: BuildApprovalClaimSettlement, pipelineId: string | null, provider: IMetadataProvider, contextUser: UserInfo): Promise<void> {
    const row = await provider.GetEntityObject<MJMLBuildApprovalClaimEntity>(BuildApprovalClaims.EntityName, contextUser);
    if (!(await row.Load(claimId))) throw new Error(`Predictive Studio: build approval claim ${claimId} was not found, so its outcome cannot be recorded`);
    if (row.Outcome !== 'claimed') throw new Error(`Predictive Studio: build approval claim ${claimId} is already settled (${row.Outcome})`);
    row.Outcome = outcome;
    row.MLTrainingPipelineID = pipelineId;
    if (!(await BuildApprovalClaimWriteAuthorisations.SaveAuthorised(row, 'settle'))) {
      throw new Error(`Predictive Studio: the outcome of build approval claim ${claimId} could not be saved: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
  }

  /** The claim of `requestId`, read from the database (not a cache), or null when the request is unclaimed. */
  public static async ForRequest(requestId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<ClaimRow | null> {
    const result = await RunView.FromMetadataProvider(provider).RunView<ClaimRow>({
      EntityName: BuildApprovalClaims.EntityName,
      ExtraFilter: `AgentRequestID='${EscapeSQLString(requestId)}'`,
      Fields: ['ID', 'AgentRequestID', 'ClaimingAgentRunID', 'PlanHash', 'Outcome', 'MLTrainingPipelineID'],
      ResultType: 'simple',
      MaxRows: 1,
      BypassCache: true,
    }, contextUser);
    if (!result.Success) throw new Error(`Predictive Studio: reading the build approval claim of request ${requestId} failed: ${result.ErrorMessage || 'unknown error'}`);
    return result.Results[0] ?? null;
  }

  /**
   * The approval a Pipeline Builder run holds: the `claimed` claim `claimId` names, taken by the builder's parent run
   * (`parentRunId`) for the plan the builder was handed (`planHash`), with the person and time its request's answer
   * recorded. Null when any of those does not hold; the builder then refuses (D-090 through the claim, never the payload).
   */
  public static async HeldApproval(claimId: string, parentRunId: string, planHash: string, planId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<BuildApproval | null> {
    const claim = await provider.GetEntityObject<MJMLBuildApprovalClaimEntity>(BuildApprovalClaims.EntityName, contextUser);
    if (!(await claim.Load(claimId))) return null;
    if (claim.Outcome !== 'claimed' || !UUIDsEqual(claim.ClaimingAgentRunID, parentRunId) || claim.PlanHash !== planHash) return null;
    const request = await provider.GetEntityObject<MJAIAgentRequestEntity>('MJ: AI Agent Requests', contextUser);
    if (!(await request.Load(claim.AgentRequestID)) || !request.ResponseByUserID || request.Status !== 'Approved') return null;
    return {
      planId, planHash: claim.PlanHash, approvedBy: { kind: 'human', userId: request.ResponseByUserID },
      conversationDetailId: null, approvedAt: (request.RespondedAt ?? claim.ClaimedAt).toISOString(), requestId: claim.AgentRequestID,
    };
  }

  /** Registers the claim guard's `PreSave` and `PreDelete` hooks once per process. */
  public static Register(): void {
    if (registered) return;
    registered = true;
    const save: PreSaveHook = (entity) => BuildApprovalClaims.CheckSave(entity);
    const del: PreDeleteHook = (entity) => BuildApprovalClaims.CheckDelete(entity);
    PreSaveHookRegistration.RegisterOnce(BuildApprovalClaims.HookMark, save);
    PreSaveHookRegistration.RegisterPreDeleteOnce(BuildApprovalClaims.DeleteHookMark, del);
  }

  /**
   * The `PreSave` hook's body: `true` for an authorised save (and for every other entity), else the refusal. A new row
   * needs `Claim`'s authorisation and an unsettled outcome; a saved row needs `Settle`'s, and may change only `Outcome`
   * (from `claimed` to `built` or `failed`) and `MLTrainingPipelineID`.
   */
  public static CheckSave(entity: BaseEntity): boolean | string {
    if (entity.EntityInfo?.Name !== BuildApprovalClaims.EntityName) return true;
    if (!(entity instanceof MJMLBuildApprovalClaimEntity)) return BuildApprovalClaims.refusal('(unknown)', 'the entity object is not an MJMLBuildApprovalClaimEntity, so its writer cannot be checked');
    const write = BuildApprovalClaimWriteAuthorisations.Instance.Take(entity);
    if (!entity.IsSaved) {
      if (write !== 'claim') return BuildApprovalClaims.refusal('(new)', 'a claim is taken only by BuildApprovalClaims.Claim, never by a direct save');
      if (entity.Outcome !== 'claimed' || entity.MLTrainingPipelineID !== null) return BuildApprovalClaims.refusal('(new)', 'a new claim is unsettled: Outcome claimed, no pipeline');
      return true;
    }
    if (write !== 'settle') return BuildApprovalClaims.refusal(entity.ID, 'a claim changes only through BuildApprovalClaims.Settle');
    return BuildApprovalClaims.checkSettlement(entity);
  }

  /** The `PreDelete` hook's body: a claim row is never deleted (the approval stays consumed). */
  public static CheckDelete(entity: BaseEntity): boolean | string {
    if (entity.EntityInfo?.Name !== BuildApprovalClaims.EntityName) return true;
    const id = entity instanceof MJMLBuildApprovalClaimEntity ? entity.ID : '(unknown)';
    return BuildApprovalClaims.refusal(id, 'a claim is never deleted: it is what keeps the approval consumed');
  }

  /**
   * Removes this process's hooks and resets the registered flag, so a later {@link Register} registers again. For a
   * test that checks the database's own constraints; nothing in production calls it.
   */
  public static Unregister(): boolean {
    registered = false;
    const save = PreSaveHookRegistration.Unregister(BuildApprovalClaims.HookMark);
    const del = PreSaveHookRegistration.UnregisterPreDelete(BuildApprovalClaims.DeleteHookMark);
    return save || del;
  }

  /** A settlement changes only the outcome (claimed → built/failed) and the pipeline. */
  private static checkSettlement(entity: MJMLBuildApprovalClaimEntity): boolean | string {
    const dirty = entity.Fields.filter((f) => f.Dirty).map((f) => f.Name);
    const other = dirty.filter((n) => n !== 'Outcome' && n !== 'MLTrainingPipelineID');
    if (other.length > 0) return BuildApprovalClaims.refusal(entity.ID, `a settlement changes only Outcome and MLTrainingPipelineID, not ${other.join(', ')}`);
    const before = entity.GetFieldByName('Outcome')?.OldValue;
    if (before !== 'claimed' || entity.Outcome === 'claimed') return BuildApprovalClaims.refusal(entity.ID, `an outcome is recorded once, from claimed to built or failed (was ${String(before)}, now ${entity.Outcome})`);
    return true;
  }

  private static refusal(id: string, why: string): string {
    return `Predictive Studio build approval claim guard: the write of ${BuildApprovalClaims.EntityName} record ${id} is refused: ${why}.`;
  }
}
