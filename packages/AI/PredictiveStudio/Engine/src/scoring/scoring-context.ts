/**
 * @module scoring/scoring-context
 *
 * What every scoring call runs under (§5.2): the request's user and provider ({@link RegistryContext}), the caller's
 * path, PR 1's overwrite option for the column copy, and the run that started the call. The optional
 * {@link ScoringContext.Seams} replace the service's production collaborators (the sidecar, the artifact loader, the
 * model runtime, the Feature Value store, the challenger source, the batch size and the clock), so the service is
 * unit-testable with no database and no sidecar.
 */
import type { MJMLScoringRunEntity } from '@memberjunction/core-entities';
import type { RegistryContext } from '../registry/registry-context';
import type { ScoringServiceSeams } from './scoring-seams';

/** The caller of a scoring run; the CHECK on `MJ: ML Scoring Runs.Path` is the source of the union. */
export type ScoringPath = MJMLScoringRunEntity['Path'];

/** Scoring calls also name their caller and the run that started them, when there is one. */
export interface ScoringContext extends RegistryContext {
  readonly Path: ScoringPath;
  /** PR 1's run option for the binding's column copy: overwrite a value a person entered (default false). */
  readonly OverwriteHumanValues: boolean;
  /** The `MJ: Process Runs` row of the Record Process run that called, when one did. */
  readonly ProcessRunID: string | null;
  /** The `MJ: Scheduled Job Runs` row of the scheduled job that called, when one did. */
  readonly ScheduledJobRunID: string | null;
  /** Replacements for the service's production collaborators; each one left out is the production default. */
  readonly Seams?: Partial<ScoringServiceSeams>;
}
