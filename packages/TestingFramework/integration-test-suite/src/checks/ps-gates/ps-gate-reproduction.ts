/**
 * G0.10's measure of training determinism (OF4-53): a training run and its re-training — the same snapshot, seed and
 * code version — reproduce when EVERY candidate the run trains reproduces: each returned artifact (the finalist and
 * every fitted simple baseline the gate could ship) has the same SHA-256, and each inner-CV candidate has the same inner
 * score within 1e-9. The artifact envelope is canonical JSON over the fitted predictor (`artifacts_v2.build`), so equal
 * fitted state gives equal bytes. Comparing only the delivered artifact is not enough: when the gate ships a simple
 * baseline, every algorithm's run delivers the same baseline and an unseeded estimator goes unseen.
 */
import { UUIDsEqual } from '@memberjunction/global';
import type { MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import type { CodeVersion, StoredTrainerResult } from '@memberjunction/predictive-studio-core';

/** The members of a stored trainer result the comparison reads. */
export type TrainerReproductionInputs = Pick<StoredTrainerResult, 'codeVersion' | 'artifacts' | 'innerScores'>;

/** The training-run columns the comparison reads. */
export type ReproductionRunRow = Pick<MJMLTrainingRunEntity, 'ID' | 'TrainingSnapshotID'>;

/** What one training run trained, per candidate, with the inputs that must match for a re-training. */
export interface TrainingFingerprint {
  readonly TrainingRunID: string;
  readonly TrainingSnapshotID: string | null;
  /** The code version (incl. seed and thread count) as canonical JSON. */
  readonly CodeVersion: string;
  readonly ArtifactSha256ByCandidate: ReadonlyMap<string, string>;
  readonly InnerScoreByCandidate: ReadonlyMap<string, number>;
}

/** The comparison of a training with its re-training. */
export interface ReproductionComparison {
  /** Two different runs on the same snapshot, seed and code version. */
  readonly SameInputs: boolean;
  /** Candidates compared: artifacts plus inner-CV candidates, over the union of both runs. */
  readonly CandidatesCompared: number;
  /** `artifact <candidate>` / `inner <candidate>` for each that did not reproduce, sorted. */
  readonly Differing: readonly string[];
  /** SameInputs, at least one candidate compared, none differing. */
  readonly Reproduced: boolean;
  readonly Detail: string;
}

/** The inner-score tolerance: the gate's documented 1e-9. */
const INNER_SCORE_TOLERANCE = 1e-9;

/** G0.10's per-candidate comparison of a training run with its re-training. Pure. */
export class TrainingReproduction {
  /** The fingerprint of one run. Throws when the run returned a candidate twice (the comparison would read only one). */
  public static FingerprintOf(run: ReproductionRunRow, trainer: TrainerReproductionInputs): TrainingFingerprint {
    const artifacts = new Map<string, string>();
    for (const a of trainer.artifacts) {
      if (artifacts.has(a.candidate)) throw new Error(`training run ${run.ID} returned candidate '${a.candidate}' twice`);
      artifacts.set(a.candidate, a.sha256.toLowerCase());
    }
    const inner = new Map<string, number>();
    for (const s of trainer.innerScores) {
      if (inner.has(s.candidate)) throw new Error(`training run ${run.ID} returned candidate '${s.candidate}' twice`);
      inner.set(s.candidate, s.inner.value);
    }
    return {
      TrainingRunID: run.ID, TrainingSnapshotID: run.TrainingSnapshotID, CodeVersion: TrainingReproduction.canonicalCode(trainer.codeVersion),
      ArtifactSha256ByCandidate: artifacts, InnerScoreByCandidate: inner,
    };
  }

  /** Whether `b` reproduces `a`, candidate by candidate. */
  public static Compare(a: TrainingFingerprint, b: TrainingFingerprint): ReproductionComparison {
    const inputs = TrainingReproduction.inputsMismatch(a, b);
    const lines: string[] = [];
    const differing: string[] = [];
    const artifactNames = TrainingReproduction.union(a.ArtifactSha256ByCandidate, b.ArtifactSha256ByCandidate);
    for (const name of artifactNames) {
      const why = TrainingReproduction.artifactDifference(name, a, b);
      if (why !== null) { differing.push(`artifact ${name}`); lines.push(why); }
    }
    const innerNames = TrainingReproduction.union(a.InnerScoreByCandidate, b.InnerScoreByCandidate);
    for (const name of innerNames) {
      const why = TrainingReproduction.innerDifference(name, a, b);
      if (why !== null) { differing.push(`inner ${name}`); lines.push(why); }
    }
    const compared = artifactNames.length + innerNames.length;
    const reproduced = inputs === null && compared > 0 && differing.length === 0;
    const head = inputs !== null ? inputs : compared === 0 ? 'no candidate to compare' : `${compared - differing.length} of ${compared} candidates reproduce`;
    return { SameInputs: inputs === null, CandidatesCompared: compared, Differing: differing.sort(), Reproduced: reproduced, Detail: [head, ...lines].join('; ') };
  }

  /** Null when `b` is a re-training of `a` (another run, same snapshot, same code version incl. seed); else why not. */
  private static inputsMismatch(a: TrainingFingerprint, b: TrainingFingerprint): string | null {
    if (UUIDsEqual(a.TrainingRunID, b.TrainingRunID)) return `run ${a.TrainingRunID} compared with itself`;
    const sameSnapshot = a.TrainingSnapshotID !== null && b.TrainingSnapshotID !== null && UUIDsEqual(a.TrainingSnapshotID, b.TrainingSnapshotID);
    if (sameSnapshot && a.CodeVersion === b.CodeVersion) return null;
    return `not the same snapshot, seed and code version (snapshot ${a.TrainingSnapshotID} / ${b.TrainingSnapshotID}; code ${a.CodeVersion} / ${b.CodeVersion})`;
  }

  private static artifactDifference(name: string, a: TrainingFingerprint, b: TrainingFingerprint): string | null {
    const x = a.ArtifactSha256ByCandidate.get(name);
    const y = b.ArtifactSha256ByCandidate.get(name);
    if (x === undefined) return `${name} missing from ${a.TrainingRunID}`;
    if (y === undefined) return `${name} missing from ${b.TrainingRunID}`;
    return x === y ? null : `${name} ${x.slice(0, 12)} ≠ ${y.slice(0, 12)}`;
  }

  private static innerDifference(name: string, a: TrainingFingerprint, b: TrainingFingerprint): string | null {
    const x = a.InnerScoreByCandidate.get(name);
    const y = b.InnerScoreByCandidate.get(name);
    if (x === undefined) return `inner ${name} missing from ${a.TrainingRunID}`;
    if (y === undefined) return `inner ${name} missing from ${b.TrainingRunID}`;
    return Math.abs(x - y) <= INNER_SCORE_TOLERANCE ? null : `inner ${name} ${x} ≠ ${y}`;
  }

  private static union(a: ReadonlyMap<string, string | number>, b: ReadonlyMap<string, string | number>): string[] {
    return [...new Set([...a.keys(), ...b.keys()])].sort();
  }

  /** The code version as JSON with library versions in key order, so two equal versions print the same. */
  private static canonicalCode(c: CodeVersion): string {
    const libs = Object.keys(c.libraryVersions).sort().map((k) => [k, c.libraryVersions[k]]);
    return JSON.stringify({ psGitSha: c.psGitSha, sidecarVersion: c.sidecarVersion, libraryVersions: Object.fromEntries(libs), threads: c.threads, seed: c.seed });
  }
}
