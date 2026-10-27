/**
 * Shared deterministic fakes for Video Studio integration tests (IT155, IT151):
 * - `UseFakeRenderDriver(options?)` — swaps `FakeRenderDriver` into `VideoRenderEngine.Instance.UseDriver`
 *   and restores the previous driver on teardown.
 * - `RegisterFakeVideoGenerator(script?)` — registers `ScriptedITVideoGenerator` over `BaseVideoGenerator`
 *   driver classes above existing priorities, counting `GenerateVideo` submits so checks can assert zero
 *   or exact spend.
 * - `RegisterFakeTextToSpeech()` — registers a deterministic in-memory `BaseTextToSpeech` driver over
 *   TTS driver classes so `Pre-Production` narration synthesis and timeline fitting run with zero network
 *   calls under `CredentialScope: 'RuntimeOnly'`.
 * - `UseMemoryStorage(ctx)` — creates an active test `MJ: File Storage Providers` row with a unique
 *   `MJITMemoryStorage-<marker>` driver key, registers an in-memory `FileStorageBase` under that key
 *   only, creates a storage account fixture on that provider via `storage.checks.ts`, and asserts
 *   `AIEngine.Instance.ResolveAgentStorageAccountID` for `Video Studio` resolves to the fixture account.
 */
import {
    AIAPIKeys,
    AudioModel,
    AvatarInfo,
    AvatarVideoParams,
    BaseImageGenerator,
    BaseTextToSpeech,
    BaseVideoGenerator,
    ImageEditParams,
    ImageGenerationParams,
    ImageGenerationResult,
    ImageModelInfo,
    ImageVariationParams,
    ModelUsage,
    PronounciationDictionary,
    SpeechResult,
    TextToSpeechParams,
    VideoGenerationJob,
    VideoGenerationParams,
    VideoResult,
    VideoTranslationParams,
    VoiceInfo,
} from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AIVideoRunner } from '@memberjunction/ai-prompts';
import { BaseEntity } from '@memberjunction/core';
import { MJFileStorageProviderEntity } from '@memberjunction/core-entities';
import { CredentialEngine } from '@memberjunction/credentials';
import { FilterByUUIDs, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    CreatePreAuthUploadUrlPayload,
    FileSearchOptions,
    FileSearchResultSet,
    FileStorageBase,
    FileStorageEngine,
    GetObjectMetadataParams,
    GetObjectParams,
    StorageListResult,
    StorageObjectMetadata,
} from '@memberjunction/storage';
import { Assert } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import {
    FakeRenderDriver,
    type FakeRenderDriverOptions,
    VideoRenderEngine,
} from '@memberjunction/video-studio';
import { AccountFixture, CreateAccountFixture } from './storage.checks';

export const CLIP_DURATION_SECONDS = 6;
export const ONE_KB_CLIP = Buffer.alloc(1024, 0x42);
export const SCRIPTED_API_KEY = 'it-video-studio-scripted-no-network';

// ─── 1. Fake Render Driver ───────────────────────────────────────────────────────────────────────

interface FakeRenderDriverHandle {
    Driver: FakeRenderDriver;
    restore: () => void;
}

/**
 * Swaps `new FakeRenderDriver(options)` into `VideoRenderEngine.Instance.UseDriver(...)` and returns
 * `{ Driver, restore }` where `restore()` puts the previous driver back.
 */
export function UseFakeRenderDriver(options?: FakeRenderDriverOptions): FakeRenderDriverHandle {
    const driver = new FakeRenderDriver(options);
    const previous = VideoRenderEngine.Instance.UseDriver(driver);
    return {
        Driver: driver,
        restore: (): void => {
            VideoRenderEngine.Instance.UseDriver(previous);
        },
    };
}

// ─── 2. Fake Video Generator (shared with IT155) ─────────────────────────────────────────────────

export interface ScriptedVideoOutcome {
    JobID: string;
    Usage?: ModelUsage;
    DurationSeconds?: number;
}

export class ScriptedITVideoGenerator extends BaseVideoGenerator {
    private outcomes: ScriptedVideoOutcome[] = [];
    private defaultOutcome: ScriptedVideoOutcome | undefined;
    private activeOutcome: ScriptedVideoOutcome | undefined;
    private lastRequestedDurationSeconds: number | undefined;
    private armed = true;

    /** Number of `GenerateVideo` submissions recorded since creation or last `ResetSubmits()`. */
    public SubmitCount = 0;

    constructor(apiKey = '') {
        super(apiKey);
    }

    public ResetSubmits(): void {
        this.SubmitCount = 0;
    }

    public Arm(outcome: ScriptedVideoOutcome | ScriptedVideoOutcome[]): void {
        this.armed = true;
        if (Array.isArray(outcome)) {
            this.outcomes = [...outcome];
            this.defaultOutcome = outcome[outcome.length - 1];
        } else {
            this.outcomes = [];
            this.defaultOutcome = outcome;
        }
        this.activeOutcome = undefined;
    }

    public Disarm(): void {
        this.armed = false;
        this.outcomes = [];
        this.defaultOutcome = undefined;
        this.activeOutcome = undefined;
    }

    public override async GenerateVideo(params: VideoGenerationParams): Promise<VideoGenerationJob> {
        this.SubmitCount += 1;
        const next = this.outcomes.length > 0 ? this.outcomes.shift() : this.defaultOutcome;
        if (!this.armed || !next) {
            throw new Error('The scripted video driver is not armed');
        }
        this.activeOutcome = next;
        this.lastRequestedDurationSeconds = params.DurationSeconds;
        return {
            JobID: next.JobID,
            Status: 'Pending',
        };
    }

    public override async GetVideoGenerationStatus(
        jobId: string,
        _signal?: AbortSignal,
    ): Promise<VideoGenerationJob> {
        const current = this.activeOutcome ?? this.defaultOutcome;
        if (!this.armed || !current) {
            throw new Error('The scripted video driver is not armed');
        }
        const durationSeconds =
            current.DurationSeconds ?? this.lastRequestedDurationSeconds ?? CLIP_DURATION_SECONDS;
        const usage =
            current.Usage !== undefined
                ? current.Usage
                : ModelUsage.ForMedia('Seconds', 0, durationSeconds);
        return {
            JobID: jobId,
            Status: 'Succeeded',
            Video: {
                Data: Buffer.from(ONE_KB_CLIP),
                MimeType: 'video/mp4',
                DurationSeconds: durationSeconds,
                Width: 1280,
                Height: 720,
            },
            Provenance: { C2PA: true },
            Usage: usage,
        };
    }

    public async CreateAvatarVideo(_params: AvatarVideoParams): Promise<VideoResult> {
        throw new Error('CreateAvatarVideo is not used in scripted video integration tests');
    }

    public async CreateVideoTranslation(_params: VideoTranslationParams): Promise<VideoResult> {
        throw new Error('CreateVideoTranslation is not used in scripted video integration tests');
    }

    public async GetAvatars(): Promise<AvatarInfo[]> {
        return [];
    }

    public async GetSupportedMethods(): Promise<string[]> {
        return ['GenerateVideo', 'GetVideoGenerationStatus'];
    }
}

function highestVideoPriority(driverClass: string): number {
    return Math.max(
        0,
        ...MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseVideoGenerator, driverClass).map(
            (r) => r.Priority,
        ),
    );
}

export function RegisterScriptedVideoDriver(
    driver: ScriptedITVideoGenerator,
    driverClass: string,
    priority = 100,
): () => void {
    const factory = MJGlobal.Instance.ClassFactory;
    const previous = factory.GetRegistration(BaseVideoGenerator, driverClass);

    class ScriptedVideoRegistrationHandle extends ScriptedITVideoGenerator {
        constructor(apiKey?: string) {
            super(apiKey);
            return driver;
        }
    }

    factory.Register(
        BaseVideoGenerator,
        ScriptedVideoRegistrationHandle,
        driverClass,
        Math.max(priority, highestVideoPriority(driverClass) + 1),
    );

    return () => {
        if (previous) {
            factory.Register(
                BaseVideoGenerator,
                previous.SubClass,
                driverClass,
                highestVideoPriority(driverClass) + 1,
            );
        }
    };
}

export const VIDEO_GENERATOR_DRIVER_CLASSES: readonly string[] = [
    'BlackForestLabsVideoGenerator',
    'GoogleVeoVideoGenerator',
    'OpenAISoraVideoGenerator',
    'RunwayVideoGenerator',
    'LumaVideoGenerator',
    'HeyGenVideoGenerator',
];

interface FakeVideoGeneratorHandle {
    Driver: ScriptedITVideoGenerator;
    DriverClasses: string[];
    restore: () => void;
}

/**
 * Registers a shared `ScriptedITVideoGenerator` over the given (or all active/canonical) video
 * generator driver classes and returns `{ Driver, DriverClasses, restore }`.
 */
export function RegisterFakeVideoGenerator(
    script?: ScriptedVideoOutcome | ScriptedVideoOutcome[],
    driverClass?: string,
): FakeVideoGeneratorHandle {
    const driver = new ScriptedITVideoGenerator();
    if (script !== undefined) {
        driver.Arm(script);
    }

    const classes = new Set<string>(
        driverClass ? [driverClass] : [...VIDEO_GENERATOR_DRIVER_CLASSES],
    );
    if (!driverClass && AIEngine.Instance.Loaded) {
        const prompt = AIEngine.Instance.Prompts.find(
            (p) => p.Name?.trim() === AIVideoRunner.GENERATIVE_PROMPT_NAME,
        );
        if (prompt) {
            const bindings = AIEngine.Instance.PromptModels.filter((pm) =>
                UUIDsEqual(pm.PromptID, prompt.ID),
            );
            const vendors = FilterByUUIDs(
                AIEngine.Instance.ModelVendors,
                bindings.map((b) => b.ModelID),
                (mv) => mv.ModelID,
            );
            for (const v of vendors) {
                if (v.DriverClass) {
                    classes.add(v.DriverClass);
                }
            }
        }
        for (const m of AIEngine.Instance.Models) {
            if (m.AIModelType?.trim().toLowerCase() === 'video') {
                for (const mv of m.ModelVendors ?? []) {
                    if (mv.DriverClass) {
                        classes.add(mv.DriverClass);
                    }
                }
            }
        }
    }

    const driverClasses = [...classes];
    const restores = driverClasses.map((dc) => RegisterScriptedVideoDriver(driver, dc));

    return {
        Driver: driver,
        DriverClasses: driverClasses,
        restore: (): void => {
            driver.Disarm();
            for (const r of restores) {
                r();
            }
        },
    };
}

// ─── 3. Fake Text-to-Speech Driver (for Pre-Production Narration) ────────────────────────────────

export const TTS_DRIVER_CLASSES: readonly string[] = [
    'ElevenLabsAudioGenerator',
    'OpenAIAudioGenerator',
];

export class ScriptedITTextToSpeech extends BaseTextToSpeech {
    public CallCount = 0;

    constructor(apiKey = '') {
        super(apiKey);
    }

    public override async CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult> {
        this.CallCount += 1;
        const text = params.text || 'Narration line.';
        const chars = Array.from(text);
        const totalDurationSeconds = 2.0;
        const step = chars.length > 0 ? totalDurationSeconds / chars.length : 0.1;
        const startSeconds = chars.map((_, idx) => Number((idx * step).toFixed(4)));
        const endSeconds = chars.map((_, idx) => Number(((idx + 1) * step).toFixed(4)));

        const mp3Bytes = Buffer.alloc(1024, 0x55);
        const result = new SpeechResult();
        result.success = true;
        result.data = mp3Bytes;
        result.content = mp3Bytes.toString('base64');
        result.Alignment = {
            Characters: chars,
            StartSeconds: startSeconds,
            EndSeconds: endSeconds,
        };
        result.usage = ModelUsage.ForMedia('Seconds', 0, totalDurationSeconds);
        return result;
    }

    public override async GetVoices(): Promise<VoiceInfo[]> {
        return [];
    }

    public override async GetModels(): Promise<AudioModel[]> {
        return [];
    }

    public override async GetPronounciationDictionaries(): Promise<PronounciationDictionary[]> {
        return [];
    }

    public override async GetSupportedMethods(): Promise<string[]> {
        return ['CreateSpeech'];
    }
}

function highestTtsPriority(driverClass: string): number {
    return Math.max(
        0,
        ...MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseTextToSpeech, driverClass).map(
            (r) => r.Priority,
        ),
    );
}

interface FakeTextToSpeechHandle {
    Driver: ScriptedITTextToSpeech;
    DriverClasses: string[];
    restore: () => void;
}

export function RegisterFakeTextToSpeech(): FakeTextToSpeechHandle {
    const driver = new ScriptedITTextToSpeech();
    const classes = new Set<string>([...TTS_DRIVER_CLASSES]);
    if (AIEngine.Instance.Loaded) {
        for (const m of AIEngine.Instance.Models) {
            if (m.AIModelType?.trim().toLowerCase() === 'tts') {
                for (const mv of m.ModelVendors ?? []) {
                    if (mv.DriverClass) {
                        classes.add(mv.DriverClass);
                    }
                }
            }
        }
    }

    const factory = MJGlobal.Instance.ClassFactory;
    const driverClasses = [...classes];
    const restores: Array<() => void> = [];

    for (const driverClass of driverClasses) {
        const previous = factory.GetRegistration(BaseTextToSpeech, driverClass);

        class ScriptedTtsRegistrationHandle extends ScriptedITTextToSpeech {
            constructor(apiKey?: string) {
                super(apiKey);
                return driver;
            }
        }

        factory.Register(
            BaseTextToSpeech,
            ScriptedTtsRegistrationHandle,
            driverClass,
            Math.max(100, highestTtsPriority(driverClass) + 1),
        );

        restores.push(() => {
            if (previous) {
                factory.Register(
                    BaseTextToSpeech,
                    previous.SubClass,
                    driverClass,
                    highestTtsPriority(driverClass) + 1,
                );
            }
        });
    }

    return {
        Driver: driver,
        DriverClasses: driverClasses,
        restore: (): void => {
            for (const r of restores) {
                r();
            }
        },
    };
}

// ─── 3b. Fake Image Generator (for refusing image generation when VS_LIVE_GENERATION !== '1') ────

export const IMAGE_GENERATOR_DRIVER_CLASSES: readonly string[] = [
    'FLUXImageGenerator',
    'GeminiImageGenerator',
    'OpenAIImageGenerator',
];

export class ScriptedITImageGenerator extends BaseImageGenerator {
    public SubmitCount = 0;

    constructor(apiKey = '') {
        super(apiKey);
    }

    public ResetSubmits(): void {
        this.SubmitCount = 0;
    }

    public override async GenerateImage(_params: ImageGenerationParams): Promise<ImageGenerationResult> {
        this.SubmitCount += 1;
        throw new Error('The scripted image driver is not armed');
    }

    public override async EditImage(_params: ImageEditParams): Promise<ImageGenerationResult> {
        this.SubmitCount += 1;
        throw new Error('The scripted image driver is not armed');
    }

    public override async CreateVariation(_params: ImageVariationParams): Promise<ImageGenerationResult> {
        this.SubmitCount += 1;
        throw new Error('The scripted image driver is not armed');
    }

    public override async GetModels(): Promise<ImageModelInfo[]> {
        return [];
    }

    public override async GetSupportedMethods(): Promise<string[]> {
        return ['GenerateImage'];
    }
}

function highestImagePriority(driverClass: string): number {
    return Math.max(
        0,
        ...MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseImageGenerator, driverClass).map(
            (r) => r.Priority,
        ),
    );
}

interface FakeImageGeneratorHandle {
    Driver: ScriptedITImageGenerator;
    DriverClasses: string[];
    restore: () => void;
}

export function RegisterFakeImageGenerator(): FakeImageGeneratorHandle {
    const driver = new ScriptedITImageGenerator();
    const classes = new Set<string>([...IMAGE_GENERATOR_DRIVER_CLASSES]);
    if (AIEngine.Instance.Loaded) {
        for (const m of AIEngine.Instance.Models) {
            const modelType = m.AIModelType?.trim().toLowerCase();
            if (modelType === 'image' || modelType === 'images') {
                for (const mv of m.ModelVendors ?? []) {
                    if (mv.DriverClass) {
                        classes.add(mv.DriverClass);
                    }
                }
            }
        }
    }

    const factory = MJGlobal.Instance.ClassFactory;
    const driverClasses = [...classes];
    const restores: Array<() => void> = [];

    for (const driverClass of driverClasses) {
        const previous = factory.GetRegistration(BaseImageGenerator, driverClass);

        class ScriptedImageRegistrationHandle extends ScriptedITImageGenerator {
            constructor(apiKey?: string) {
                super(apiKey);
                return driver;
            }
        }

        factory.Register(
            BaseImageGenerator,
            ScriptedImageRegistrationHandle,
            driverClass,
            Math.max(100, highestImagePriority(driverClass) + 1),
        );

        restores.push(() => {
            if (previous) {
                factory.Register(
                    BaseImageGenerator,
                    previous.SubClass,
                    driverClass,
                    highestImagePriority(driverClass) + 1,
                );
            }
        });
    }

    return {
        Driver: driver,
        DriverClasses: driverClasses,
        restore: (): void => {
            for (const r of restores) {
                r();
            }
        },
    };
}

// ─── 3c. Scoped Fake Global API Keys (for ActionEngine paths that do not take apiKeys) ───────────

function highestApiKeysPriority(): number {
    return Math.max(
        0,
        ...MJGlobal.Instance.ClassFactory.GetAllRegistrations(AIAPIKeys).map((r) => r.Priority),
    );
}

/**
 * Registers an `AIAPIKeys` subclass above existing priorities that returns a placeholder key for
 * `allowedDriverClasses` (all of which have fake drivers registered) and `undefined` for every
 * other driver class so `GetAIAPIKeyGlobal` never falls back to `.env` vendor keys.
 */
export function RegisterFakeAPIKeys(allowedDriverClasses: readonly string[]): () => void {
    const allowed = new Set(allowedDriverClasses.map((d) => d.trim().toUpperCase()));
    const factory = MJGlobal.Instance.ClassFactory;
    const previous = factory.GetRegistration(AIAPIKeys);

    class ScriptedITAPIKeys extends AIAPIKeys {
        public override GetAPIKey(AIDriverName: string): string {
            if (!AIDriverName) {
                return undefined as unknown as string;
            }
            const normalized = AIDriverName.trim().toUpperCase();
            if (allowed.has(normalized)) {
                return 'it-video-studio-scripted-no-network';
            }
            return undefined as unknown as string;
        }
    }

    factory.Register(
        AIAPIKeys,
        ScriptedITAPIKeys,
        undefined,
        Math.max(100, highestApiKeysPriority() + 1),
    );

    return (): void => {
        factory.Register(
            AIAPIKeys,
            previous?.SubClass ?? AIAPIKeys,
            undefined,
            highestApiKeysPriority() + 1,
        );
    };
}

// ─── 4. In-Memory Storage Account & Driver ───────────────────────────────────────────────────────

interface StoredMemoryObject {
    bytes: Buffer;
    contentType: string;
    lastModified: Date;
    customMetadata?: Record<string, string>;
}

export class MemoryFileStorageDriver extends FileStorageBase {
    protected readonly providerName = 'Memory File Storage';
    private readonly objects = new Map<string, StoredMemoryObject>();

    public get IsConfigured(): boolean {
        return true;
    }

    public get ObjectCount(): number {
        return this.objects.size;
    }

    public get Keys(): string[] {
        return [...this.objects.keys()];
    }

    public Clear(): void {
        this.objects.clear();
    }

    public HasKey(objectKey: string): boolean {
        return this.objects.has(this.NormalizeObjectKey(objectKey));
    }

    public GetBytes(objectKey: string): Buffer | undefined {
        return this.objects.get(this.NormalizeObjectKey(objectKey))?.bytes;
    }

    public async PutObject(
        objectName: string,
        data: Buffer,
        contentType?: string,
        metadata?: Record<string, string>,
    ): Promise<boolean> {
        const key = this.NormalizeObjectKey(objectName);
        this.objects.set(key, {
            bytes: Buffer.from(data),
            contentType: contentType ?? 'application/octet-stream',
            lastModified: new Date(),
            customMetadata: metadata,
        });
        return true;
    }

    public async GetObject(params: GetObjectParams): Promise<Buffer> {
        const rawKey = params.objectId ?? params.fullPath ?? '';
        const key = this.NormalizeObjectKey(rawKey);
        const entry = this.objects.get(key);
        if (!entry) {
            throw new Error(`MemoryFileStorageDriver.GetObject: object '${key}' not found`);
        }
        return Buffer.from(entry.bytes);
    }

    public async GetObjectMetadata(params: GetObjectMetadataParams): Promise<StorageObjectMetadata> {
        const rawKey = params.objectId ?? params.fullPath ?? '';
        const key = this.NormalizeObjectKey(rawKey);
        const entry = this.objects.get(key);
        if (!entry) {
            throw new Error(`MemoryFileStorageDriver.GetObjectMetadata: object '${key}' not found`);
        }
        const slashIdx = key.lastIndexOf('/');
        const name = slashIdx >= 0 ? key.slice(slashIdx + 1) : key;
        const path = slashIdx >= 0 ? key.slice(0, slashIdx) : '';
        return {
            name,
            path,
            fullPath: key,
            size: entry.bytes.byteLength,
            contentType: entry.contentType,
            lastModified: entry.lastModified,
            isDirectory: false,
            customMetadata: entry.customMetadata,
        };
    }

    public async ObjectExists(objectName: string): Promise<boolean> {
        return this.objects.has(this.NormalizeObjectKey(objectName));
    }

    public async DeleteObject(objectName: string): Promise<boolean> {
        return this.objects.delete(this.NormalizeObjectKey(objectName));
    }

    public async ListObjects(prefix: string, _delimiter?: string): Promise<StorageListResult> {
        const normPrefix = this.NormalizeObjectKey(prefix);
        const objects: StorageObjectMetadata[] = [];
        for (const [key, entry] of this.objects.entries()) {
            if (!normPrefix || key.startsWith(normPrefix)) {
                const slashIdx = key.lastIndexOf('/');
                const name = slashIdx >= 0 ? key.slice(slashIdx + 1) : key;
                const path = slashIdx >= 0 ? key.slice(0, slashIdx) : '';
                objects.push({
                    name,
                    path,
                    fullPath: key,
                    size: entry.bytes.byteLength,
                    contentType: entry.contentType,
                    lastModified: entry.lastModified,
                    isDirectory: false,
                    customMetadata: entry.customMetadata,
                });
            }
        }
        return { objects, prefixes: [] };
    }

    public async MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean> {
        const oldKey = this.NormalizeObjectKey(oldObjectName);
        const entry = this.objects.get(oldKey);
        if (!entry) {
            return false;
        }
        this.objects.set(this.NormalizeObjectKey(newObjectName), entry);
        this.objects.delete(oldKey);
        return true;
    }

    public async CopyObject(
        sourceObjectName: string,
        destinationObjectName: string,
    ): Promise<boolean> {
        const srcKey = this.NormalizeObjectKey(sourceObjectName);
        const entry = this.objects.get(srcKey);
        if (!entry) {
            return false;
        }
        this.objects.set(this.NormalizeObjectKey(destinationObjectName), {
            bytes: Buffer.from(entry.bytes),
            contentType: entry.contentType,
            lastModified: new Date(),
            customMetadata: entry.customMetadata ? { ...entry.customMetadata } : undefined,
        });
        return true;
    }

    public async CreateDirectory(_directoryPath: string): Promise<boolean> {
        return true;
    }

    public async DeleteDirectory(directoryPath: string, _recursive?: boolean): Promise<boolean> {
        const normPrefix = this.NormalizeObjectKey(directoryPath);
        for (const key of [...this.objects.keys()]) {
            if (key.startsWith(normPrefix)) {
                this.objects.delete(key);
            }
        }
        return true;
    }

    public async DirectoryExists(_directoryPath: string): Promise<boolean> {
        return true;
    }

    public async CreatePreAuthUploadUrl(
        objectName: string,
    ): Promise<CreatePreAuthUploadUrlPayload> {
        const key = this.NormalizeObjectKey(objectName);
        return {
            UploadUrl: `memory://upload/${key}`,
            ProviderKey: key,
        };
    }

    public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
        const key = this.NormalizeObjectKey(objectName);
        return `memory://download/${key}`;
    }

    public async SearchFiles(
        _query: string,
        _options?: FileSearchOptions,
    ): Promise<FileSearchResultSet> {
        return { results: [], hasMore: false };
    }
}

function highestStoragePriority(driverKey: string): number {
    return Math.max(
        0,
        ...MJGlobal.Instance.ClassFactory.GetAllRegistrations(FileStorageBase, driverKey).map(
            (r) => r.Priority,
        ),
    );
}

async function deleteEntityQuietly(row: BaseEntity | null | undefined): Promise<void> {
    if (!row) {
        return;
    }
    await row.Delete().catch(() => undefined);
}

let memoryStorageCounter = 0;

interface MemoryStorageHandle {
    AccountID: string;
    Driver: MemoryFileStorageDriver;
    Fixture: AccountFixture;
    Provider: MJFileStorageProviderEntity;
    DriverKey: string;
    restore: () => Promise<void>;
}

/**
 * Creates a temporary active `MJ: File Storage Providers` row with a unique test-only
 * `ServerDriverKey` / `ClientDriverKey` (`MJITMemoryStorage-<marker>`), registers an in-memory
 * `FileStorageBase` under that key only, creates a temporary storage account fixture on that
 * provider via `CreateAccountFixture`, refreshes the storage and credential caches, and asserts
 * `AIEngine.Instance.ResolveAgentStorageAccountID` and `AIEngine.Instance.ResolveAgentStorageAccount`
 * for `Video Studio` resolve unambiguously (`Ambiguous: false`) to the fixture account.
 *
 * Returns the reason instead of a handle, after cleaning up, when `CreateAccountFixture` cannot get a
 * credential for the account (for example, CI has no credential to reuse and no encryption key to save
 * one). Every other setup failure throws, including an account that fails to save.
 */
export async function UseMemoryStorage(
    ctx: IntegrationCheckContext,
): Promise<MemoryStorageHandle | string> {
    const storageEngine = FileStorageEngine.Instance;
    await storageEngine.Config(false, ctx.User, ctx.Provider);

    const marker = `${Date.now().toString(36)}${(++memoryStorageCounter).toString(36)}`;
    const driverKey = `MJITMemoryStorage-${marker}`;
    const fixtureTag = '(mj-integration-test — safe to delete)';

    const provider = await ctx.Provider.GetEntityObject<MJFileStorageProviderEntity>(
        'MJ: File Storage Providers',
        ctx.User,
    );
    provider.NewRecord();
    provider.Name = `${marker} ${fixtureTag}`;
    provider.Description = `Integration-test memory storage provider ${marker} ${fixtureTag}`;
    provider.ServerDriverKey = driverKey;
    provider.ClientDriverKey = driverKey;
    provider.Priority = 0;
    provider.IsActive = true;
    provider.SupportsSearch = false;
    provider.RequiresOAuth = false;
    if (!(await provider.Save())) {
        throw new Error(
            `UseMemoryStorage: failed to save test storage provider: ${provider.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
    }

    const memoryDriver = new MemoryFileStorageDriver();
    const factory = MJGlobal.Instance.ClassFactory;

    class MemoryStorageRegistrationHandle extends MemoryFileStorageDriver {
        constructor() {
            super();
            return memoryDriver;
        }
    }

    factory.Register(
        FileStorageBase,
        MemoryStorageRegistrationHandle,
        driverKey,
        Math.max(100, highestStoragePriority(driverKey) + 1),
    );

    let fixture: AccountFixture | null = null;
    const restore = async (): Promise<void> => {
        memoryDriver.Clear();
        if (fixture) {
            for (const perm of fixture.Permissions) {
                await deleteEntityQuietly(perm);
            }
            await deleteEntityQuietly(fixture.Account);
            await deleteEntityQuietly(fixture.CreatedCredential);
        }
        await deleteEntityQuietly(provider);
        await storageEngine.Config(true, ctx.User, ctx.Provider).catch(() => undefined);
    };

    try {
        const fixtureOrReason = await CreateAccountFixture(ctx, storageEngine, provider);
        if (typeof fixtureOrReason === 'string') {
            // Only a missing credential is environmental; an account that fails to save on our own
            // provider is a real failure.
            if (fixtureOrReason.startsWith('fixture account save failed')) {
                throw new Error(`UseMemoryStorage: failed to create storage account fixture: ${fixtureOrReason}`);
            }
            await restore();
            return fixtureOrReason;
        }
        fixture = fixtureOrReason;

        if (fixture.CreatedCredential) {
            await CredentialEngine.Instance.Config(true, ctx.User, ctx.Provider);
        }
        await storageEngine.Config(true, ctx.User, ctx.Provider);

        // Ensure the driver instance is initialized and cached for the fixture account
        await memoryDriver.initialize({
            accountId: fixture.Account.ID,
            accountName: fixture.Account.Name,
        });
        const driverCache = (
            storageEngine as unknown as { _driverCache?: Map<string, FileStorageBase> }
        )._driverCache;
        driverCache?.set(fixture.Account.ID, memoryDriver);

        await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
        const videoStudioAgent = AIEngine.Instance.Agents.find((a) => a.Name === 'Video Studio');
        Assert(
            videoStudioAgent != null,
            "UseMemoryStorage: 'Video Studio' agent is not loaded in AIEngine.Instance.Agents",
        );

        const resolvedAccountId = AIEngine.Instance.ResolveAgentStorageAccountID(videoStudioAgent!);
        if (!UUIDsEqual(resolvedAccountId, fixture.Account.ID)) {
            const allAccounts = storageEngine.Accounts.map((a) => `${a.Name} (${a.ID})`).join(', ');
            throw new Error(
                `UseMemoryStorage: Video Studio resolved storage account '${resolvedAccountId ?? '(null)'}' ` +
                    `instead of fixture account '${fixture.Account.Name} (${fixture.Account.ID})'. ` +
                    `Accounts in FileStorageEngine: [${allAccounts || '(none)'}].`,
            );
        }

        const resolvedInfo = AIEngine.Instance.ResolveAgentStorageAccount(videoStudioAgent!);
        if (
            !UUIDsEqual(resolvedInfo.AccountID, fixture.Account.ID) ||
            resolvedInfo.Ambiguous !== false
        ) {
            const allAccounts = storageEngine.Accounts.map((a) => `${a.Name} (${a.ID})`).join(', ');
            throw new Error(
                `UseMemoryStorage: ResolveAgentStorageAccount('${videoStudioAgent!.ID}') returned ` +
                    `AccountID='${resolvedInfo.AccountID ?? '(null)'}', Source='${resolvedInfo.Source}', Ambiguous=${resolvedInfo.Ambiguous} ` +
                    `instead of unambiguous fixture account '${fixture.Account.Name} (${fixture.Account.ID})'. ` +
                    `Accounts in FileStorageEngine: [${allAccounts || '(none)'}].`,
            );
        }
    } catch (err) {
        await restore();
        throw err;
    }

    return {
        AccountID: fixture.Account.ID,
        Driver: memoryDriver,
        Fixture: fixture,
        Provider: provider,
        DriverKey: driverKey,
        restore,
    };
}
