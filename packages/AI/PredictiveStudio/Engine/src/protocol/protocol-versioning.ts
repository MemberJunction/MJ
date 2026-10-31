/**
 * @module protocol/protocol-versioning
 *
 * Evaluation Protocol version rows, written the way Prediction Unit versions are: version 1 is its own lineage root
 * with a client-supplied ID; every later version copies the latest version, applies the changes and takes
 * Version = latest + 1 under the same lineage root, with its ID left to the database. A saved version is never
 * updated (the server subclass refuses it). The guard-field author rule (the previous version's
 * `GuardFieldsEditableBy`) is enforced by the server entity from the `AuthoredBy` written here.
 */
import type { UserInfo } from '@memberjunction/core';
import type { MJEvaluationProtocolEntity } from '@memberjunction/core-entities';
import {
  EvaluationProtocol, EvaluationProtocolRules, ProtocolRows,
  type Actor, type EvaluationProtocolDraft, type EvaluationProtocolRowTarget, type ProtocolVersionWrite,
} from '@memberjunction/predictive-studio-core';
import type { IEntityFactory } from '../training/types';

/** A protocol row this module writes and saves (the generated entity satisfies it). */
export type EvaluationProtocolVersionRow = EvaluationProtocolRowTarget & {
  /** Saves the row; false when the save (or its validation) failed. */
  Save(): Promise<boolean>;
  /** The last save's result; its message explains a failed save. */
  readonly LatestResult: { readonly CompleteMessage: string } | null;
};

/** Evaluation Protocol version rows: each version's draft and row identity, written with Core's row writer. */
export class EvaluationProtocolVersioning {
  /** Pure: version 1 of a new lineage, its own lineage root: `id` is both its ID and its LineageRootID. */
  public static BuildV1(draft: EvaluationProtocolDraft, actor: Actor, id: string): ProtocolVersionWrite {
    return { Draft: draft, Meta: { ID: id, LineageRootID: id, Version: 1, AuthoredBy: actor, Description: null } };
  }

  /**
   * Pure: the version after `latest` — `latest` parsed back to a draft, `changes` applied, its description carried over,
   * the ID left to the database.
   *
   * @throws Error when `latest` does not parse
   */
  public static BuildNextVersion(latest: EvaluationProtocolRowTarget, changes: Partial<EvaluationProtocolDraft>, actor: Actor): ProtocolVersionWrite {
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(latest);
    if (parsed.Ok === false) throw new Error(`Evaluation Protocol ${latest.ID} does not parse: ${parsed.Errors.join('; ')}`);
    return {
      Draft: { ...EvaluationProtocolRules.DraftFromProtocolSpec(parsed.Value), ...changes },
      Meta: { ID: null, LineageRootID: latest.LineageRootID, Version: latest.Version + 1, AuthoredBy: actor, Description: latest.Description },
    };
  }

  /**
   * Writes the version into a new row with Core's row writer and saves it. A null ID leaves the row's own ID alone, so
   * the database supplies it.
   *
   * @throws Error naming `what` and the save message when the save fails
   */
  public static async WriteVersionRow(row: EvaluationProtocolVersionRow, version: ProtocolVersionWrite, what: string): Promise<void> {
    ProtocolRows.ApplyProtocolDraftToRow(row, version.Draft, version.Meta);
    if (!(await row.Save())) throw new Error(`Saving ${what} failed: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  /** Version 1 of a new protocol lineage: its own lineage root, with a client-minted upper-case ID. */
  public static async CreateEvaluationProtocolV1(draft: EvaluationProtocolDraft, actor: Actor, entityFactory: IEntityFactory, contextUser?: UserInfo): Promise<MJEvaluationProtocolEntity> {
    const row = await entityFactory.getEntityObject<MJEvaluationProtocolEntity>('MJ: Evaluation Protocols', contextUser);
    await EvaluationProtocolVersioning.WriteVersionRow(row, EvaluationProtocolVersioning.BuildV1(draft, actor, ProtocolRows.NewVersionRowID()), `Evaluation Protocol "${draft.name}" v1`);
    return row;
  }

  /** The next version under `latest`'s lineage, with `changes` applied over the latest version's content. */
  public static async CreateNextEvaluationProtocolVersion(
    latest: MJEvaluationProtocolEntity,
    changes: Partial<EvaluationProtocolDraft>,
    actor: Actor,
    entityFactory: IEntityFactory,
    contextUser?: UserInfo,
  ): Promise<MJEvaluationProtocolEntity> {
    const next = EvaluationProtocolVersioning.BuildNextVersion(latest, changes, actor);
    const row = await entityFactory.getEntityObject<MJEvaluationProtocolEntity>('MJ: Evaluation Protocols', contextUser);
    await EvaluationProtocolVersioning.WriteVersionRow(row, next, `Evaluation Protocol "${next.Draft.name}" v${next.Meta.Version}`);
    return row;
  }
}
