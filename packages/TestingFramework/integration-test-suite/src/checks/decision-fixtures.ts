/**
 * decision-fixtures.ts — throwaway decision-routing fixtures for the cloudflare-clef and systemone-kev
 * bundles: real `MJ: Credentials` rows created through `CredentialEngine`, `MJ: AI Credential Bindings`
 * rows, a test Decision prompt with its own model bindings, a probe runner, and the cleanup for all of
 * them.
 *
 * NOT a check bundle: it registers nothing on import.
 *
 * CREDENTIALS ARE REAL. `CredentialEngine.StoreCredential` validates the values against the credential
 * type's `FieldSchema` and saves the row, and the database provider encrypts `Values` on the way in with
 * the key its `EntityField` names (the `Base Encryption Key`, read from `MJ_BASE_ENCRYPTION_KEY`). A
 * runner resolves a bound credential through `CredentialEngine.GetCredential`, which reads the
 * decrypted row and hands the driver its values as JSON. A host or CI lane with no key set cannot save
 * an encrypted field, so {@link DecisionFixtures} supplies a throwaway 32-byte key for the length of the
 * fixture when, and only when, that key comes from an environment variable that is unset, and removes it
 * (and the engine's cached key material) once every credential it encrypted is deleted. A configured key
 * is used as it is.
 *
 * CLEANUP, children first: prompt runs, credential bindings, prompt models, prompts, the credentials'
 * `Credential Access` audit-log rows, then the credentials. Every delete is best-effort and logged, so a
 * failing check still cleans up. The platform's own Record Changes history for the tracked entities is
 * left, as every other bundle leaves it.
 */
import { randomBytes } from 'node:crypto';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { BaseDecision } from '@memberjunction/ai';
import type {
    MJAICredentialBindingEntity,
    MJAIPromptEntity,
    MJAIPromptModelEntity,
    MJAuditLogEntity,
    MJCredentialEntity,
} from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIDecisionRunner, type AIDecisionParams, type FailoverAttempt, type ModelVendorCandidate } from '@memberjunction/ai-prompts';
import { CredentialEngine } from '@memberjunction/credentials';
import { EncryptionEngine } from '@memberjunction/encryption';
import { Settle } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { AGENT_LIVE_FIXTURE_TAG, DeleteById, NewMarker, RequireRows } from './agent-live-shared';

// ─── Constants ───────────────────────────────────────────────────────────────────────────────────

/** The prompt whose template, type and category a test Decision prompt borrows (read only). */
const DEFAULT_DECISION_PROMPT = 'Default Decision';

/** The key source whose key {@link DecisionFixtures} may supply for its own length. */
const ENV_VAR_KEY_SOURCE = 'EnvVarKeySource';

/** How long to let fire-and-forget credential writes (the `LastUsedAt` touch) land before deleting. */
const CREDENTIAL_TOUCH_SETTLE_MS = 500;

// ─── Lookups ─────────────────────────────────────────────────────────────────────────────────────

/** An active model by name, or a thrown error naming the sync that would add it. */
export function RequireDecisionModel(name: string): MJAIModelEntityExtended {
    const model = AIEngine.Instance.Models.find(m => m.Name === name);
    if (!model) {
        throw new Error(`The '${name}' model is not in this database: sync the metadata (mj sync push --dir=metadata)`);
    }
    return model;
}

/** A vendor's ID by name, or a thrown error naming the sync that would add it. */
export function RequireVendorID(name: string): string {
    const vendor = AIEngine.Instance.Vendors.find(v => v.Name === name);
    if (!vendor) {
        throw new Error(`The '${name}' AI vendor is not in this database: sync the metadata (mj sync push --dir=metadata)`);
    }
    return vendor.ID;
}

/** The one Active Inference Provider row of `modelName` on `vendorName`: the row a ModelVendor binding targets. */
export function RequireInferenceRowID(modelName: string, vendorName: string): string {
    const model = RequireDecisionModel(modelName);
    const vendorId = RequireVendorID(vendorName);
    const rows = AIEngine.Instance.ModelVendors.filter(mv =>
        UUIDsEqual(mv.ModelID, model.ID) && UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active' && mv.Type === 'Inference Provider');
    if (rows.length !== 1) {
        throw new Error(`Expected one Active Inference Provider row for '${modelName}' on '${vendorName}', found ${rows.length}`);
    }
    return rows[0].ID;
}

/** The engine's `Default Decision` prompt, or a thrown error naming the sync that would add it. */
export function RequireDefaultDecisionPrompt(): MJAIPromptEntityExtended {
    const prompt = AIEngine.Instance.Prompts.find(p => p.Name === DEFAULT_DECISION_PROMPT);
    if (!prompt) {
        throw new Error(`The '${DEFAULT_DECISION_PROMPT}' prompt is not in this database: sync the metadata (mj sync push --dir=metadata)`);
    }
    return prompt;
}

// ─── Prompt runs ─────────────────────────────────────────────────────────────────────────────────

/** The `MJ: AI Prompt Runs` columns the decision checks read back. */
export interface DecisionPromptRunRow {
    ID: string;
    PromptID: string;
    ModelID: string;
    VendorID: string | null;
    Success: boolean | null;
    ErrorMessage: string | null;
    TokensPrompt: number | null;
    Cost: number | null;
}

/** One prompt run row, read past every cache. */
export async function ReadDecisionPromptRun(ctx: IntegrationCheckContext, id: string): Promise<DecisionPromptRunRow | undefined> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<DecisionPromptRunRow>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID='${EscapeSQLString(id)}'`,
        Fields: ['ID', 'PromptID', 'ModelID', 'VendorID', 'Success', 'ErrorMessage', 'TokensPrompt', 'Cost'],
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    return RequireRows(result, `prompt run ${id}`)[0];
}

// ─── The probe runner ────────────────────────────────────────────────────────────────────────────

/** One failover attempt the runner logged, and whether it said it would try again. */
export interface ObservedAttempt {
    Attempt: FailoverAttempt;
    WillRetry: boolean;
}

/** One rate-limit backoff the runner asked for. */
export interface ObservedRetryDelay {
    AttemptNumber: number;
    SuggestedDelaySeconds: number | undefined;
}

/**
 * The real `AIDecisionRunner`, with three of its protected seams opened for the checks:
 * - {@link Candidates} and {@link HasCredentials} expose the candidate builder and the credential
 *   probe that selection uses, as IT97's `MemoryGateProbe` exposes the Memory Manager's internals;
 * - every failover attempt the runner logs is recorded in {@link Attempts}, with its error, in this
 *   process, so a check reads what each attempt failed with without depending on the prompt run row;
 * - a rate-limit backoff is recorded in {@link RetryDelays} instead of slept. A 429 suggests 30
 *   seconds, which would make the check slow; whether and how often the runner retries is unchanged.
 */
export class DecisionRunnerProbe extends AIDecisionRunner {
    public readonly Attempts: ObservedAttempt[] = [];
    public readonly RetryDelays: ObservedRetryDelay[] = [];

    /** The candidates the runner builds for `prompt`, highest priority first. */
    public Candidates(prompt: MJAIPromptEntityExtended, params?: AIDecisionParams): ModelVendorCandidate[] {
        return this.BuildModelVendorCandidates(prompt, params?.override?.modelId, params?.configurationId, params?.override?.vendorId);
    }

    /** Whether selection would find a credential for `candidate`. */
    public HasCredentials(candidate: ModelVendorCandidate, prompt: MJAIPromptEntityExtended, params?: AIDecisionParams): boolean {
        return this.HasCredentialsAvailable(candidate.driverClass, prompt.ID, candidate.model.ID, candidate.vendorId, params);
    }

    protected override logFailoverAttempt(promptId: string, attempt: FailoverAttempt, willRetry: boolean): void {
        this.Attempts.push({ Attempt: attempt, WillRetry: willRetry });
        super.logFailoverAttempt(promptId, attempt, willRetry);
    }

    protected override async ApplyRetryDelay(_prompt: MJAIPromptEntityExtended, attemptNumber: number, suggestedDelaySeconds?: number): Promise<void> {
        this.RetryDelays.push({ AttemptNumber: attemptNumber, SuggestedDelaySeconds: suggestedDelaySeconds });
    }
}

// ─── Stand-ins ───────────────────────────────────────────────────────────────────────────────────

/** A decision driver class that a stand-in can replace: built from an API key. */
export type DecisionDriverClass = new (apiKey: string) => BaseDecision;

/** The highest priority registered on `BaseDecision` for `driverClass`, or 0 when it has none. */
function highestDecisionPriority(driverClass: string): number {
    return Math.max(0, ...MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseDecision, driverClass).map(r => r.Priority));
}

/**
 * Registers `standIn` over `driverClass` above whatever is registered there, and returns a restore that
 * puts the previous class (or `shipped`, when there was none) back on top. A stand-in is usually a
 * subclass of the shipped driver that overrides only `SendRequest`, so everything but the network stays
 * real. `shipped` may be left out only when something is registered already; with neither, there would
 * be nothing to restore, and the stand-in would outlive the check.
 */
export function RegisterDecisionStandIn(driverClass: string, standIn: DecisionDriverClass, shipped?: DecisionDriverClass): () => void {
    const factory = MJGlobal.Instance.ClassFactory;
    const previous = factory.GetRegistration(BaseDecision, driverClass);
    const restoreTo = previous ? previous.SubClass : shipped;
    if (!restoreTo) {
        throw new Error(`Nothing is registered for '${driverClass}' and no shipped class was given, so a stand-in could not be undone`);
    }
    factory.Register(BaseDecision, standIn, driverClass, highestDecisionPriority(driverClass) + 1);
    return () => {
        factory.Register(BaseDecision, restoreTo, driverClass, highestDecisionPriority(driverClass) + 1);
    };
}

// ─── Environment ─────────────────────────────────────────────────────────────────────────────────

/**
 * Unsets the named environment variables and returns a restore. The decision drivers read their base
 * URLs and the Cloudflare account ID from the environment when a credential carries none, so a host
 * with one set could otherwise send a misconfigured candidate to a real server.
 */
export function ClearEnvironment(names: readonly string[]): () => void {
    const saved = names.map(name => ({ Name: name, Value: process.env[name] }));
    for (const name of names) {
        delete process.env[name];
    }
    return () => {
        for (const { Name, Value } of saved) {
            if (Value === undefined) {
                delete process.env[Name];
            } else {
                process.env[Name] = Value;
            }
        }
    };
}

// ─── The fixture ─────────────────────────────────────────────────────────────────────────────────

/** One model binding of a test Decision prompt. */
export interface DecisionPromptBinding {
    /** A name the check uses to find the binding's `MJ: AI Prompt Models` row again. */
    Key: string;
    ModelName: string;
    VendorName: string;
    /** Higher runs first. */
    Priority: number;
}

/** What a test Decision prompt is made of. */
export interface DecisionPromptSpec {
    Bindings: DecisionPromptBinding[];
    /** `MaxRetries`: how many times a rate-limited candidate is retried before failing over. Defaults to 0. */
    MaxRetries?: number;
}

/** A test Decision prompt, as the engine holds it, and its model bindings by key. */
export interface CreatedDecisionPrompt {
    Prompt: MJAIPromptEntityExtended;
    PromptModelIDs: Record<string, string>;
}

/**
 * The rows one check creates, and their cleanup. Each check makes its own and calls {@link Cleanup} in a
 * `finally`; a bundle's Teardown calls {@link CleanupAll} as a backstop for any a check left behind.
 */
export class DecisionFixtures {
    private static readonly open = new Set<DecisionFixtures>();

    private readonly marker: string;
    private readonly promptRunIDs: string[] = [];
    private readonly bindingIDs: string[] = [];
    private readonly promptModelIDs: string[] = [];
    private readonly promptIDs: string[] = [];
    private readonly credentialIDs: string[] = [];
    private restoreEncryptionKey: (() => void) | undefined;

    constructor(private readonly ctx: IntegrationCheckContext, label: string) {
        this.marker = NewMarker(`it-${label}`);
        DecisionFixtures.open.add(this);
    }

    private get provider(): IMetadataProvider {
        return this.ctx.Provider;
    }

    private get user(): UserInfo {
        return this.ctx.User;
    }

    /** A row name unique to this fixture and marked safe to delete. */
    public NameFor(what: string): string {
        return `IT ${what} ${this.marker} ${AGENT_LIVE_FIXTURE_TAG}`;
    }

    /** Records a prompt run for deletion. */
    public TrackPromptRun(id: string | undefined): void {
        if (id) {
            this.promptRunIDs.push(id);
        }
    }

    /**
     * Creates a real, non-default credential through `CredentialEngine.StoreCredential`, which validates
     * the values against the type's schema and saves them encrypted.
     */
    public async CreateCredential(typeName: string, what: string, values: Record<string, string>): Promise<MJCredentialEntity> {
        await this.ensureEncryptionKey();
        await CredentialEngine.Instance.Config(false, this.user);
        const credential = await CredentialEngine.Instance.StoreCredential(
            typeName,
            this.NameFor(what),
            values,
            { isDefault: false, description: `Integration-test credential for ${what}; points at a loopback server or nowhere` },
            this.user,
        );
        this.credentialIDs.push(credential.ID);
        return credential;
    }

    /** Binds a credential to one model-vendor row: the binding a per-row route is configured with. */
    public async BindToModelVendor(credentialId: string, modelVendorId: string): Promise<string> {
        return this.saveBinding(credentialId, 'ModelVendor', binding => {
            binding.AIModelVendorID = modelVendorId;
        });
    }

    /** Binds a credential to one prompt-model row: the most specific binding the runner looks for. */
    public async BindToPromptModel(credentialId: string, promptModelId: string): Promise<string> {
        return this.saveBinding(credentialId, 'PromptModel', binding => {
            binding.AIPromptModelID = promptModelId;
        });
    }

    /**
     * Creates a Decision prompt bound only to `spec.Bindings` (`Specific`, `RequireSpecificModels`, so
     * no power-matched fallbacks join), with failover on, then reloads the AI engine so the runner sees
     * it. It borrows `Default Decision`'s template, type and category, read only.
     */
    public async CreateDecisionPrompt(what: string, spec: DecisionPromptSpec): Promise<CreatedDecisionPrompt> {
        const template = RequireDefaultDecisionPrompt();
        const prompt = await this.provider.GetEntityObject<MJAIPromptEntity>('MJ: AI Prompts', this.user);
        prompt.NewRecord();
        prompt.Name = this.NameFor(what);
        prompt.Description = `Integration-test Decision prompt for ${what}`;
        prompt.TemplateID = template.TemplateID;
        prompt.TypeID = template.TypeID;
        prompt.CategoryID = template.CategoryID;
        prompt.AIModelTypeID = template.AIModelTypeID;
        prompt.Status = 'Active';
        prompt.SelectionStrategy = 'Specific';
        prompt.RequireSpecificModels = true;
        prompt.FailoverStrategy = 'NextBestModel';
        prompt.FailoverErrorScope = 'All';
        prompt.MaxRetries = spec.MaxRetries ?? 0;
        prompt.RetryDelayMS = 0;
        prompt.RetryStrategy = 'Fixed';
        await this.save(prompt, `prompt '${what}'`);
        this.promptIDs.push(prompt.ID);

        const promptModelIDs: Record<string, string> = {};
        for (const binding of spec.Bindings) {
            const row = await this.provider.GetEntityObject<MJAIPromptModelEntity>('MJ: AI Prompt Models', this.user);
            row.NewRecord();
            row.PromptID = prompt.ID;
            row.ModelID = RequireDecisionModel(binding.ModelName).ID;
            row.VendorID = RequireVendorID(binding.VendorName);
            row.Priority = binding.Priority;
            row.Status = 'Active';
            await this.save(row, `prompt model '${binding.Key}'`);
            this.promptModelIDs.push(row.ID);
            promptModelIDs[binding.Key] = row.ID;
        }

        await this.RefreshEngine();
        const loaded = AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, prompt.ID));
        if (!loaded) {
            throw new Error(`The test prompt '${prompt.Name}' is not in the AI engine after a reload`);
        }
        return { Prompt: loaded, PromptModelIDs: promptModelIDs };
    }

    /** Reloads the AI engine, so candidate selection and credential resolution see this fixture's rows. */
    public async RefreshEngine(): Promise<void> {
        await AIEngine.Instance.Config(true, this.user);
    }

    /**
     * Deletes everything this fixture created, children first, then reloads the AI engine. Never throws.
     */
    public async Cleanup(): Promise<void> {
        DecisionFixtures.open.delete(this);
        try {
            await this.deleteAll('MJ: AI Prompt Runs', this.promptRunIDs);
            await this.deleteAll('MJ: AI Credential Bindings', this.bindingIDs);
            await this.deleteAll('MJ: AI Prompt Models', this.promptModelIDs);
            await this.deleteAll('MJ: AI Prompts', this.promptIDs);
            await this.deleteCredentials();
            await this.RefreshEngine();
        } catch (err: unknown) {
            console.error(`[decision-fixtures] cleanup of ${this.marker} failed:`, err);
        } finally {
            this.restoreEncryptionKey?.();
            this.restoreEncryptionKey = undefined;
        }
    }

    /** Cleans up every fixture a check left open. For a bundle's Teardown. */
    public static async CleanupAll(): Promise<void> {
        for (const fixture of [...DecisionFixtures.open]) {
            await fixture.Cleanup();
        }
    }

    private async saveBinding(
        credentialId: string,
        bindingType: MJAICredentialBindingEntity['BindingType'],
        target: (binding: MJAICredentialBindingEntity) => void,
    ): Promise<string> {
        const binding = await this.provider.GetEntityObject<MJAICredentialBindingEntity>('MJ: AI Credential Bindings', this.user);
        binding.NewRecord();
        binding.CredentialID = credentialId;
        binding.BindingType = bindingType;
        target(binding);
        binding.Priority = 1;
        binding.IsActive = true;
        await this.save(binding, `${bindingType} credential binding`);
        this.bindingIDs.push(binding.ID);
        await this.RefreshEngine();
        return binding.ID;
    }

    private async save(entity: MJAIPromptEntity | MJAIPromptModelEntity | MJAICredentialBindingEntity, what: string): Promise<void> {
        if (!(await entity.Save())) {
            throw new Error(`Could not save the ${what}: ${entity.LatestResult?.CompleteMessage ?? 'no message'}`);
        }
    }

    private async deleteAll(entityName: string, ids: string[]): Promise<void> {
        for (const id of ids.splice(0).reverse()) {
            await DeleteById(entityName, id, this.provider, this.user);
        }
    }

    /** The credentials' audit-log rows, then the credentials. */
    private async deleteCredentials(): Promise<void> {
        const ids = this.credentialIDs.splice(0);
        if (ids.length === 0) {
            return;
        }
        await Settle(CREDENTIAL_TOUCH_SETTLE_MS);
        const inList = ids.map(id => `'${EscapeSQLString(id)}'`).join(', ');
        const logs = await RunView.FromMetadataProvider(this.provider).RunView<Pick<MJAuditLogEntity, 'ID'>>({
            EntityName: 'MJ: Audit Logs',
            ExtraFilter: `RecordID IN (${inList})`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        }, this.user);
        for (const log of logs.Success ? logs.Results : []) {
            await DeleteById('MJ: Audit Logs', log.ID, this.provider, this.user);
        }
        for (const id of ids.reverse()) {
            await DeleteById('MJ: Credentials', id, this.provider, this.user);
        }
        await CredentialEngine.Instance.Config(true, this.user);
    }

    /**
     * Makes sure `MJ: Credentials.Values` can be encrypted in this process. When its key comes from an
     * environment variable that is unset, sets a throwaway key until {@link Cleanup}.
     */
    private async ensureEncryptionKey(): Promise<void> {
        if (this.restoreEncryptionKey) {
            return;
        }
        const field = this.provider.EntityByName('MJ: Credentials')?.Fields.find(f => f.Name === 'Values');
        if (!field?.Encrypt || !field.EncryptionKeyID) {
            return;
        }
        const engine = EncryptionEngine.Instance;
        await engine.Config(false, this.user);
        const config = engine.GetKeyConfiguration(field.EncryptionKeyID);
        if (!config || config.source.DriverClass !== ENV_VAR_KEY_SOURCE) {
            return;
        }
        const version = config.key.KeyVersion;
        const envVar = !version || version === '1' ? config.key.KeyLookupValue : `${config.key.KeyLookupValue}_V${version}`;
        if (process.env[envVar]) {
            return;
        }
        process.env[envVar] = randomBytes(32).toString('base64');
        engine.ClearCaches();
        this.restoreEncryptionKey = () => {
            delete process.env[envVar];
            engine.ClearCaches();
        };
    }
}
