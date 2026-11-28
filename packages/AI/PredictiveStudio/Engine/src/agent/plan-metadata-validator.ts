/**
 * @module agent/plan-metadata-validator
 *
 * `PlanMetadataValidator` — every name a plan presents, resolved against the passed provider's metadata before the plan
 * is shown (PR 5, A3; F-PIT-8, F-AG-3). The target entity and variable, each Entity and Query source, each column
 * feature, each leakage field, each experiment's feature set and every column a unit draft names must resolve; a name
 * that does not is an {@link UnresolvedReference} carrying its payload path. Entities resolve by
 * `PredictiveStudioPipelineBuilder.ResolveEntity` (the builder's own rules), fields by `EntityInfo.Fields`. Feature
 * Pipeline sources are rows, not metadata, so {@link PlanMetadataValidator.ValidateFeaturePipelines} reads them.
 */
import { EscapeSQLString } from '@memberjunction/global';
import { RunView, type EntityInfo, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import type { ModelingPlanSpec, UnitDraft, UnresolvedReference } from '@memberjunction/predictive-studio-core';

import { PredictiveStudioPipelineBuilder } from './pipeline-builder';

/** The provider members validation reads: the entity lookups and the query catalog. */
export type PlanValidationProvider = Pick<IMetadataProvider, 'EntityByName' | 'Entities' | 'Queries'>;

/** The feature kinds that name a column of their source (the others are derived upstream). */
const COLUMN_FEATURE_KINDS: readonly string[] = ['numeric', 'categorical'];

/** Collects unresolved names once each, in the order they were found. */
class ReferenceCollector {
  private readonly seen = new Set<string>();
  public readonly References: UnresolvedReference[] = [];

  /** Records `name` at `path` unless the same kind and name was already recorded. */
  public Add(path: string, name: string, kind: UnresolvedReference['kind']): void {
    const key = `${kind}:${name.trim().toLowerCase()}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.References.push({ path, name, kind });
  }
}

/** Resolves every name of a plan against metadata. */
export class PlanMetadataValidator {
  /** The plan's unresolved names against `provider`'s metadata; `[]` when every name resolves. */
  public static Validate(plan: ModelingPlanSpec, provider: PlanValidationProvider): UnresolvedReference[] {
    const out = new ReferenceCollector();
    const target = PlanMetadataValidator.checkTarget(plan, provider, out);
    const sources = PlanMetadataValidator.checkSources(plan, provider, out);
    PlanMetadataValidator.checkFeatures(plan, provider, target, out);
    PlanMetadataValidator.checkLeakageNotes(plan, provider, target, sources, out);
    PlanMetadataValidator.checkExperiments(plan, out);
    if (plan.UnitDraft) PlanMetadataValidator.checkUnitDraft(plan.UnitDraft, provider, out);
    return out.References;
  }

  /**
   * The target slice's unresolved names (the entity and the target variable), for a plan still being gathered: a
   * target naming an entity or column the catalog lacks is caught before the rest of the plan is drafted. `[]` while
   * the target names no entity yet; the variable is checked once it is named.
   */
  public static ValidateTarget(plan: Pick<ModelingPlanSpec, 'TargetDefinition'>, provider: PlanValidationProvider): UnresolvedReference[] {
    const t = plan.TargetDefinition;
    if (!t?.EntityName?.trim()) return [];
    const out = new ReferenceCollector();
    const entity = PredictiveStudioPipelineBuilder.ResolveEntity(t.EntityName, provider) || null;
    if (!entity) out.Add('TargetDefinition.EntityName', t.EntityName, 'entity');
    if (t.TargetVariable?.trim() && !PlanMetadataValidator.HasField(entity, t.TargetVariable)) out.Add('TargetDefinition.TargetVariable', t.TargetVariable, 'field');
    return out.References;
  }

  /** The plan's Feature Pipeline sources that name no `MJ: Record Processes` row, read through `provider` as `user`. */
  public static async ValidateFeaturePipelines(plan: ModelingPlanSpec, provider: IMetadataProvider, user: UserInfo): Promise<UnresolvedReference[]> {
    const refs = (plan.CandidateSources || []).map((s, i) => ({ s, i })).filter(({ s }) => s.Kind === 'FeaturePipeline');
    if (refs.length === 0) return [];
    const names = refs.map(({ s }) => `'${EscapeSQLString(s.Ref)}'`).join(',');
    const rows = await RunView.FromMetadataProvider(provider).RunView<Pick<MJRecordProcessEntity, 'Name'>>({
      EntityName: 'MJ: Record Processes', ExtraFilter: `Name IN (${names})`, Fields: ['Name'], ResultType: 'simple',
    }, user);
    if (!rows.Success) throw new Error(`Predictive Studio: reading the plan's Feature Pipelines failed: ${rows.ErrorMessage || 'unknown error'}`);
    const found = new Set(rows.Results.map((r) => r.Name.trim().toLowerCase()));
    return refs.filter(({ s }) => !found.has(s.Ref.trim().toLowerCase())).map(({ s, i }) => ({ path: `CandidateSources[${i}].Ref`, name: s.Ref, kind: 'feature-pipeline' }));
  }

  /** The target entity (null when it does not resolve) after checking it and the target variable. */
  private static checkTarget(plan: ModelingPlanSpec, provider: PlanValidationProvider, out: ReferenceCollector): EntityInfo | null {
    const t = plan.TargetDefinition;
    const entity = PredictiveStudioPipelineBuilder.ResolveEntity(t.EntityName, provider) || null;
    if (!entity) out.Add('TargetDefinition.EntityName', t.EntityName, 'entity');
    if (!PlanMetadataValidator.HasField(entity, t.TargetVariable)) out.Add('TargetDefinition.TargetVariable', t.TargetVariable, 'field');
    return entity;
  }

  /** The resolved Entity sources (by the name the plan wrote) after checking every Entity and Query source. */
  private static checkSources(plan: ModelingPlanSpec, provider: PlanValidationProvider, out: ReferenceCollector): Map<string, EntityInfo> {
    const entities = new Map<string, EntityInfo>();
    (plan.CandidateSources || []).forEach((s, i) => {
      const path = `CandidateSources[${i}].Ref`;
      if (s.Kind === 'Entity' || s.Kind === 'ExternalEntity') {
        const entity = PredictiveStudioPipelineBuilder.ResolveEntity(s.Ref, provider);
        if (entity) entities.set(s.Ref.trim().toLowerCase(), entity);
        else out.Add(path, s.Ref, 'entity');
      } else if (s.Kind === 'Query' && !PlanMetadataValidator.queryExists(s.Ref, provider)) {
        out.Add(path, s.Ref, 'query');
      }
    });
    return entities;
  }

  /**
   * Every column feature names a field of its source entity. A feature whose source is a resolved entity is checked on
   * it; one whose source is the target's name (resolved or not) on the target; a feature of a Query or Feature Pipeline
   * source is derived there and has no column to check.
   */
  private static checkFeatures(plan: ModelingPlanSpec, provider: PlanValidationProvider, target: EntityInfo | null, out: ReferenceCollector): void {
    const targetName = plan.TargetDefinition.EntityName.trim().toLowerCase();
    (plan.CandidateFeatures || []).forEach((f, i) => {
      if (!COLUMN_FEATURE_KINDS.includes(f.Kind)) return;
      const source = PlanMetadataValidator.sourceOf(plan, f.SourceRef);
      if (source !== null && source !== 'Entity' && source !== 'ExternalEntity') return;
      const onTarget = (f.SourceRef || '').trim().toLowerCase() === targetName;
      const entity = onTarget ? target : PredictiveStudioPipelineBuilder.ResolveEntity(f.SourceRef, provider) || null;
      if (!entity && !onTarget) out.Add(`CandidateFeatures[${i}].SourceRef`, f.SourceRef, 'entity');
      if (!PlanMetadataValidator.HasField(entity, f.Name)) out.Add(`CandidateFeatures[${i}].Name`, f.Name, 'field');
    });
  }

  /**
   * Every leakage note names a field of the target or of a resolved Entity source, or a qualified `Entity.Field` whose
   * entity resolves and has the field.
   */
  private static checkLeakageNotes(plan: ModelingPlanSpec, provider: PlanValidationProvider, target: EntityInfo | null, sources: Map<string, EntityInfo>, out: ReferenceCollector): void {
    const entities = [target, ...sources.values()];
    (plan.LeakageNotes || []).forEach((n, i) => {
      if (entities.some((e) => PlanMetadataValidator.HasField(e, n.Field)) || PlanMetadataValidator.QualifiedFieldExists(n.Field, provider)) return;
      out.Add(`LeakageNotes[${i}].Field`, n.Field, 'field');
    });
  }

  /** Whether `name` is `<entity>.<field>` with an entity that resolves (by the builder's rules) and has the field. */
  public static QualifiedFieldExists(name: string, provider: PlanValidationProvider): boolean {
    const dot = (name || '').lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) return false;
    const entity = PredictiveStudioPipelineBuilder.ResolveEntity(name.slice(0, dot).trim(), provider);
    return PlanMetadataValidator.HasField(entity, name.slice(dot + 1).trim());
  }

  /** Every experiment's feature set names the plan's candidate features. */
  private static checkExperiments(plan: ModelingPlanSpec, out: ReferenceCollector): void {
    const features = new Set((plan.CandidateFeatures || []).map((f) => f.Name.trim().toLowerCase()));
    (plan.ProposedExperiments || []).forEach((e, i) => {
      (e.FeatureSet || []).forEach((name, j) => {
        if (!features.has(name.trim().toLowerCase())) out.Add(`ProposedExperiments[${i}].FeatureSet[${j}]`, name, 'field');
      });
    });
  }

  /** The unit draft's grain entity and every column it reads. */
  private static checkUnitDraft(unit: UnitDraft, provider: PlanValidationProvider, out: ReferenceCollector): void {
    const rows = unit.UnitRows;
    const grain = PredictiveStudioPipelineBuilder.ResolveEntity(rows.grainEntity, provider) || null;
    if (!grain) out.Add('UnitDraft.UnitRows.grainEntity', rows.grainEntity, 'entity');
    const check = (entity: EntityInfo | null, path: string, name: string | null): void => {
      if (name !== null && !PlanMetadataValidator.HasField(entity, name)) out.Add(path, name, 'field');
    };
    if (rows.kind === 'grain') {
      if (rows.decisionDate.kind !== 'fixed') check(grain, 'UnitDraft.UnitRows.decisionDate.column', rows.decisionDate.column);
    } else {
      const child = PredictiveStudioPipelineBuilder.ResolveEntity(rows.childEntity, provider) || null;
      if (!child) out.Add('UnitDraft.UnitRows.childEntity', rows.childEntity, 'entity');
      check(child, 'UnitDraft.UnitRows.foreignKey', rows.foreignKey);
      check(child, 'UnitDraft.UnitRows.periodDate', rows.periodDate);
    }
    rows.filter.forEach((f, i) => check(grain, `UnitDraft.UnitRows.filter[${i}].field`, f.field));
    PlanMetadataValidator.checkLabelRule(unit, grain, provider, out, check);
    check(grain, 'UnitDraft.GroupKey', unit.GroupKey);
    if (unit.TemporalSpec) check(grain, 'UnitDraft.TemporalSpec.timeColumn', unit.TemporalSpec.timeColumn);
  }

  /** The unit draft's label columns: its own column, or the child entity's event fields. */
  private static checkLabelRule(
    unit: UnitDraft, grain: EntityInfo | null, provider: PlanValidationProvider, out: ReferenceCollector,
    check: (entity: EntityInfo | null, path: string, name: string | null) => void,
  ): void {
    const rule = unit.LabelRule;
    if (rule.kind === 'column') return check(grain, 'UnitDraft.LabelRule.column', rule.column);
    if (rule.kind === 'next-period') return check(grain, 'UnitDraft.LabelRule.periodIndexField', rule.periodIndexField);
    const child = PredictiveStudioPipelineBuilder.ResolveEntity(rule.childEntity, provider) || null;
    if (!child) out.Add('UnitDraft.LabelRule.childEntity', rule.childEntity, 'entity');
    check(child, 'UnitDraft.LabelRule.foreignKey', rule.foreignKey);
    check(child, 'UnitDraft.LabelRule.dateField', rule.dateField);
    check(child, 'UnitDraft.LabelRule.valueField', rule.valueField);
    check(grain, 'UnitDraft.LabelRule.ownerKeyField', rule.ownerKeyField);
  }

  /** Whether `entity` has a field named `name` (case-insensitive); false for a missing entity. */
  public static HasField(entity: EntityInfo | null | undefined, name: string): boolean {
    const wanted = (name || '').trim().toLowerCase();
    return !!entity && wanted.length > 0 && entity.Fields.some((f) => f.Name.toLowerCase() === wanted);
  }

  /** The kind of the plan's source named `ref`, or null when the plan lists no such source. */
  private static sourceOf(plan: ModelingPlanSpec, ref: string): ModelingPlanSpec['CandidateSources'][number]['Kind'] | null {
    const wanted = (ref || '').trim().toLowerCase();
    return (plan.CandidateSources || []).find((s) => s.Ref.trim().toLowerCase() === wanted)?.Kind || null;
  }

  /** Whether the provider's query catalog has a query named `name` (case-insensitive). */
  private static queryExists(name: string, provider: PlanValidationProvider): boolean {
    const wanted = (name || '').trim().toLowerCase();
    return provider.Queries.some((q) => (q.Name || '').trim().toLowerCase() === wanted);
  }
}
