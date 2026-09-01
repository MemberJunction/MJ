/**
 * @module experiment/materializing-pipeline-resolver
 *
 * Turns one of a plan's proposed experiments into a concrete `MJ: ML Training Pipelines` id —
 * the missing link that made a production experiment session unable to train anything.
 *
 * Until now the shipped default was {@link UnresolvedPipelineResolver}, which throws: the mapping
 * from "algorithm × feature set × hyperparameters" to a pipeline row was declared to belong to a
 * higher layer that never materialized. It belongs here, because everything it needs is already in
 * the plan.
 *
 * Two properties matter more than the mechanics:
 *
 *  1. **Reuse before create.** A session that re-runs the same experiment — a retry, a resumed
 *     session, a second session over the same plan — must land on the SAME pipeline row. Otherwise
 *     `MJ: ML Models` versions fragment across near-identical pipelines and the model registry stops
 *     being a history of one thing. So the resolver looks for an existing pipeline whose full
 *     configuration matches, and only creates when none does.
 *  2. **Match on the whole configuration, not on the name.** Two experiments can differ ONLY in
 *     hyperparameters, or only in feature set. Matching on anything less would silently train the
 *     wrong pipeline and report it as the right one — the exact failure the throwing default existed
 *     to avoid.
 */

import { LogStatus, RunView } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';

import { modelingPlanToPipelineConfig, type PipelineConfig } from '../agent/modeling-plan-to-pipeline';
import type { IPipelineResolver } from './seams';
import type { TrainExperimentInput } from './types';

/**
 * The seam that creates a pipeline when no existing one matches. Defaults to the same
 * `PredictiveStudioPipelineBuilder.createPipeline` path the agent build uses, injected rather than
 * imported directly so a test needs no provider.
 */
export interface IPipelineMaterializer {
  /** Create + save a pipeline row from a resolved config, returning its id. */
  materialize(config: PipelineConfig, provider: IMetadataProvider, user: UserInfo): Promise<string>;
}

/** Read seam for candidate pipelines, so matching is testable with plain rows. */
export interface IPipelineCandidateLoader {
  /**
   * Load pipelines that could match — narrowed by the cheap, indexed identity fields; the caller
   * then compares the full configuration in memory.
   */
  load(
    targetEntityName: string,
    targetVariable: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJMLTrainingPipelineEntity[]>;
}

/**
 * Resolves an experiment to a pipeline id, reusing an existing row when the whole configuration
 * matches and materializing one when it does not.
 */
export class MaterializingPipelineResolver implements IPipelineResolver {
  /**
   * @param materializer creates the pipeline when nothing matches
   * @param loader reads candidate pipelines (defaults to a `RunView` loader)
   */
  constructor(
    private readonly materializer: IPipelineMaterializer,
    private readonly loader: IPipelineCandidateLoader = new RunViewPipelineCandidateLoader(),
  ) {}

  /** @inheritdoc */
  public async resolvePipelineId(input: TrainExperimentInput): Promise<string> {
    if (!input.provider || !input.contextUser) {
      throw new Error(
        `Run Experiment Session: cannot resolve a pipeline for '${input.experiment.Label}' without a provider and a context user.`,
      );
    }

    // Map THIS experiment, not the plan's top-ranked one — a session trains several of them, and
    // collapsing onto the highest priority would train the same pipeline every iteration.
    const config = modelingPlanToPipelineConfig(input.plan, input.experiment);

    const candidates = await this.loader.load(config.targetEntityName, config.targetVariable, input.contextUser, input.provider);
    const match = candidates.find((p) => pipelineMatchesConfig(p, config));
    if (match) {
      LogStatus(
        `MaterializingPipelineResolver: reusing pipeline '${match.Name}' (${match.ID}) for experiment '${input.experiment.Label}'.`,
      );
      return match.ID;
    }

    const id = await this.materializer.materialize(config, input.provider, input.contextUser);
    LogStatus(`MaterializingPipelineResolver: materialized pipeline ${id} for experiment '${input.experiment.Label}'.`);
    return id;
  }
}

/**
 * `RunView`-backed candidate loader. Narrows on the target entity + variable — the two fields that
 * are cheap to filter on and eliminate almost everything — and leaves the full comparison to
 * {@link pipelineMatchesConfig}.
 *
 * `TargetEntity` is the denormalized entity NAME on the pipeline view, which is what the config
 * carries; filtering on it avoids a metadata lookup just to build the query.
 */
export class RunViewPipelineCandidateLoader implements IPipelineCandidateLoader {
  /** @inheritdoc */
  public async load(
    targetEntityName: string,
    targetVariable: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJMLTrainingPipelineEntity[]> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<MJMLTrainingPipelineEntity>(
      {
        EntityName: 'MJ: ML Training Pipelines',
        ExtraFilter: `TargetEntity='${escapeSql(targetEntityName)}' AND TargetVariable='${escapeSql(targetVariable)}'`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'entity_object',
      },
      contextUser,
    );
    return result.Success ? result.Results ?? [] : [];
  }
}

// region: matching (pure) -----------------------------------------------------

/**
 * Does an existing pipeline row encode exactly this configuration?
 *
 * Every field that changes what gets TRAINED is compared, and the JSON columns are compared
 * canonically (key order-insensitively) because two writers can serialize the same object
 * differently. A field left out of this comparison is a field on which two different experiments
 * could silently share a pipeline — so the list is deliberately exhaustive rather than minimal.
 *
 * `AlgorithmID` is deliberately NOT compared: the config carries an algorithm NAME and the row
 * carries an id, and resolving the id here would need a provider. The denormalized `Algorithm`
 * (display name) is compared instead, which is what the config has.
 */
export function pipelineMatchesConfig(pipeline: MJMLTrainingPipelineEntity, config: PipelineConfig): boolean {
  if (pipeline.TargetEntity !== config.targetEntityName) return false;
  if (pipeline.TargetVariable !== config.targetVariable) return false;
  if (String(pipeline.ProblemType) !== config.problemType) return false;
  if (!namesMatch(pipeline.Algorithm, config.algorithmName)) return false;

  return (
    jsonEquals(pipeline.SourceBindings, config.sourceBindings) &&
    jsonEquals(pipeline.FeatureSteps, config.featureSteps) &&
    jsonEquals(pipeline.AsOfStrategy, config.asOf) &&
    jsonEquals(pipeline.LeakageGuard, config.leakageGuard) &&
    jsonEquals(pipeline.ValidationStrategy, config.validation) &&
    jsonEquals(pipeline.Hyperparameters, config.hyperparameters ?? {}) &&
    jsonEquals(pipeline.DatedSources, config.datedSources ?? [])
  );
}

/** Algorithm names compared case-insensitively and trim-tolerantly (an agent writes these). */
function namesMatch(a: string | null | undefined, b: string): boolean {
  return (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Compare a stored JSON column against a live value **canonically** — key order and whitespace do
 * not change what a pipeline trains, so they must not make two identical configurations look
 * different and spawn a duplicate row.
 *
 * A null/blank column is treated as the empty object/array its parser default would produce, so a
 * pipeline written before a column existed still matches a config that leaves it empty.
 */
export function jsonEquals(stored: string | null | undefined, value: unknown): boolean {
  const left = canonicalize(parseStored(stored));
  const right = canonicalize(value ?? null);
  return left === right;
}

/** Parse a stored column, mapping null/blank/garbage to `null` rather than throwing. */
function parseStored(raw: string | null | undefined): unknown {
  if (raw == null || raw.trim().length === 0) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The token every "nothing here" form collapses to, so absent and empty compare equal. */
const EMPTY = '<empty>';

/**
 * Stable string form of a JSON value: object keys sorted recursively, arrays kept in order (order IS
 * meaningful for feature steps and source bindings), and empty object/array/null all collapsing to
 * {@link EMPTY} so "absent" and "empty" compare equal.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return EMPTY;
  if (Array.isArray(value)) {
    return value.length === 0 ? EMPTY : `[${value.map(canonicalize).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return EMPTY;
    return `{${entries.map(([k, v]) => `${k}:${canonicalize(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Escape a value for a single-quoted SQL literal. */
function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}
