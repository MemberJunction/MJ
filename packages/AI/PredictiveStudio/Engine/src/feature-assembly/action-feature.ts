/**
 * @module feature-assembly/action-feature
 *
 * **Code as a feature** (Sonar donation item 8) — the per-record extraction behind an
 * {@link ActionFeatureStep}. When a signal cannot be a column, an as-of aggregate or a prompt —
 * bespoke math, a call to an external system, a rule somebody already wrote and tested — the value
 * comes from running an MJ Action once per record.
 *
 * ## The approval gate is the point
 *
 * Every other step kind declares *what* to compute. This one runs code. So an Action reaches the
 * feature matrix only when its `CodeApprovalStatus` is `Approved`, checked ONCE per assembly before
 * any call is made — and a step naming an unapproved Action **fails the assembly** rather than
 * yielding nulls. Degrading to nulls would train a model on a feature that silently isn't there,
 * and the resulting model would look entirely normal.
 *
 * ## Stateless, like vision
 *
 * There is no fitted state: the same Action runs against each record independently, so the row
 * fully determines the output. It is exempt from the fit-once/apply-everywhere split and produces a
 * RAW column directly — exactly like `select`/`embedding`/`vision-llm`.
 *
 * ## What is deliberately NOT here
 *
 * Cross-run result caching, rate limiting, and cost budgeting. Cost is linear in the population —
 * one call per record per assembly — and `MaxConcurrency` bounds parallelism, not total spend. The
 * soft cap below exists so an expensive run cannot happen silently.
 */

import { LogStatus, LogError } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import type { ActionFeatureStep } from '@memberjunction/predictive-studio-core';

/** Defaults for the Action's I/O contract, overridable per step. */
const DEFAULT_RECORD_PARAM = 'RecordID';
const DEFAULT_ASOF_PARAM = 'AsOf';
const DEFAULT_OUTPUT_PARAM = 'Value';
/** Maximum Action calls in flight at once when the step does not say. */
export const DEFAULT_ACTION_CONCURRENCY = 8;

/**
 * Population size above which an action-backed feature logs loudly.
 *
 * One Action call per record means a 10k-member population is 10k calls per assembly — and an
 * assembly happens on every train AND every scoring run. There is no budget guard yet, so the least
 * this can do is refuse to be quiet about it.
 */
export const ACTION_FEATURE_POPULATION_SOFT_CAP = 1000;

/** A configuration failure — the same for every record, so it fails the whole assembly. */
export class ActionFeatureConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionFeatureConfigError';
  }
}

/** One Action invocation, narrowed to what a feature needs. */
export interface ActionFeatureRunParams {
  /** `MJ: Actions` id or name, as written on the step. */
  actionRef: string;
  /** Input params by name — the record id, the as-of date, and the step's static inputs. */
  params: Record<string, string | number | boolean | null>;
  /** Request user, threaded through for isolation/audit. */
  contextUser?: UserInfo;
}

/** What the runner reports back. */
export interface ActionFeatureRunResult {
  /** Whether the Action ran successfully. */
  success: boolean;
  /** Output params by name — the value is read from the step's `OutputParam`. */
  outputs: Record<string, unknown>;
  /** Failure detail, for the log. */
  message?: string;
  /**
   * True when the Action reported a VALIDATION_ERROR — a configuration problem that will recur for
   * every record, so the assembly fails rather than producing nulls for the whole population.
   */
  configError?: boolean;
}

/**
 * The injected Action-running seam. Production wraps `ActionEngine.RunAction`; tests supply a fake
 * so an action-backed feature assembles with no Action engine and no database.
 */
export interface IActionRunner {
  run(params: ActionFeatureRunParams): Promise<ActionFeatureRunResult>;
}

/**
 * Resolves an Action's approval status. Separate from {@link IActionRunner} because the gate must be
 * answerable WITHOUT running anything.
 */
export interface IActionApprovalCheck {
  /**
   * `Approved` / `Pending` / `Rejected`, or `null` when no such Action exists.
   *
   * @param actionRef the `MJ: Actions` id or name written on the step
   */
  approvalStatus(actionRef: string, contextUser?: UserInfo): Promise<string | null>;
}

/**
 * Coerce an Action's raw output to a feature value, or `null` meaning **no data** for that record.
 *
 * The edge cases differ in meaning and are therefore explicit:
 * - number → itself; `NaN`/`Infinity` → `null` (a non-finite feature poisons the matrix)
 * - boolean → 1 / 0, so an exists-style Action scores as a real value
 * - `''` or whitespace → `null` (**no data**), never the hard `0` that `Number('')` would give
 * - other string → its number when finite, else `null`
 * - anything else → `null`
 */
export function coerceActionOutput(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'boolean') {
    return raw ? 1 : 0;
  }
  if (typeof raw === 'string') {
    if (raw.trim() === '') {
      return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Clamp a value into the step's declared output range.
 *
 * @returns the (possibly clamped) value and whether a clamp happened — a clamp means the Action
 *   returned out-of-contract, which is worth reporting rather than absorbing.
 */
export function clampToRange(
  value: number,
  min: number | undefined,
  max: number | undefined,
): { value: number; clamped: boolean } {
  let v = value;
  if (min != null && v < min) v = min;
  if (max != null && v > max) v = max;
  return { value: v, clamped: v !== value };
}

/** The resolved I/O contract for one action step. */
export interface ActionFeatureContract {
  recordParam: string;
  asOfParam: string;
  outputParam: string;
  staticParams: Record<string, string | number | boolean>;
  maxConcurrency: number;
}

/**
 * Resolve a step's I/O contract, applying defaults and refusing nonsense.
 *
 * Malformed configuration throws rather than mis-binding: an Action whose result lands in a param
 * nobody reads produces nulls for every record, which reads downstream as "this signal is always
 * absent" instead of "this is wired up wrong".
 */
export function resolveActionContract(step: ActionFeatureStep): ActionFeatureContract {
  if (!step.ActionRef || step.ActionRef.trim() === '') {
    throw new ActionFeatureConfigError(`Action feature '${step.FeatureName || step.Id}' names no Action.`);
  }
  if (!step.FeatureName || step.FeatureName.trim() === '') {
    throw new ActionFeatureConfigError(`Action step '${step.Id}' produces no named feature column.`);
  }
  if (step.OutputMin != null && step.OutputMax != null && step.OutputMax <= step.OutputMin) {
    throw new ActionFeatureConfigError(
      `Action feature '${step.FeatureName}' declares an empty output range (${step.OutputMin}–${step.OutputMax}).`,
    );
  }
  const staticParams: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(step.Params ?? {})) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new ActionFeatureConfigError(
        `Action feature '${step.FeatureName}' param '${name}' must be a string, number, or boolean.`,
      );
    }
    staticParams[name] = value;
  }
  return {
    recordParam: nonEmpty(step.RecordParam) ?? DEFAULT_RECORD_PARAM,
    asOfParam: nonEmpty(step.AsOfParam) ?? DEFAULT_ASOF_PARAM,
    outputParam: nonEmpty(step.OutputParam) ?? DEFAULT_OUTPUT_PARAM,
    staticParams,
    maxConcurrency: Math.max(1, step.MaxConcurrency ?? DEFAULT_ACTION_CONCURRENCY),
  };
}

/** A trimmed string, or `undefined` when it is empty. */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** One record to run the Action for. */
export interface ActionFeatureTarget {
  /** The record's primary-key value — what the Action is told to look at. */
  recordId: string;
  /** The record's as-of date, so the Action honours the same point-in-time boundary. */
  asOf: Date | null;
}

/**
 * Runs an {@link ActionFeatureStep} across a population, producing one value per record.
 *
 * Stateless; construct once per assembly. Per-record failures are isolated (that record gets `null`,
 * which the missing-data policy then handles); configuration failures are not, because they are the
 * same for every record.
 */
export class ActionFeatureExtractor {
  constructor(
    private readonly runner: IActionRunner,
    private readonly approvals: IActionApprovalCheck,
    private readonly contextUser?: UserInfo,
  ) {}

  /**
   * Extract the step's feature for every target record.
   *
   * @throws ActionFeatureConfigError when the Action is unapproved, missing, misconfigured, or
   *   reports a validation error — every one of which would otherwise null the whole population.
   */
  public async extract(step: ActionFeatureStep, targets: ActionFeatureTarget[]): Promise<Map<string, number | null>> {
    const contract = resolveActionContract(step);
    await this.assertApproved(step);

    const values = new Map<string, number | null>();
    if (targets.length === 0) {
      return values;
    }
    if (targets.length > ACTION_FEATURE_POPULATION_SOFT_CAP) {
      LogStatus(
        `ActionFeatureExtractor: '${step.FeatureName}' runs Action '${step.ActionRef}' once per record for ` +
          `${targets.length} records. There is no cost budget yet — this is one call per record, per assembly.`,
      );
    }

    let drift = 0;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(contract.maxConcurrency, targets.length) }, async () => {
      // `cursor++` is safe: JS is single-threaded and there is no await between read and increment.
      for (let i = cursor++; i < targets.length; i = cursor++) {
        const target = targets[i];
        const outcome = await this.runOne(step, contract, target);
        if (outcome.clamped) {
          drift++;
        }
        values.set(target.recordId, outcome.value);
      }
    });
    await Promise.all(workers);

    if (drift > 0) {
      LogError(
        `ActionFeatureExtractor: Action '${step.ActionRef}' returned ${drift} value(s) outside the range declared ` +
          `for '${step.FeatureName}' (${step.OutputMin ?? '−∞'}–${step.OutputMax ?? '∞'}); they were clamped.`,
      );
    }
    return values;
  }

  /** Refuse to run code that has not been approved to run. */
  private async assertApproved(step: ActionFeatureStep): Promise<void> {
    const status = await this.approvals.approvalStatus(step.ActionRef, this.contextUser);
    if (status === null) {
      throw new ActionFeatureConfigError(
        `Action feature '${step.FeatureName}' names Action '${step.ActionRef}', which does not exist.`,
      );
    }
    if (status !== 'Approved') {
      throw new ActionFeatureConfigError(
        `Action feature '${step.FeatureName}' cannot run: Action '${step.ActionRef}' has CodeApprovalStatus ` +
          `'${status}', not 'Approved'. Assembling without it would train a model on a feature that is silently absent.`,
      );
    }
  }

  /** Run the Action for one record, isolating a per-record failure as "no data". */
  private async runOne(
    step: ActionFeatureStep,
    contract: ActionFeatureContract,
    target: ActionFeatureTarget,
  ): Promise<{ value: number | null; clamped: boolean }> {
    const params: Record<string, string | number | boolean | null> = {
      ...contract.staticParams,
      [contract.recordParam]: target.recordId,
      [contract.asOfParam]: target.asOf ? target.asOf.toISOString() : null,
    };

    let result: ActionFeatureRunResult;
    try {
      result = await this.runner.run({ actionRef: step.ActionRef, params, contextUser: this.contextUser });
    } catch (err) {
      LogError(
        `ActionFeatureExtractor: Action '${step.ActionRef}' threw for record '${target.recordId}': ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      return { value: null, clamped: false };
    }

    if (result.configError) {
      // Same for every record — fail loudly instead of nulling the whole population.
      throw new ActionFeatureConfigError(
        `Action feature '${step.FeatureName}': Action '${step.ActionRef}' rejected its inputs — ${result.message ?? 'validation error'}.`,
      );
    }
    if (!result.success) {
      LogError(`ActionFeatureExtractor: Action '${step.ActionRef}' failed for record '${target.recordId}': ${result.message ?? 'no detail'}`);
      return { value: null, clamped: false };
    }

    const raw = coerceActionOutput(result.outputs?.[contract.outputParam]);
    if (raw === null) {
      return { value: null, clamped: false };
    }
    return clampToRange(raw, step.OutputMin, step.OutputMax);
  }
}
