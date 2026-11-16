/**
 * The publish-record audit of G3.6 (S9.1): every `Published` model in the database, each with its latest applied
 * publish record (`Kind = 'publish'`, `Purpose` `publish` or `rollback`), and whether that record is complete — it names
 * the approver, the time, the gate decision and the evidence snapshot the approver (or the automated gate) was shown.
 * The stored JSON is read through Core's `JsonParse` and the trainer-result schemas; nothing is cast.
 */
import { RunView } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { JsonParse, TrainerResultSchemas, type JsonObject, type JsonValue } from '@memberjunction/predictive-studio-core';
import type { TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

/** The publish-record columns the audit reads. */
type AuditedRecord = Pick<MJMLModelPublishRecordEntity, 'ID' | 'ApproverKind' | 'UserID' | 'RecordedAt' | 'GateDecision' | 'Evidence'>;

/** A `Published` model and its latest applied publish record (null when it has none). */
export interface PublishedModelRecord {
  /** The `MJ: ML Models` row's ID. */
  readonly ModelID: string;
  /** The model's name as the catalog shows it: its pipeline's name and its version. */
  readonly Name: string;
  /** Its latest applied publish record (`Kind = 'publish'`, `Purpose` `publish` or `rollback`); null when it has none. */
  readonly Record: AuditedRecord | null;
}

/** A yyyy-mm-dd date. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** G3.6's reads and the completeness rule. */
export class PublishRecordAudit {
  /** Every `MJ: ML Models` row with `Status = 'Published'`, unfiltered, each with its latest applied publish record. */
  public static async PublishedModels(h: TruthHarness): Promise<PublishedModelRecord[]> {
    const rv = RunView.FromMetadataProvider(h.Provider);
    const models = await rv.RunView<Pick<MJMLModelEntity, 'ID' | 'Pipeline' | 'Version' | 'Status'>>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `Status='Published'`, Fields: ['ID', 'Pipeline', 'Version', 'Status'], ResultType: 'simple', BypassCache: true }, h.User);
    if (!models.Success) throw new Error(`reading the Published models failed: ${models.ErrorMessage}`);
    const out: PublishedModelRecord[] = [];
    for (const m of models.Results) out.push({ ModelID: m.ID, Name: `${m.Pipeline || 'no pipeline'} v${m.Version}`, Record: await PublishRecordAudit.latestApplied(h, m.ID) });
    return out;
  }

  /** True when the model's record names its approver, its time, a gate decision and a complete evidence snapshot. */
  public static HasCompleteRecord(m: PublishedModelRecord): boolean {
    return m.Record !== null && PublishRecordAudit.Lacks(m).length === 0;
  }

  /** The fields the model's record lacks, in words (empty when it is complete, or when there is no record to lack them). */
  public static Lacks(m: PublishedModelRecord): string[] {
    const r = m.Record;
    if (r === null) return [];
    const lacks: string[] = [];
    if (!PublishRecordAudit.approverNamed(r)) lacks.push(`approver (${r.ApproverKind || 'none'}, user ${r.UserID || 'none'})`);
    if (r.RecordedAt === null || r.RecordedAt === undefined) lacks.push('RecordedAt');
    if (!PublishRecordAudit.gateDecisionParses(r.GateDecision)) lacks.push('GateDecision');
    lacks.push(...PublishRecordAudit.evidenceLacks(r.Evidence));
    return lacks;
  }

  /** The model's newest `publish` record of purpose `publish` or `rollback`; null when it has none. */
  private static async latestApplied(h: TruthHarness, modelId: string): Promise<AuditedRecord | null> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<AuditedRecord>({
      EntityName: 'MJ: ML Model Publish Records',
      ExtraFilter: `ModelID='${EscapeSQLString(modelId)}' AND Kind='publish' AND Purpose IN ('publish','rollback')`,
      OrderBy: 'RecordedAt DESC', MaxRows: 1, Fields: ['ID', 'ApproverKind', 'UserID', 'RecordedAt', 'GateDecision', 'Evidence'], ResultType: 'simple', BypassCache: true,
    }, h.User);
    if (!r.Success) throw new Error(`reading the publish records of ML Model ${modelId} failed: ${r.ErrorMessage}`);
    return r.Results[0] || null;
  }

  /** The automated gate, or a person named by `UserID`. */
  private static approverNamed(r: AuditedRecord): boolean {
    if (r.ApproverKind === 'automated-gate') return true;
    return r.ApproverKind === 'user' && typeof r.UserID === 'string' && r.UserID.length > 0;
  }

  /** True when the column parses to a gate decision whose outcome is one of the three. */
  private static gateDecisionParses(text: string | null): boolean {
    const parsed = JsonParse.ParseJsonText(text, 'GateDecision');
    return parsed.Ok === true && TrainerResultSchemas.GateDecision.safeParse(parsed.Value).success;
  }

  /** What the evidence snapshot lacks: holdout with a finite interval, a comparison, the leakage audit, the data window, the hash. */
  private static evidenceLacks(text: string | null): string[] {
    const parsed = JsonParse.ParseJsonText(text, 'Evidence');
    if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) return ['Evidence (does not parse)'];
    const e = parsed.Value;
    const lacks: string[] = [];
    if (!PublishRecordAudit.holdoutWithInterval(e.holdoutPrimary)) lacks.push('Evidence.holdoutPrimary with a finite interval');
    if (!PublishRecordAudit.comparisonsPresent(e.comparisons)) lacks.push('Evidence.comparisons');
    if (!TrainerResultSchemas.GateDecision.safeParse(e.gate).success) lacks.push('Evidence.gate');
    if (!PublishRecordAudit.leakageAudit(e.leakageFlags)) lacks.push('Evidence.leakageFlags');
    if (!PublishRecordAudit.dataWindow(e.dataWindow)) lacks.push('Evidence.dataWindow');
    if (typeof e.snapshotHash !== 'string' || e.snapshotHash.length === 0) lacks.push('Evidence.snapshotHash');
    return lacks;
  }

  private static holdoutWithInterval(v: JsonValue | undefined): boolean {
    const m = TrainerResultSchemas.MetricWithInterval.safeParse(v);
    return m.success && Number.isFinite(m.data.interval.lower) && Number.isFinite(m.data.interval.upper);
  }

  private static comparisonsPresent(v: JsonValue | undefined): boolean {
    if (!JsonParse.IsJsonObject(v)) return false;
    const entries = Object.values(v);
    return entries.length > 0 && entries.every((c) => TrainerResultSchemas.PairedComparison.safeParse(c).success);
  }

  private static leakageAudit(v: JsonValue | undefined): boolean {
    return Array.isArray(v) && v.every((f) => TrainerResultSchemas.LeakageFlag.safeParse(f).success);
  }

  private static dataWindow(v: JsonValue | undefined): boolean {
    if (!JsonParse.IsJsonObject(v)) return false;
    const w: JsonObject = v;
    return typeof w.from === 'string' && ISO_DATE.test(w.from) && typeof w.to === 'string' && ISO_DATE.test(w.to);
  }
}
