import { describe, it, expect } from 'vitest';
import { EvaluationProtocol, type EvaluationProtocolSpec } from '@memberjunction/predictive-studio-core';
import { InMemorySnapshotFileStore, PreAuthDownloads } from '../../snapshot/snapshot-file-store';
import { TrainerRequestBuilder, type TrainerRequestInput } from '../trainer-request';
import { TrainingRefusedError } from '../training-refusal';
import { ProtocolRowFixture } from './fixtures/protocol-row';

function protocol(innerValidation?: string): EvaluationProtocolSpec {
  const r = EvaluationProtocol.ParseEvaluationProtocolRow(ProtocolRowFixture.Row(innerValidation ? { InnerValidation: innerValidation } : {}));
  if (r.Ok === false) throw new Error(r.Errors.join('; '));
  return r.Value;
}

/** A request input over a matrix and manifest stored in `files`. */
async function inputOver(files: InMemorySnapshotFileStore, p: EvaluationProtocolSpec, unitGroupKey: string | null = null): Promise<TrainerRequestInput> {
  const matrix = await files.Put('k/matrix.jsonl', 'm', new TextEncoder().encode('{"format":"ps-snapshot-matrix/v1"}\n'));
  const manifest = await files.Put('k/manifest.jsonl', 'n', new TextEncoder().encode('{"rowId":"r1"}\n'));
  return {
    TrainingRunID: 'RUN-1', Files: files, Protocol: p, Task: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 },
    Unit: { id: 'U-1', groupKey: unitGroupKey },
    Snapshot: {
      ID: 'SNAP-1', ContentHash: 'c'.repeat(64), FeatureSchemaHash: 'f'.repeat(64),
      MatrixFileID: matrix.FileID, MatrixSha256: matrix.Sha256, RowManifestFileID: manifest.FileID, RowManifestSha256: manifest.Sha256,
    },
    Candidates: [TrainerRequestBuilder.CandidateFromPipeline('xgb', 'ALG-1', 'xgboost', '{"n_estimators":300}')],
    Now: new Date('2026-10-12T00:00:00.000Z'),
  };
}

describe('TrainerRequestBuilder', () => {
  it('pre-authorises the matrix and manifest with their stored SHA-256 and takes seed and timeout from the protocol', async () => {
    const files = new InMemorySnapshotFileStore('provider-local', 600);
    const p = protocol();
    const input = await inputOver(files, p);
    const req = await TrainerRequestBuilder.BuildTrainerRequest(input);
    expect(req.snapshot.matrix.sha256).toBe(input.Snapshot.MatrixSha256);
    expect(req.snapshot.featureSchemaHash).toBe('f'.repeat(64));
    expect(req.snapshot.rowManifest.url.startsWith('data:application/x-ndjson;base64,')).toBe(true);
    expect(Buffer.from(req.snapshot.rowManifest.url.split(',')[1], 'base64').toString('utf8')).toBe('{"rowId":"r1"}\n');
    expect(req.snapshot.matrix.expiresAt).toBe('2026-10-12T00:10:00.000Z');
    expect([req.seed, req.threads, req.timeoutSeconds, req.maxRetries]).toEqual([p.seed, 1, p.budgets.maxComputeSeconds, 2]);
    expect(req.incumbent).toBeNull();
    expect(TrainerRequestBuilder.TrainerRequestConfigOf(req)).toEqual({ evaluationProtocolId: p.id, candidates: req.candidates, seed: p.seed, threads: 1, timeoutSeconds: p.budgets.maxComputeSeconds, maxRetries: 2 });
  });

  it('states a download that does not expire with a null lifetime and a null expiry', async () => {
    const req = await TrainerRequestBuilder.BuildTrainerRequest(await inputOver(new InMemorySnapshotFileStore('p'), protocol()));
    expect([req.snapshot.matrix.driverLifetimeSeconds, req.snapshot.matrix.expiresAt, req.snapshot.matrix.issuedAt]).toEqual([null, null, '2026-10-12T00:00:00.000Z']);
  });

  it('replays a logged seed, timeout and retry bound, 0 included', async () => {
    const req = await TrainerRequestBuilder.BuildTrainerRequest({ ...(await inputOver(new InMemorySnapshotFileStore('p'), protocol())), Seed: 7, TimeoutSeconds: 30, MaxRetries: 0 });
    expect([req.seed, req.timeoutSeconds, req.maxRetries]).toEqual([7, 30, 0]);
  });

  it("refuses a protocol that groups inner validation by a key other than the unit's group key", async () => {
    const grouped = protocol(JSON.stringify({ kind: 'grouped-kfold', folds: 5, repeats: 1, groupKey: 'PersonID' }));
    const refused = TrainerRequestBuilder.BuildTrainerRequest(await inputOver(new InMemorySnapshotFileStore('p'), grouped, null));
    await expect(refused).rejects.toBeInstanceOf(TrainingRefusedError);
    await expect(refused).rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'unit-invalid', unitId: 'U-1' } } });
    const req = await TrainerRequestBuilder.BuildTrainerRequest(await inputOver(new InMemorySnapshotFileStore('p'), grouped, 'PersonID'));
    expect(req.protocol.innerValidation).toMatchObject({ kind: 'grouped-kfold', groupKey: 'PersonID' });
  });

  it('keeps scalar hyperparameters and refuses a nested one by name', () => {
    expect(TrainerRequestBuilder.CandidateFromPipeline('rf', 'A', 'random_forest', '{"n_estimators":50,"max_depth":null}').hyperparameters).toEqual({ n_estimators: 50, max_depth: null });
    expect(() => TrainerRequestBuilder.CandidateFromPipeline('rf', 'A', 'random_forest', '{"grid":[1,2]}')).toThrow("hyperparameter 'grid' must be a number, string, boolean or null");
  });

  it('refuses a download for a file the store does not hold', async () => {
    await expect(new InMemorySnapshotFileStore('p').CreatePreAuthDownload('missing', 'a'.repeat(64))).rejects.toThrow('snapshot file missing not found');
  });
});

describe('PreAuthDownloads', () => {
  it("states each storage driver's URL lifetime: none for the local file system, ten minutes for the cloud drivers, none when unstated", () => {
    expect(PreAuthDownloads.LifetimeSecondsOf('Local File System Storage')).toBeNull();
    for (const key of ['AWS S3 Storage', 'Azure Blob Storage', 'Google Cloud Storage', 'SharePoint Storage']) expect(PreAuthDownloads.LifetimeSecondsOf(key)).toBe(600);
    expect(PreAuthDownloads.LifetimeSecondsOf('Dropbox Storage')).toBeNull();
    expect(PreAuthDownloads.LifetimeSecondsOf(' aws s3 storage ')).toBe(600);
  });

  it('issues a download expiring after its lifetime, or never when the lifetime is null', () => {
    const now = new Date('2026-10-12T00:00:00.000Z');
    expect(PreAuthDownloads.IssuedDownload('F', 'https://x', 'a'.repeat(64), 600, now)).toEqual({ fileId: 'F', url: 'https://x', issuedAt: '2026-10-12T00:00:00.000Z', driverLifetimeSeconds: 600, expiresAt: '2026-10-12T00:10:00.000Z', sha256: 'a'.repeat(64) });
    expect(PreAuthDownloads.IssuedDownload('F', 'file:///x', 'a'.repeat(64), null, now)).toMatchObject({ driverLifetimeSeconds: null, expiresAt: null });
  });
});
