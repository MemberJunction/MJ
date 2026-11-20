/**
 * The Predictive Studio Registry Check job run's `Details` (§5.7 R7), read back: the findings each run recorded and the
 * pre-change model migration's record (step (g), under {@link RegistryCheckDetails.PreChangeKey}). Browser-safe: the
 * job writes the document (the engine's `PredictiveStudioRegistryCheckJobDriver`), the model detail's monitoring tab
 * reads the findings about one model from it here, so no component parses the job's schema itself.
 */
import { UUIDsEqual } from '@memberjunction/global';

import { JsonParse, type JsonObject } from './json-value';

/** The R7 finding letter: (a)–(i), (g) being the pre-change model migration. */
export type RegistryFindingLetter = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i';

/** What became of a finding: `remediated`, `recorded` (nothing to act on), or `retry` (found again next run). */
export type RegistryFindingOutcome = 'remediated' | 'recorded' | 'retry';

/** One finding of a Registry Check run about a model. */
export interface RegistryModelFinding {
  /** The finding's letter. */
  readonly Finding: RegistryFindingLetter;
  /** What the job found, in words. */
  readonly Detail: string;
  /** What the job did about it, in words. */
  readonly Action: string;
  /** What became of it. */
  readonly Outcome: RegistryFindingOutcome;
}

/** Every finding letter, to read a stored one back as the typed union. */
const FINDING_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const satisfies readonly RegistryFindingLetter[];
/** Every outcome, to read a stored one back as the typed union. */
const FINDING_OUTCOMES = ['remediated', 'recorded', 'retry'] as const satisfies readonly RegistryFindingOutcome[];
/** Step (g)'s artifact lists and the `ArtifactStatus` each records. */
const ARTIFACT_LISTS = [['Verified', 'verified'], ['LegacyLocal', 'legacy-local'], ['Missing', 'missing'], ['HashMismatch', 'hash-mismatch']] as const;

/** Reads a Registry Check run's `Details`. */
export class RegistryCheckDetails {
  /** The key of the pre-change model migration's record in a run's `Details` (written by step (g)). */
  public static readonly PreChangeKey = 'PreChangeModels';

  /**
   * The findings of one run's `Details` about `modelId`: step (g)'s entries first (adopted, demoted with the refusal,
   * or its artifact's recorded state), then each of `Details.Findings` whose `SubjectID` is the model. A `Details` that
   * is not a JSON object, or an entry without a known letter or outcome, records nothing. Pure.
   */
  public static FindingsAbout(details: string | null, modelId: string): RegistryModelFinding[] {
    const parsed = JsonParse.ParseJsonText(details, 'Details');
    if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) return [];
    const migration = JsonParse.JsonObjectField(parsed.Value, RegistryCheckDetails.PreChangeKey);
    const out = migration ? RegistryCheckDetails.migrationFindings(migration, modelId) : [];
    for (const entry of JsonParse.JsonArrayField(parsed.Value, 'Findings') || []) {
      if (!JsonParse.IsJsonObject(entry) || !UUIDsEqual(JsonParse.JsonString(entry, 'SubjectID'), modelId)) continue;
      const finding = RegistryCheckDetails.findingOf(entry);
      if (finding !== null) out.push(finding);
    }
    return out;
  }

  /** One stored finding, or null when its letter or outcome is not one the job writes. */
  private static findingOf(entry: JsonObject): RegistryModelFinding | null {
    const letter = JsonParse.JsonString(entry, 'Finding');
    const outcome = JsonParse.JsonString(entry, 'Outcome');
    const finding = FINDING_LETTERS.find((l) => l === letter);
    const result = FINDING_OUTCOMES.find((o) => o === outcome);
    if (finding === undefined || result === undefined) return null;
    return { Finding: finding, Detail: JsonParse.JsonString(entry, 'Detail') || '', Action: JsonParse.JsonString(entry, 'Action') || '', Outcome: result };
  }

  /** Step (g)'s entries about the model: adopted, demoted (with the refusal's kind) or its artifact's recorded state. */
  private static migrationFindings(record: JsonObject, modelId: string): RegistryModelFinding[] {
    const listed = (o: JsonObject | null, key: string): boolean => (o ? JsonParse.JsonStringArray(o, key) || [] : []).some((id) => UUIDsEqual(id, modelId));
    const out: RegistryModelFinding[] = [];
    const reverified = JsonParse.JsonObjectField(record, 'Reverified');
    if (listed(reverified, 'Adopted')) {
      out.push({ Finding: 'g', Detail: 'trained before the lifecycle gate; re-verified on its stored gate record', Action: 'kept Published with an adopt record', Outcome: 'remediated' });
    }
    for (const demoted of (reverified ? JsonParse.JsonArrayField(reverified, 'Demoted') : null) || []) {
      if (!JsonParse.IsJsonObject(demoted) || !UUIDsEqual(JsonParse.JsonString(demoted, 'ModelID'), modelId)) continue;
      const refusal = JsonParse.JsonObjectField(demoted, 'Refusal');
      const kind = (refusal && JsonParse.JsonString(refusal, 'kind')) || 'refused';
      out.push({ Finding: 'g', Detail: 'trained before the lifecycle gate; its stored gate record did not re-verify', Action: `demoted to Unevaluated (${kind})`, Outcome: 'remediated' });
    }
    const artifacts = JsonParse.JsonObjectField(record, 'Artifacts');
    for (const [key, state] of ARTIFACT_LISTS) {
      if (listed(artifacts, key)) out.push({ Finding: 'g', Detail: 'trained before the lifecycle gate; its artifact was checked once', Action: `artifact recorded ${state}`, Outcome: 'recorded' });
    }
    return out;
  }
}
