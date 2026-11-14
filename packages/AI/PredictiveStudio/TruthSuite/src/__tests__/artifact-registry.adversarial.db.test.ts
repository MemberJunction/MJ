// Runs under vitest.db.config.ts against the PR's private database, never the unit run.
//
// The M2 adversarial harness (Task M2.5, D-071): one case per cell of M2's coverage table, each trying to break the
// claim its name states. Every artifact is written by the production store (`ArtifactRegistry.ForContext(...).Store`,
// over `StorageProviderArtifactStore` and the database's real `Local File System` provider under STORAGE_LOCAL_ROOT),
// every model row by the generated entity, and every load goes through the production reader
// (`RunViewMLModelLoader` → `ArtifactRegistry.Load` → `StorageProviderArtifactLoader`). The damage a case does to
// storage (a deleted, truncated, emptied or swapped object, an edited legacy file) is done with `node:fs`, out of band,
// as a lost disk or an operator does it. The harness verifies with `mssql` and deletes what it created by ID.
import { createHash, randomBytes } from 'node:crypto';
import type * as NodeCrypto from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import sql from 'mssql';
import { RunView, UserInfo, UserRoleInfo, type BaseEntity, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import type { MJFileEntity, MJMLAlgorithmEntity, MJMLModelEntity, MJMLTrainingPipelineEntity, MJUserEntity, MJUserRoleEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import type { ArtifactLoad, StoredFile } from '@memberjunction/predictive-studio-core';
import {
  ArtifactAlreadyStoredError,
  ArtifactRegistry,
  LocalArtifactPath,
  MetadataEntityFactory,
  PredictiveStudioStorage,
  RunViewMLModelLoader,
  StorageProviderArtifactLoader,
  StorageProviderArtifactStore,
  type RegistryContext,
} from '@memberjunction/predictive-studio';
import { BootstrapIntegrationServer, SEED_FIXTURES_COMMAND, SEEDED_NOGRANT_EMAIL, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';
import { ArtifactObjects } from '../harness/artifact-objects';
import { ConsoleCapture } from './fixtures/console-capture';

/**
 * The parallel-write case forces one object key without stubbing production: the store's own key derivation
 * (`<KEY_PREFIX>/<randomUUID()>/<name>`) runs unchanged and only the platform's UUID source is fixed, as M2.1's unit test
 * fixes it. Only the next `Remaining` draws return `Fixed`: a save derives its key synchronously, before its first
 * await, so the forced draws are exactly the key derivations of the saves started together, and every later draw (the
 * local driver's temporary file name, entity IDs) is fresh. A save that drew its key elsewhere fails the case's
 * key assertion, never passes it.
 */
const keyUuid = vi.hoisted(() => ({ Fixed: '', Remaining: 0 }));
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeCrypto>();
  return {
    ...actual,
    randomUUID: (): string => {
      if (keyUuid.Remaining <= 0) return actual.randomUUID();
      keyUuid.Remaining--;
      return keyUuid.Fixed;
    },
  };
});

/** Force the key of the next `count` saves started together to `<KEY_PREFIX>/<uuid>/<name>`. */
function forceNextKeys(uuid: string, count: number): void {
  keyUuid.Fixed = uuid;
  keyUuid.Remaining = count;
}

/** One registry load and the hash the model registered when it was read, for the file-wide bytes check. */
interface RecordedLoad {
  readonly Case: string;
  readonly Registered: string | null;
  readonly Load: ArtifactLoad;
}

/** Row counts and storage-object counts, before the file runs and after its teardown. */
interface HarnessCensus {
  readonly Files: number;
  readonly Models: number;
  readonly Pipelines: number;
  readonly ArtifactObjects: number;
  readonly ArtifactDirectories: number;
}

const TAG = `PSArtifactRegistry-${Date.now()}`;
/** The SHA-256 of zero bytes. */
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;
let ownerCtx: RegistryContext;
let registry: ArtifactRegistry;
let storageRoot: string;
let legacyDir: string;
let savedArtifactDir: string | undefined;
let localProviderId: string;
let pipelineId: string;
let algorithmId: string;
let nextVersion = 1;
let startCensus: HarnessCensus;

/** Every row and object the file created, for the teardown by ID. */
const createdModelIDs: string[] = [];
const createdFileIDs: string[] = [];
/** Objects whose file row a case deleted: the teardown removes the object itself. */
const unrecordedObjects: Pick<StoredFile, 'fileId' | 'providerKey'>[] = [];
const loads: RecordedLoad[] = [];
/** Every provider key the file stored, for the directory sweep. */
const storedKeys: string[] = [];

/** `[schema].[table]` of an entity, read from metadata so no schema name is written here. */
function tableOf(provider: IMetadataProvider, entityName: string): string {
  const entity: EntityInfo | undefined = provider.EntityByName(entityName);
  if (!entity) throw new Error(`entity ${entityName} is not in metadata: run the migration and CodeGen`);
  return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/** Lower-case hex SHA-256 of the bytes. */
function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Synthetic artifact bytes, unique per call: a JSON body as the trainer's artifacts are. */
function artifactBytes(label: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ model: label, tag: TAG, weights: randomBytes(48).toString('hex') }));
}

/** Save a new row of `entityName` with `fill` applied, as `user`; throws with the provider's message when it fails. */
async function createRow<T extends BaseEntity>(entityName: string, fill: (row: T) => void, user: UserInfo = server.User): Promise<T> {
  const row = await server.Provider.GetEntityObject<T>(entityName, user);
  row.NewRecord();
  fill(row);
  if (!(await row.Save())) throw new Error(`fixture ${entityName} did not save: ${row.LatestResult?.CompleteMessage}`);
  return row;
}

/** Store the bytes through the production registry (write-once store, real provider); the file is torn down by ID. */
async function storeArtifact(bytes: Uint8Array, name: string, reg: ArtifactRegistry = registry): Promise<StoredFile> {
  const stored = await reg.Store(bytes, name, ownerCtx);
  createdFileIDs.push(stored.fileId);
  storedKeys.push(stored.providerKey);
  return stored;
}

/** A model row of the file's pipeline naming the artifact file and registering `sha256`, saved through the entity. */
async function createModel(artifactFileId: string, sha256: string | null): Promise<string> {
  const version = nextVersion++;
  const model = await createRow<MJMLModelEntity>('MJ: ML Models', (m) => {
    m.PipelineID = pipelineId;
    m.AlgorithmID = algorithmId;
    m.Version = version;
    m.FeatureSchema = '[]';
    m.TargetVariable = 'Probe';
    m.ProblemType = 'classification';
    m.ArtifactFileID = artifactFileId;
    m.ArtifactSha256 = sha256;
    // as the trainer's write path records it (M2.3): verified when a hash is registered
    m.ArtifactStatus = sha256 ? 'verified' : 'unverified';
  });
  createdModelIDs.push(model.ID);
  return model.ID;
}

/** The model row as the scoring loader reads it (`RunViewMLModelLoader`); throws when it is not found. */
async function readModel(modelId: string, user: UserInfo = server.User): Promise<MJMLModelEntity> {
  const model = await new RunViewMLModelLoader().loadModel(modelId, user, server.Provider);
  if (!model) throw new Error(`ML Model ${modelId} was not read back`);
  return model;
}

/** Load the model's artifact through the production registry for `ctx`, recording the load for the bytes check. */
async function loadArtifact(caseName: string, model: Pick<MJMLModelEntity, 'ID' | 'ArtifactFileID' | 'ArtifactSha256'>, ctx: RegistryContext = ownerCtx): Promise<ArtifactLoad> {
  const reg = ctx === ownerCtx ? registry : ArtifactRegistry.ForContext(ctx, new StorageProviderArtifactLoader());
  const load = await reg.Load(model, ctx);
  loads.push({ Case: caseName, Registered: model.ArtifactSha256, Load: load });
  return load;
}

/** {@link loadArtifact}, with a thrown `Error` returned as the value, so a case can assert what a refusal carries. */
async function loadOrError(caseName: string, model: Pick<MJMLModelEntity, 'ID' | 'ArtifactFileID' | 'ArtifactSha256'>, ctx: RegistryContext): Promise<ArtifactLoad | Error> {
  try {
    return await loadArtifact(caseName, model, ctx);
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
}

/** The absolute path of a stored object under STORAGE_LOCAL_ROOT, resolved as the local driver resolves it. */
function objectPathOf(stored: Pick<StoredFile, 'fileId' | 'providerKey'>): string {
  return ArtifactObjects.ObjectPath(storageRoot, stored.fileId, stored.providerKey);
}

/** A legacy `MJ: Files` row (no `ProviderKey`; bytes on local disk under PS_ARTIFACT_DIR), as PR 3's store wrote. */
async function createLegacyFile(bytes: Uint8Array, name: string): Promise<string> {
  const file = await createRow<MJFileEntity>('MJ: Files', (f) => {
    f.Name = name;
    f.ContentType = 'application/json';
    f.ProviderID = localProviderId;
    f.ProviderKey = null;
    f.Status = 'Uploaded';
    f.Description = `${TAG} legacy artifact`;
  });
  createdFileIDs.push(file.ID);
  writeFileSync(LocalArtifactPath(legacyDir, file.ID), bytes);
  return file.ID;
}

/**
 * The seeded role-less principal (`it-nogrant@integration.test`, `metadata-optional/integration-test`) as a real
 * `UserInfo` with its `UserRoles`, built from its `MJ: Users` row and `MJ: User Roles` rows read through the bootstrap's
 * provider — the way the testing framework's permission checks build it (`permission-engine.checks.ts`).
 *
 * @throws when the seed has not been pushed, naming the command that seeds it
 */
async function seededNoGrantUser(): Promise<UserInfo> {
  const rv = RunView.FromMetadataProvider(server.Provider);
  const users = await rv.RunView<Pick<MJUserEntity, 'ID' | 'Name' | 'Email' | 'Type' | 'IsActive'>>({
    EntityName: 'MJ: Users', ExtraFilter: `Email='${EscapeSQLString(SEEDED_NOGRANT_EMAIL)}'`, Fields: ['ID', 'Name', 'Email', 'Type', 'IsActive'], ResultType: 'simple',
  }, server.User);
  if (!users.Success) throw new Error(`reading MJ: Users for ${SEEDED_NOGRANT_EMAIL} failed: ${users.ErrorMessage}`);
  const row = users.Results[0];
  if (!row) throw new Error(`the restricted user ${SEEDED_NOGRANT_EMAIL} is not seeded: run ${SEED_FIXTURES_COMMAND}`);
  const roles = await rv.RunView<Pick<MJUserRoleEntity, 'UserID' | 'RoleID'>>({
    EntityName: 'MJ: User Roles', ExtraFilter: `UserID='${EscapeSQLString(row.ID)}'`, Fields: ['UserID', 'RoleID'], ResultType: 'simple',
  }, server.User);
  if (!roles.Success) throw new Error(`reading MJ: User Roles for ${SEEDED_NOGRANT_EMAIL} failed: ${roles.ErrorMessage}`);
  return new UserInfo(server.Provider, { ...row, UserRoles: roles.Results.map((r) => new UserRoleInfo({ UserID: r.UserID, RoleID: r.RoleID })) });
}

/** A model's stored `ArtifactStatus`, by SQL (verification only). */
async function storedArtifactStatus(modelId: string): Promise<MJMLModelEntity['ArtifactStatus'][]> {
  const r = await pool.request()
    .input('ID', sql.UniqueIdentifier, modelId)
    .query<Pick<MJMLModelEntity, 'ArtifactStatus'>>(`SELECT ArtifactStatus FROM ${tableOf(server.Provider, 'MJ: ML Models')} WHERE ID = @ID`);
  return r.recordset.map((row) => row.ArtifactStatus);
}

/** The `MJ: Files` rows recording a provider key, by SQL (verification only). */
async function fileRowsWithKey(providerKey: string): Promise<string[]> {
  const r = await pool.request()
    .input('Key', sql.NVarChar(500), providerKey)
    .query<{ ID: string }>(`SELECT ID FROM ${tableOf(server.Provider, 'MJ: Files')} WHERE ProviderKey = @Key`);
  return r.recordset.map((row) => row.ID);
}

/** Files, models and pipelines in the database, and model-artifact objects and directories under the storage root. */
async function census(): Promise<HarnessCensus> {
  const p = server.Provider;
  const r = await pool.request().query<Pick<HarnessCensus, 'Files' | 'Models' | 'Pipelines'>>(`SELECT
    (SELECT COUNT(*) FROM ${tableOf(p, 'MJ: Files')}) AS Files,
    (SELECT COUNT(*) FROM ${tableOf(p, 'MJ: ML Models')}) AS Models,
    (SELECT COUNT(*) FROM ${tableOf(p, 'MJ: ML Training Pipelines')}) AS Pipelines`);
  const artifactsRoot = path.join(storageRoot, StorageProviderArtifactStore.KEY_PREFIX);
  let objects = 0;
  let directories = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        directories++;
        walk(path.join(dir, entry.name));
      } else {
        objects++;
      }
    }
  };
  if (existsSync(artifactsRoot)) walk(artifactsRoot);
  return { ...r.recordset[0], ArtifactObjects: objects, ArtifactDirectories: directories };
}

/** The production store over the owner's context, for the teardown's deletes (object, then row; legacy local file). */
function teardownStore(): StorageProviderArtifactStore {
  return new StorageProviderArtifactStore(new MetadataEntityFactory(server.Provider), new PredictiveStudioStorage(server.Provider, server.User));
}

/** Delete one model row by ID through its entity; a row a case already removed is skipped. */
async function deleteModel(modelId: string): Promise<void> {
  const model = await server.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', server.User);
  if (!(await model.Load(modelId))) return;
  if (!(await model.Delete())) throw new Error(`teardown: ML Model ${modelId} did not delete: ${model.LatestResult?.CompleteMessage}`);
}

/** Delete one file by ID through the production store (its object, then its row); a row already gone is skipped. */
async function deleteFile(fileId: string): Promise<void> {
  if (!(await new PredictiveStudioStorage(server.Provider, server.User).LocationOf(fileId))) return;
  await teardownStore().delete(fileId);
}

/** Remove an object whose row a case deleted (the store's delete needs the row, so the object is removed here). */
function removeUnrecordedObject(stored: Pick<StoredFile, 'fileId' | 'providerKey'>): void {
  rmSync(objectPathOf(stored), { force: true });
}

/** Remove the `<KEY_PREFIX>/<uuid>` directories the file's keys named, once empty (the local driver leaves them). */
function removeEmptyKeyDirectories(keys: readonly string[]): void {
  for (const key of keys) {
    const dir = path.dirname(ArtifactObjects.ObjectPath(storageRoot, `(a key the harness stored)`, key));
    if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  }
}

// The bootstrap loads all metadata; on a loaded host that alone has taken 44 s, past vitest's default hook timeout.
const BOOTSTRAP_TIMEOUT_MS = 120_000;

beforeAll(async () => {
  const root = process.env.STORAGE_LOCAL_ROOT?.trim();
  if (!root) throw new Error('STORAGE_LOCAL_ROOT is unset: the harness writes through the Local File System provider, whose root it names');
  storageRoot = path.resolve(root);
  const boot = await ConsoleCapture.During('log', () => BootstrapIntegrationServer());
  expect(ConsoleCapture.UnexpectedBootstrapLines(boot.Lines)).toEqual([]);
  server = boot.Result;
  pool = await TruthConnection.OpenPool();
  ownerCtx = { ContextUser: server.User, Provider: server.Provider };
  registry = ArtifactRegistry.ForContext(ownerCtx, new StorageProviderArtifactLoader());
  savedArtifactDir = process.env.PS_ARTIFACT_DIR;
  legacyDir = mkdtempSync(path.join(tmpdir(), 'ps-m25-legacy-artifacts-'));
  process.env.PS_ARTIFACT_DIR = legacyDir;
  startCensus = await census();
  const binding = await new PredictiveStudioStorage(server.Provider, server.User).ConfiguredDriver();
  localProviderId = binding.Provider.ID;
  const algorithms = await RunView.FromMetadataProvider(server.Provider).RunView<Pick<MJMLAlgorithmEntity, 'ID'>>(
    { EntityName: 'MJ: ML Algorithms', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
    server.User,
  );
  const firstAlgorithm = algorithms.Results[0]?.ID;
  if (!algorithms.Success || !firstAlgorithm) throw new Error('no MJ: ML Algorithms row to name: push the metadata');
  algorithmId = firstAlgorithm;
  const usersEntityId = server.Provider.EntityByName('MJ: Users')?.ID;
  if (!usersEntityId) throw new Error('MJ: Users is not in metadata');
  const pipeline = await createRow<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', (p) => {
    p.Name = TAG;
    p.TargetEntityID = usersEntityId;
    p.TargetVariable = 'Probe';
    p.ProblemType = 'classification';
    p.AlgorithmID = algorithmId;
  });
  pipelineId = pipeline.ID;
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  keyUuid.Remaining = 0;
  try {
    if (server && pool) await teardown();
  } finally {
    if (savedArtifactDir === undefined) delete process.env.PS_ARTIFACT_DIR;
    else process.env.PS_ARTIFACT_DIR = savedArtifactDir;
    if (legacyDir) rmSync(legacyDir, { recursive: true, force: true });
    await pool?.close();
    await server?.ClosePool();
  }
}, BOOTSTRAP_TIMEOUT_MS);

/** Delete every model, file, object and the pipeline the file created, by ID, then require the starting census. */
async function teardown(): Promise<void> {
  for (const id of createdModelIDs) await deleteModel(id);
  for (const id of createdFileIDs) await deleteFile(id);
  for (const stored of unrecordedObjects) removeUnrecordedObject(stored);
  removeEmptyKeyDirectories(storedKeys);
  if (pipelineId) {
    const pipeline = await server.Provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', server.User);
    if ((await pipeline.Load(pipelineId)) && !(await pipeline.Delete())) {
      throw new Error(`teardown: ML Training Pipeline ${pipelineId} did not delete: ${pipeline.LatestResult?.CompleteMessage}`);
    }
  }
  expect(await census()).toEqual(startCensus);
}

/** A stored artifact and the model row that registers its stored SHA-256, read back as the scoring loader reads it. */
async function storedModel(label: string): Promise<{ Stored: StoredFile; Bytes: Uint8Array; Model: MJMLModelEntity }> {
  const bytes = artifactBytes(label);
  const stored = await storeArtifact(bytes, `${label}.json`);
  const model = await readModel(await createModel(stored.fileId, stored.sha256));
  return { Stored: stored, Bytes: bytes, Model: model };
}

describe('the artifact registry over the real Local File System provider', () => {
  it('verified: a stored artifact loads verified, and its bytes hash to the SHA-256 the model registered', async () => {
    const { Stored, Bytes, Model } = await storedModel('verified');
    expect(Stored).toMatchObject({ sha256: sha256Hex(Bytes), sizeBytes: Bytes.byteLength, storageProviderId: localProviderId, writeOnce: true });
    expect(sha256Hex(readFileSync(objectPathOf(Stored)))).toBe(Model.ArtifactSha256);
    const load = await loadArtifact('verified', Model);
    expect(load.Status).toBe('verified');
    if (load.Status !== 'verified') return;
    expect(sha256Hex(load.Bytes)).toBe(Model.ArtifactSha256);
    expect(load.Sha256).toBe(Model.ArtifactSha256);
    expect(load.Bytes).toEqual(Bytes);
  });

  it('missing (object deleted): a model whose stored object is gone loads missing with its file ID, never null and never bytes', async () => {
    const { Stored, Model } = await storedModel('missing');
    rmSync(objectPathOf(Stored));
    expect(await loadArtifact('missing', Model)).toEqual({ Status: 'missing', FileID: Stored.fileId });
  });

  it("hash-mismatch (bytes of another model): a model whose object holds another model's artifact loads hash-mismatch, naming both hashes", async () => {
    const victim = await storedModel('swapped-victim');
    const other = await storedModel('swapped-other');
    writeFileSync(objectPathOf(victim.Stored), readFileSync(objectPathOf(other.Stored)));
    expect(await loadArtifact('hash-mismatch', victim.Model)).toEqual({ Status: 'hash-mismatch', Expected: victim.Stored.sha256, Actual: other.Stored.sha256 });
  });

  it('unverified (no registered hash): a model with no registered SHA-256 loads unverified, never verified', async () => {
    const stored = await storeArtifact(artifactBytes('unverified'), 'unverified.json');
    const model = await readModel(await createModel(stored.fileId, null));
    expect(model.ArtifactSha256).toBeNull();
    expect(await loadArtifact('unverified', model)).toEqual({ Status: 'unverified', ModelID: model.ID });
  });

  it('legacy row (empty provider key, bytes on local disk): the local bytes are verified exactly like a provider object', async () => {
    const bytes = artifactBytes('legacy');
    const fileId = await createLegacyFile(bytes, 'legacy.json');
    const model = await readModel(await createModel(fileId, sha256Hex(bytes)));
    const load = await loadArtifact('legacy', model);
    expect(load.Status).toBe('verified');
    if (load.Status !== 'verified') return;
    expect(sha256Hex(load.Bytes)).toBe(model.ArtifactSha256);
    expect(load.Bytes).toEqual(bytes);
  });

  it('legacy row whose local file was edited: hash-mismatch naming both hashes, never the edited bytes', async () => {
    const bytes = artifactBytes('legacy-edited');
    const fileId = await createLegacyFile(bytes, 'legacy-edited.json');
    const model = await readModel(await createModel(fileId, sha256Hex(bytes)));
    const edited = new TextEncoder().encode(new TextDecoder().decode(bytes).replace('legacy-edited', 'legacy-EDITED'));
    writeFileSync(LocalArtifactPath(legacyDir, fileId), edited);
    expect(await loadArtifact('legacy-edited', model)).toEqual({ Status: 'hash-mismatch', Expected: sha256Hex(bytes), Actual: sha256Hex(edited) });
  });

  it('trainer path (returned bytes do not hash to the declared SHA-256): the store reports the hash of the bytes it wrote, and a row registering the declaration loads hash-mismatch', async () => {
    const declaredFor = artifactBytes('trainer-declared');
    const returned = artifactBytes('trainer-returned');
    const declared = sha256Hex(declaredFor);
    const stored = await storeArtifact(returned, 'trainer-returned.json');
    expect(stored.sha256).toBe(sha256Hex(returned));
    expect(stored.sha256).not.toBe(declared);
    const model = await readModel(await createModel(stored.fileId, declared));
    expect(await loadArtifact('trainer-path', model)).toEqual({ Status: 'hash-mismatch', Expected: declared, Actual: stored.sha256 });
  });

  it('truncated object: a stored object cut short loads hash-mismatch, never verified', async () => {
    const { Stored, Bytes, Model } = await storedModel('truncated');
    const keep = Math.floor(Bytes.byteLength / 2);
    truncateSync(objectPathOf(Stored), keep);
    expect(await loadArtifact('truncated', Model)).toEqual({ Status: 'hash-mismatch', Expected: Stored.sha256, Actual: sha256Hex(Bytes.slice(0, keep)) });
  });

  it('zero-byte object: an emptied object loads hash-mismatch with the empty digest, never verified and never missing', async () => {
    const { Stored, Model } = await storedModel('zero-byte');
    truncateSync(objectPathOf(Stored), 0);
    expect(await loadArtifact('zero-byte', Model)).toEqual({ Status: 'hash-mismatch', Expected: Stored.sha256, Actual: EMPTY_SHA256 });
  });

  it("deleted MJ: Files row (object still present): a model naming a file row that is gone loads missing, never the object's bytes", async () => {
    const { Stored, Model } = await storedModel('row-deleted');
    // The database refuses to delete a file row a model still names (FK_MLModel_ArtifactFile)…
    const file = await server.Provider.GetEntityObject<MJFileEntity>('MJ: Files', server.User);
    expect(await file.Load(Stored.fileId)).toBe(true);
    const refusedDelete = await ConsoleCapture.During('error', () => file.Delete());
    expect(refusedDelete.Result).toBe(false);
    expect(file.LatestResult?.CompleteMessage).toContain('FK_MLModel_ArtifactFile');
    expect(refusedDelete.Lines.join('\n')).toContain('FK_MLModel_ArtifactFile');
    // …so the row is gone only under a reader that read the model before: the stored row stops naming the file first.
    const stored = await server.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', server.User);
    expect(await stored.Load(Model.ID)).toBe(true);
    stored.ArtifactFileID = null;
    expect(await stored.Save()).toBe(true);
    const doomed = await server.Provider.GetEntityObject<MJFileEntity>('MJ: Files', server.User);
    expect(await doomed.Load(Stored.fileId)).toBe(true);
    expect(await doomed.Delete()).toBe(true);
    unrecordedObjects.push(Stored);
    expect(existsSync(objectPathOf(Stored))).toBe(true);
    expect(await loadArtifact('row-deleted', Model)).toEqual({ Status: 'missing', FileID: Stored.fileId });
  });

  it('key written twice in parallel: exactly one of two concurrent saves to one key wins, the other is refused ArtifactAlreadyStoredError, and the winner\'s bytes stay stored', async () => {
    const forcedUuid = '6D2C1B0A-9F8E-4D7C-8B6A-5F4E3D2C1B0A';
    const name = 'parallel.json';
    const forcedKey = `${StorageProviderArtifactStore.KEY_PREFIX}/${forcedUuid}/${name}`;
    storedKeys.push(forcedKey);
    const first = artifactBytes('parallel-first');
    const second = artifactBytes('parallel-second');
    const late = artifactBytes('parallel-late');
    // Two registries, as two concurrent trainings each build their own for their request.
    const a = ArtifactRegistry.ForContext(ownerCtx, new StorageProviderArtifactLoader());
    const b = ArtifactRegistry.ForContext(ownerCtx, new StorageProviderArtifactLoader());
    let outcomes: PromiseSettledResult<StoredFile>[];
    let lateOutcome: PromiseSettledResult<StoredFile>;
    try {
      forceNextKeys(forcedUuid, 2);
      outcomes = await Promise.allSettled([storeArtifact(first, name, a), storeArtifact(second, name, b)]);
      forceNextKeys(forcedUuid, 1);
      [lateOutcome] = await Promise.allSettled([storeArtifact(late, name, a)]);
    } finally {
      keyUuid.Remaining = 0;
    }
    const won = outcomes.flatMap((o) => (o.status === 'fulfilled' ? [o.value] : []));
    // Narrowed to the typed refusal, so a rejection of any other kind leaves `refused` short and fails the length check.
    const refused = outcomes.flatMap((o) => (o.status === 'rejected' && o.reason instanceof ArtifactAlreadyStoredError ? [o.reason] : []));
    expect(won.map((s) => s.providerKey)).toEqual([forcedKey]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ ProviderKey: forcedKey });
    const winner = won[0];
    expect([sha256Hex(first), sha256Hex(second)]).toContain(winner.sha256);
    expect(sha256Hex(readFileSync(objectPathOf(winner)))).toBe(winner.sha256);
    expect((await fileRowsWithKey(forcedKey)).length).toBe(1);
    // A later save to the key that now holds the winner is refused before anything is written.
    expect(lateOutcome.status).toBe('rejected');
    expect(lateOutcome.status === 'rejected' && lateOutcome.reason instanceof ArtifactAlreadyStoredError).toBe(true);
    expect(sha256Hex(readFileSync(objectPathOf(winner)))).toBe(winner.sha256);
    expect((await fileRowsWithKey(forcedKey)).length).toBe(1);
    const model = await readModel(await createModel(winner.fileId, winner.sha256));
    expect((await loadArtifact('parallel', model)).Status).toBe('verified');
  });

  it('a reader without read on MJ: Files is refused loudly, naming the permission; never bytes, never an ArtifactLoad; the model\'s ArtifactStatus is unchanged', async () => {
    const { Model } = await storedModel('unauthorized');
    expect(await storedArtifactStatus(Model.ID)).toEqual(['verified']);
    const restricted = await seededNoGrantUser();
    const files = server.Provider.EntityByName('MJ: Files');
    if (!files) throw new Error('MJ: Files is not in metadata');
    expect(files.GetUserPermisions(restricted).CanRead).toBe(false);
    const restrictedCtx: RegistryContext = { ContextUser: restricted, Provider: server.Provider };
    const loadsBefore = loads.length;
    const read = await ConsoleCapture.During('error', () => loadOrError('unauthorized', Model, restrictedCtx));
    // refused loudly, naming the permission
    expect(read.Result).toBeInstanceOf(Error);
    expect(read.Result).toMatchObject({ message: expect.stringContaining(`User ${SEEDED_NOGRANT_EMAIL} does not have read permissions on MJ: Files`) });
    expect(read.Lines.join('\n')).toContain('does not have read permissions on MJ: Files');
    // never an ArtifactLoad, so never bytes
    expect(read.Result).not.toHaveProperty('Status');
    expect(read.Result).not.toHaveProperty('Bytes');
    expect(loads.length).toBe(loadsBefore);
    // the healthy model's recorded state is untouched
    expect(await storedArtifactStatus(Model.ID)).toEqual(['verified']);
  });

  it('every load: no load in this file returned bytes that do not hash to the SHA-256 its model registered', () => {
    expect(loads.length).toBeGreaterThan(0);
    const leaked = loads.filter((l) => l.Load.Status === 'verified' && sha256Hex(l.Load.Bytes) !== l.Registered);
    expect(leaked.map((l) => l.Case)).toEqual([]);
  });
});
