/**
 * Shared steps of the "Registry and Gate" bundles (G3.1, G3.2): the score-every-row request, the digest that says two
 * scorings predicted the same thing bit for bit, and the servable fixture models a scoring call accepts (a trained
 * Draft is refused MODEL_NOT_SCORABLE before its artifact is loaded, so a registry gate scores Validated or Published
 * models).
 */
import { createHash } from 'node:crypto';
import { RunFixtures, UnitFixtures, type LoadedDataset, type ProtocolChoice, type ScoreAttempt, type ScoreRequest, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

/** A SHA-256 over a scoring attempt's predictions. */
export class PredictionDigest {
  /**
   * The SHA-256 over the attempt's `(RecordID, Score, Class)` predictions sorted by record ID (upper-cased: the server's
   * UUID casing is not part of the prediction). Each score is hashed as its 8 IEEE-754 bytes and each class as a tag
   * byte (0 for null, 1 for a value) followed by the class text, so equal digests mean bit-identical scores and the same
   * classes for the same records. An empty attempt hashes like any other list: callers also check the count.
   */
  public static Of(attempt: ScoreAttempt): string {
    const rows = attempt.Predictions.map((p) => ({ RecordID: p.RecordID.toUpperCase(), Score: p.Score, Class: p.Class }))
      .sort((a, b) => (a.RecordID < b.RecordID ? -1 : a.RecordID > b.RecordID ? 1 : 0));
    const hash = createHash('sha256');
    const scoreBytes = Buffer.alloc(8);
    for (const p of rows) {
      hash.update(p.RecordID).update('\u0000');
      scoreBytes.writeDoubleBE(p.Score, 0);
      hash.update(scoreBytes);
      hash.update(p.Class === null ? '\u0000' : `\u0001${p.Class}`).update('\u0000');
    }
    return hash.digest('hex');
  }
}

/** The scoring request and the fixture models the registry gates score. */
export class PsGateRegistry {
  /** A filter-scope request over every row of the dataset's entity, predictions returned (no write-back). */
  public static ScoreAll(dataset: LoadedDataset): ScoreRequest {
    return { scope: { filter: { entityName: dataset.Entity.Name } } };
  }

  /**
   * A W1-world logistic-regression model (`RunFixtures.TrainedModel`) evaluated and published through the gate, so it
   * scores (W1's stored decision keeps the simple baseline, which does not score until published); returns its ID.
   */
  public static async PublishedWorldModel(h: TruthHarness, tag: string, dataset: LoadedDataset): Promise<string> {
    const id = await RunFixtures.TrainedModel(h, tag, dataset);
    await RunFixtures.PublishModel(h, id, tag);
    return id;
  }

  /**
   * An R1 regression model on a scenario unit (every scenario feature column, ridge regression) held out by a seeded
   * row hash of `holdoutFraction`, evaluated to Validated and then published through the lifecycle gate; returns its ID. Two calls with different
   * fractions train on different rows, so their artifacts differ.
   */
  public static async PublishedR1Model(h: TruthHarness, tag: string, holdoutFraction: number): Promise<string> {
    const protocol: ProtocolChoice = { Kind: 'seeded-random', Fraction: holdoutFraction };
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionScenarioUnitPipeline(h, 'R1', { kind: 'continuous' }, { DateColumn: null, GroupKey: null, Protocol: protocol });
    const t = await h.Train(pipeline);
    if (!t.ModelID) throw new Error(`${tag}: training failed (${t.RefusalCode || 'no refusal code'}): ${t.ErrorMessage || 'no model id'}`);
    await RunFixtures.PublishModel(h, t.ModelID, tag);
    return t.ModelID;
  }
}
