/**
 * @module feature-assembly/as-of/feature-resolution
 *
 * Turns a unit pipeline's FeatureSteps into typed FeatureColumnSpecs: each column's dated source comes from
 * metadata (AllowUpdateAPI = false → immutable-field, else record-changes), its encoding from the field type unless
 * declared, and every column gets an imputer with a missing indicator. Preprocessing steps must target a produced
 * column. Steps with no as-of semantics are refused.
 */
import type { AssemblyRefusal, ColumnEncoding, ColumnEncodingKind, FeatureColumnSpec, FeatureStep, FeatureStepGraph, MissingValuePolicy, PredictionUnitSpec, PreprocessingOp, ProtocolExclusions } from '@memberjunction/predictive-studio-core';
import { NormalizeName, PredictionUnit } from '@memberjunction/predictive-studio-core';
import type { AssemblyEntityInfo, AssemblyFieldInfo, IAssemblyMetadata } from '../assembly-metadata';
import { AssemblyRefused } from './refusal';

/** The typed columns and explicit preprocessing ops of a unit pipeline, or the first refusal met resolving them. */
export type FeatureResolution =
  | { readonly Status: 'resolved'; readonly Columns: readonly FeatureColumnSpec[]; readonly ExplicitOps: readonly PreprocessingOp[] }
  | { readonly Status: 'refused'; readonly Refusal: AssemblyRefusal };

/** The most distinct categories a categorical column one-hot encodes. */
export const CATEGORICAL_CARDINALITY_CAP = 50;

/**
 * Resolves one unit pipeline's steps into columns. One instance per call holds the columns and ops built so far; each
 * step kind has its own protected method, so a subclass can change one kind without copying the rest.
 */
export class FeatureResolver {
  private readonly deny: ReadonlySet<string>;
  private readonly denySources: ReadonlySet<string>;
  private readonly columns: FeatureColumnSpec[] = [];
  private readonly ops: PreprocessingOp[] = [];
  private readonly byName = new Map<string, number>();

  protected constructor(
    protected readonly Unit: PredictionUnitSpec,
    protected readonly RowEntity: AssemblyEntityInfo,
    protected readonly Metadata: IAssemblyMetadata,
    exclusions: ProtocolExclusions,
  ) {
    this.deny = new Set(exclusions.denyFields.map(NormalizeName));
    this.denySources = new Set(exclusions.denySources.map(NormalizeName));
  }

  /** Resolves every step in order; the first refusal ends resolution (no partial column list). */
  public static ResolveFeatureColumns(
    graph: FeatureStepGraph,
    unit: PredictionUnitSpec,
    rowEntity: AssemblyEntityInfo,
    metadata: IAssemblyMetadata,
    exclusions: ProtocolExclusions,
  ): FeatureResolution {
    const resolver = new FeatureResolver(unit, rowEntity, metadata, exclusions);
    try {
      for (const step of graph.Steps) resolver.ResolveStep(step);
    } catch (e) {
      if (e instanceof AssemblyRefused) return { Status: 'refused', Refusal: e.Refusal };
      throw e;
    }
    return { Status: 'resolved', Columns: resolver.columns, ExplicitOps: resolver.ops };
  }

  /** The encoding a column gets: the declared one, else from the field type (no variant maps a date, ID or string to 0). */
  public static EncodingFor(field: AssemblyFieldInfo, declared: ColumnEncodingKind | undefined): ColumnEncoding {
    switch (declared) {
      case 'numeric': return { kind: 'numeric', nonNumericValue: 'fail' };
      case 'categorical': return { kind: 'categorical', cardinalityCap: CATEGORICAL_CARDINALITY_CAP, method: 'onehot' };
      case 'date-parts': return { kind: 'date-parts', parts: ['days-since-decision'] };
      case 'boolean': return { kind: 'boolean' };
      case 'identifier': return { kind: 'identifier', policy: 'exclude' };
    }
    if (field.IsPrimaryKey) return { kind: 'identifier', policy: 'exclude' };
    switch (field.TSType) {
      case 'number': return { kind: 'numeric', nonNumericValue: 'fail' };
      case 'boolean': return { kind: 'boolean' };
      case 'Date': return { kind: 'date-parts', parts: ['days-since-decision'] };
      case 'string':
        return field.SqlType.toLowerCase() === 'uniqueidentifier' && field.RelatedEntity === null
          ? { kind: 'identifier', policy: 'exclude' }
          : { kind: 'categorical', cardinalityCap: CATEGORICAL_CARDINALITY_CAP, method: 'onehot' };
    }
  }

  /** Every column gets an imputer and a missing indicator; mode for categories and booleans, median otherwise. */
  public static DefaultMissing(encoding: ColumnEncoding): MissingValuePolicy {
    return { impute: encoding.kind === 'categorical' || encoding.kind === 'boolean' ? 'mode' : 'median', indicator: true, constant: null };
  }

  /** Dispatches one step to its kind's method. */
  protected ResolveStep(step: FeatureStep): void {
    switch (step.Kind) {
      case 'select': return this.ResolveSelect(step);
      case 'windowed-aggregate': return this.ResolveWindowedAggregate(step);
      case 'series': return this.ResolveSeries(step);
      case 'llm-derived':
        throw new AssemblyRefused({ kind: 'unpinned-feature-version', featureName: (step.Columns || [])[0] || step.Id });
      case 'embedding':
      case 'flow-agent':
      case 'vision-llm':
        throw new AssemblyRefused({ kind: 'unsupported-step-kind', stepId: step.Id, stepKind: step.Kind });
      // A preprocessing step on a deny-listed column is dropped, never refused: the explicit deny is the stronger instruction.
      case 'impute': {
        if (this.isDenied(step.Column)) return;
        const index = this.byName.get(step.Column);
        if (index === undefined) throw new AssemblyRefused({ kind: 'unresolved-column', entity: this.RowEntity.Name, field: step.Column });
        // `??`: a FillValue of 0 or '' is a legitimate fill; only an absent one becomes null.
        this.columns[index] = { ...this.columns[index], missing: { impute: step.Strategy, indicator: true, constant: step.FillValue ?? null } };
        return;
      }
      case 'standardize':
        for (const col of step.Columns) if (!this.isDenied(col)) this.requireColumn(col);
        this.ops.push({ op: 'standardize', cols: step.Columns.filter((col) => !this.isDenied(col)) });
        return;
      case 'onehot':
        if (this.isDenied(step.Column)) return;
        this.requireColumn(step.Column);
        return;   // categorical columns are one-hot encoded with the assembly's preprocessing ops; the step only names one
      case 'bin':
        if (this.isDenied(step.Column)) return;
        this.requireColumn(step.Column);
        this.ops.push({ op: 'bin', col: step.Column, bins: step.Bins });
        return;
    }
  }

  /** `select`: one typed column per field, read from the row entity or (through a key field) another entity. */
  protected ResolveSelect(step: Extract<FeatureStep, { Kind: 'select' }>): void {
    const entityName = step.Entity || this.RowEntity.Name;
    if (this.denySources.has(NormalizeName(entityName))) return;
    const entity = entityName === this.RowEntity.Name ? this.RowEntity : this.Metadata.Entity(entityName);
    if (!entity) throw new AssemblyRefused({ kind: 'unresolved-column', entity: entityName, field: '*' });
    const keyField = entity.Name === this.RowEntity.Name ? null : this.selectKeyField(step, entity);
    for (const col of step.Columns) {
      if (this.isDenied(col)) continue;
      const field = entity.Fields.find((x) => x.Name === col);
      if (!field) throw new AssemblyRefused({ kind: 'unresolved-column', entity: entity.Name, field: col });
      if (entity.Name === this.RowEntity.Name) this.checkForecastOffset(step, col);
      const encoding = FeatureResolver.EncodingFor(field, step.Encodings?.[col]);
      this.add({
        name: col,
        source: field.AllowUpdateAPI ? { kind: 'record-changes', entity: entity.Name, field: col, keyField } : { kind: 'immutable-field', entity: entity.Name, field: col, keyField },
        encoding,
        missing: FeatureResolver.DefaultMissing(encoding),
      });
    }
  }

  /**
   * `windowed-aggregate`: one numeric column summarising a dated child entity; every named child field and the owner key
   * field on the unit row must exist. A deny-listed child entity or feature name skips the step.
   */
  protected ResolveWindowedAggregate(step: Extract<FeatureStep, { Kind: 'windowed-aggregate' }>): void {
    if (this.denySources.has(NormalizeName(step.ChildEntity)) || this.isDenied(step.FeatureName)) return;
    if (step.OwnerKeyField && !this.RowEntity.Fields.some((x) => x.Name === step.OwnerKeyField)) {
      throw new AssemblyRefused({ kind: 'unresolved-column', entity: this.RowEntity.Name, field: step.OwnerKeyField });
    }
    const child = this.Metadata.Entity(step.ChildEntity);
    if (!child) throw new AssemblyRefused({ kind: 'unresolved-column', entity: step.ChildEntity, field: '*' });
    for (const fld of [step.ForeignKey, step.DateField, step.EndDateField, step.VoidedAtField, step.ValueField].filter((x): x is string => !!x)) {
      if (!child.Fields.some((x) => x.Name === fld)) throw new AssemblyRefused({ kind: 'unresolved-column', entity: child.Name, field: fld });
    }
    const encoding: ColumnEncoding = { kind: 'numeric', nonNumericValue: 'fail' };
    this.add({
      name: step.FeatureName,
      source: {
        kind: 'windowed-aggregate', childEntity: child.Name, foreignKey: step.ForeignKey, ownerKeyField: step.OwnerKeyField || null,
        dateField: step.DateField, endDateField: step.EndDateField || null, voidedAtField: step.VoidedAtField || null,
        // `??`: WindowDays 0 is passed through as declared (the window rule refuses it); only an absent one means "all".
        aggregate: step.Aggregate, valueField: step.ValueField || null, windowDays: step.WindowDays ?? null, filter: step.Filter || [],
      },
      encoding,
      missing: FeatureResolver.DefaultMissing(encoding),
    });
  }

  /** `series`: a lag or rolling window the unit's Temporal Spec declares, by index. */
  protected ResolveSeries(step: Extract<FeatureStep, { Kind: 'series' }>): void {
    const t = this.Unit.temporal;
    const max = t ? (step.Feature.kind === 'lag' ? t.lags.length : t.rollingWindows.length) : 0;
    if (!t || step.Feature.index < 0 || step.Feature.index >= max) {
      throw new AssemblyRefused({ kind: 'unresolved-column', entity: PredictionUnit.UnitRowEntityName(this.Unit.rows), field: `TemporalSpec.${step.Feature.kind}[${step.Feature.index}]` });
    }
    const encoding: ColumnEncoding = { kind: 'numeric', nonNumericValue: 'fail' };
    this.add({ name: step.FeatureName, source: { kind: 'series', feature: { kind: step.Feature.kind, index: step.Feature.index } }, encoding, missing: FeatureResolver.DefaultMissing(encoding) });
  }

  /** The unit-row field holding another entity's key: declared, or the grain foreign key of a grain × periods unit. */
  private selectKeyField(step: Extract<FeatureStep, { Kind: 'select' }>, entity: AssemblyEntityInfo): string {
    const keyField = step.KeyField || (this.Unit.rows.kind === 'grain-x-periods' && entity.Name === this.Unit.rows.grainEntity ? this.Unit.rows.foreignKey : null);
    if (!keyField || !this.RowEntity.Fields.some((x) => x.Name === keyField)) throw new AssemblyRefused({ kind: 'unresolved-column', entity: this.RowEntity.Name, field: keyField || 'KeyField' });
    return keyField;
  }

  /** Forecast units: a row-entity column other than the time column must be declared at least `horizon` periods back. */
  private checkForecastOffset(step: Extract<FeatureStep, { Kind: 'select' }>, col: string): void {
    const t = this.Unit.temporal;
    if (!t || this.Unit.label.outcome.kind !== 'forecast' || col === t.timeColumn) return;
    const offset = step.PeriodOffsets?.[col];
    if (offset === undefined || offset < t.horizonPeriods) {
      throw new AssemblyRefused({ kind: 'future-period-lag', column: col, lag: offset || 0, horizonPeriods: t.horizonPeriods });
    }
  }

  /** True when the field deny list names this column (names compared as the leakage guard normalizes them). */
  private isDenied(column: string): boolean {
    return this.deny.has(NormalizeName(column));
  }

  private add(c: FeatureColumnSpec): void {
    const name = this.byName.has(c.name) ? `${c.name}#${this.columns.length}` : c.name;
    this.byName.set(name, this.columns.length);
    this.columns.push({ ...c, name });
  }

  private requireColumn(name: string): FeatureColumnSpec {
    const i = this.byName.get(name);
    if (i === undefined) throw new AssemblyRefused({ kind: 'unresolved-column', entity: this.RowEntity.Name, field: name });
    return this.columns[i];
  }
}
