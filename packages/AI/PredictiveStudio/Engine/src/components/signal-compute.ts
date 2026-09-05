/**
 * @module components/signal-compute
 *
 * Computing ONE signal over a population — no model involved.
 *
 * This is what makes the signal catalogue callable rather than merely browsable. Most questions a
 * business asks are measurements, not predictions: *"who has gone quiet since the conference?"* is
 * an activity-recency signal over a population, and answering it by running a whole renewal model
 * is the wrong tool returning the wrong shape.
 *
 * It runs through the SAME `FeatureAssemblyExecutor` that training and scoring use, which is the
 * point — the number a report shows and the number the model trained on come from one definition,
 * including the as-of cut and the missing-data rules. Two definitions of "engagement" that quietly
 * disagree is how a board ends up with two numbers for one question.
 */
import { LogError, RunView, type IMetadataProvider, type UserInfo, type EntityInfo } from '@memberjunction/core';
import type { MJMLComponentEntity } from '@memberjunction/core-entities';
import { FeatureAssemblyExecutor, type FeatureAssemblyParams } from '../feature-assembly';
import {
  isResolutionError,
  parseSignalSpec,
  resolveSignal,
  signalLeafName,
  type ResolvedSignal,
  type SignalBindingOverride,
} from './signal-binding';
import { MLComponentEngine } from './ml-component-engine';

/** What to compute, over whom. */
export interface ComputeSignalRequest {
  /** The `MJ: ML Components` row to compute. */
  SignalID: string;
  /** Entity whose records are measured (the population). */
  TargetEntity: string;
  /** Optional filter narrowing the population. */
  Filter?: string;
  /** Cap on records measured. Omitted means the whole population, which may be large. */
  MaxRows?: number;
  /**
   * Point-in-time anchor. A date column on the target entity cuts each record's history at ITS OWN
   * value, which is what the signal was trained under. Omitted measures as of now — correct for a
   * live question, wrong for reproducing a training number.
   */
  AsOfColumn?: string;
  /** Substitutions for the signal's stored binding. Omitted fields keep the stored default. */
  Binding?: SignalBindingOverride;
}

/** One record's value. */
export interface ComputedSignalValue {
  RecordID: string;
  Value: number | string | boolean | null;
}

/** The outcome. Never throws — a failure is reported, because this runs behind chat and agents. */
export interface ComputeSignalResult {
  Success: boolean;
  /** The column the value was computed into. */
  OutputColumn: string;
  Values: ComputedSignalValue[];
  /** How the signal was resolved after the override — what it actually measured, for the record. */
  ResolvedAs: ResolvedSignal | null;
  ErrorMessage: string | null;
}

/**
 * Validate an override against real metadata BEFORE computing.
 *
 * Without this a mistyped field name produces a column of nulls that looks like "nobody had any
 * activity" — a wrong answer wearing a right answer's shape. Better to refuse and say which field
 * does not exist.
 */
function validateBinding(
  resolved: ResolvedSignal,
  targetEntity: EntityInfo,
  provider: IMetadataProvider,
  asOfColumn?: string,
): string | null {
  const fieldExists = (entity: EntityInfo, field: string): boolean =>
    entity.Fields.some((f) => f.Name.toLowerCase() === field.toLowerCase());

  if (asOfColumn && !fieldExists(targetEntity, asOfColumn)) {
    return `As-of column '${asOfColumn}' does not exist on '${targetEntity.Name}'.`;
  }

  if (resolved.Kind === 'column') {
    return fieldExists(targetEntity, resolved.Column)
      ? null
      : `Column '${resolved.Column}' does not exist on '${targetEntity.Name}'.`;
  }

  const ds = resolved.DatedSource;
  const source = provider.EntityByName(ds.EntityName);
  if (!source) {
    return `Source entity '${ds.EntityName}' is not in metadata.`;
  }
  for (const [label, field] of [
    ['foreign key', ds.ForeignKeyField],
    ['date field', ds.DateField],
  ] as const) {
    if (!fieldExists(source, field)) {
      return `The ${label} '${field}' does not exist on '${ds.EntityName}'.`;
    }
  }
  const valueField = ds.Features[0]?.Field;
  if (valueField && !fieldExists(source, valueField)) {
    return `Value field '${valueField}' does not exist on '${ds.EntityName}'.`;
  }
  return null;
}

/**
 * Compute one signal over a population.
 *
 * Stateless; construct once and reuse.
 */
export class SignalComputer {
  constructor(private readonly executor: FeatureAssemblyExecutor = new FeatureAssemblyExecutor()) {}

  public async compute(
    request: ComputeSignalRequest,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
    engine: MLComponentEngine = MLComponentEngine.Instance,
  ): Promise<ComputeSignalResult> {
    const fail = (message: string, resolved: ResolvedSignal | null = null): ComputeSignalResult => ({
      Success: false,
      OutputColumn: '',
      Values: [],
      ResolvedAs: resolved,
      ErrorMessage: message,
    });

    try {
      const md = provider;
      if (!md) return fail('A provider is required to compute a signal.');

      const signal = await md.GetEntityObject<MJMLComponentEntity>('MJ: ML Components', contextUser);
      if (!(await signal.Load(request.SignalID))) {
        return fail(`Signal '${request.SignalID}' was not found.`);
      }
      const targetEntity = md.EntityByName(request.TargetEntity);
      if (!targetEntity) {
        return fail(`Target entity '${request.TargetEntity}' is not in metadata.`);
      }

      await engine.Config(false, contextUser, md);
      const type = engine.FindTypeByID(signal.ComponentTypeID);
      if (!type) {
        return fail(`The signal's component type is not in the loaded tree.`);
      }

      // The output column is named for the signal so a caller can find its values without
      // knowing the internal id — the same name the catalogue lists it under.
      const outputColumn = signalLeafName(signal.Name);

      const resolved = resolveSignal(type.DriverClass, parseSignalSpec(signal.Spec), outputColumn, request.Binding);
      if (isResolutionError(resolved)) {
        return fail(resolved.Error);
      }
      const invalid = validateBinding(resolved, targetEntity, md, request.AsOfColumn);
      if (invalid) {
        return fail(invalid, resolved);
      }

      const params: FeatureAssemblyParams = {
        targetEntityName: request.TargetEntity,
        recordSet: { EntityName: request.TargetEntity, ExtraFilter: request.Filter, MaxRows: request.MaxRows },
        sources: [{ Kind: 'Entity', Ref: request.TargetEntity }],
        steps: { Steps: resolved.Kind === 'column' ? [{ Id: 'sel', Kind: 'select', Columns: [resolved.Column] }] : [] },
        asOf: request.AsOfColumn ? { Mode: 'column', Column: request.AsOfColumn } : { Mode: 'none' },
        // Nothing is being trained, so there is no target to leak into and nothing to deny.
        leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 0.6 },
        datedSources: resolved.Kind === 'as-of' ? [resolved.DatedSource] : undefined,
        contextUser,
        provider: md,
      };
      if (resolved.Kind === 'as-of') {
        params.sources.push({ Kind: 'Entity', Ref: resolved.DatedSource.EntityName });
      }

      const assembled = await this.executor.assemble(params);
      const columns = assembled.matrix.columns;
      const valueIndex = columns.indexOf(resolved.Kind === 'column' ? resolved.Column : resolved.OutputColumn);
      if (valueIndex < 0) {
        return fail(`The assembly produced no '${resolved.OutputColumn}' column.`, resolved);
      }

      // The matrix carries no primary key, so the population is re-read in the same order the
      // executor fetched it. Both go through the same record-set descriptor, so the orders agree.
      const ids = await this.readRecordIds(request, md, contextUser);
      const values: ComputedSignalValue[] = assembled.matrix.rows.map((row, i) => ({
        RecordID: ids[i] ?? '',
        Value: (row[valueIndex] ?? null) as number | string | boolean | null,
      }));

      return { Success: true, OutputColumn: resolved.OutputColumn, Values: values, ResolvedAs: resolved, ErrorMessage: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`SignalComputer: ${message}`);
      return fail(message);
    }
  }

  /** Primary keys of the measured population, in the executor's own fetch order. */
  protected async readRecordIds(
    request: ComputeSignalRequest,
    provider: IMetadataProvider,
    contextUser?: UserInfo,
  ): Promise<string[]> {
    const result = await new RunView().RunView<{ ID: string }>(
      {
        EntityName: request.TargetEntity,
        ExtraFilter: request.Filter ?? '',
        Fields: ['ID'],
        MaxRows: request.MaxRows,
        ResultType: 'simple',
      },
      contextUser,
    );
    return result.Success ? result.Results.map((r) => String(r.ID)) : [];
  }
}
