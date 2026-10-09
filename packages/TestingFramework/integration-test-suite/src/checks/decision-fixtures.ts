/**
 * decision-fixtures.ts — throwaway decision-routing fixtures for the cloudflare-clef, systemone-kev and
 * perplexity-decider bundles: real `MJ: Credentials` rows created through `CredentialEngine`,
 * `MJ: AI Credential Bindings` rows, a test Decision prompt with its own model bindings, a test Decision
 * model with model-vendor rows under keys the check chooses, a probe runner, a driver that is always
 * unavailable, and the cleanup for all of them.
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
 * CLEANUP, children first: prompt runs (the tracked ones, and any other run of a test prompt or a test
 * model), credential bindings, prompt models, prompts, model-vendor rows, models, the credentials'
 * `Credential Access` audit-log rows, then the credentials. Every delete is best-effort, and one that fails or returns false is logged with its
 * reason, so a failing check still cleans up and a row it leaves is named. The platform's own Record
 * Changes history for the tracked entities is left, as every other bundle leaves it.
 */
import { randomBytes } from 'node:crypto';
import { CompositeKey, RunView, type BaseEntity, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { BaseDecision, DecisionResult } from '@memberjunction/ai';
import type {
    MJAICredentialBindingEntity,
    MJAIModelEntity,
    MJAIModelVendorEntity,
    MJAIPromptEntity,
    MJAIPromptModelEntity,
    MJCredentialEntity,
} from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIDecisionRunner, type AIDecisionParams, type FailoverAttempt, type ModelVendorCandidate } from '@memberjunction/ai-prompts';
import { CredentialEngine } from '@memberjunction/credentials';
import { EncryptionEngine } from '@memberjunction/encryption';
import { Settle } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { AGENT_LIVE_FIXTURE_TAG, NewMarker, RequireRows } from './agent-live-shared';

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

/** The two kinds of model-vendor row: the vendor that made the model, and a vendor that serves it. */
export type ModelVendorRowType = 'Model Developer' | 'Inference Provider';

/** A vendor type definition's ID by name, or a thrown error naming the sync that would add it. */
function requireVendorTypeID(name: ModelVendorRowType): string {
    const definition = AIEngine.Instance.VendorTypeDefinitions.find(vt => vt.Name === name);
    if (!definition) {
        throw new Error(`The '${name}' vendor type definition is not in this database: sync the metadata (mj sync push --dir=metadata)`);
    }
    return definition.ID;
}

/** The ID of the `Decision` model type, or a thrown error naming the sync that would add it. */
function requireDecisionModelTypeID(): string {
    const modelType = AIEngine.Instance.ModelTypes.find(t => t.Name === 'Decision');
    if (!modelType) {
        throw new Error(`The 'Decision' AI model type is not in this database: sync the metadata (mj sync push --dir=metadata)`);
    }
    return modelType.ID;
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

/**
 * A decision driver that fails every call with an error that allows failover, as a 503 does. A check
 * registers it over the drivers ahead of the candidate it wants a run to fail over to.
 */
export class UnavailableDecision extends BaseDecision {
    constructor(apiKey?: string) {
        super(apiKey || 'it-unavailable-decision');
    }

    protected async DoDecide(): Promise<DecisionResult> {
        const now = new Date();
        const failed = new DecisionResult(false, now, now);
        failed.errorMessage = 'The integration-test decision stand-in is unavailable';
        failed.errorInfo = { errorType: 'ServiceUnavailable', severity: 'Retriable', canFailover: true };
        return failed;
    }
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

/** One `MJ: AI Model Vendors` row of a test Decision model. */
export interface DecisionModelVendorRow {
    /** The row's primary key. The check chooses it, so it knows where the row sorts. */
    ID: string;
    VendorName: string;
    Type: ModelVendorRowType;
    Priority: number;
    DriverClass?: string;
    APIName?: string;
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
    private readonly modelVendorIDs: string[] = [];
    private readonly modelIDs: string[] = [];
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

    /**
     * Creates an Active `Decision` model (power rank 0, no limits, no cost row) with `rows` as its
     * model-vendor rows, saved in the order given and under the keys given, then reloads the AI engine so
     * the runner sees them. A model's name is limited to 50 characters, so it carries the fixture's
     * marker and its description carries the safe-to-delete tag.
     */
    public async CreateDecisionModel(what: string, rows: DecisionModelVendorRow[]): Promise<MJAIModelEntityExtended> {
        const model = await this.provider.GetEntityObject<MJAIModelEntity>('MJ: AI Models', this.user);
        model.NewRecord();
        model.Name = `IT model ${this.marker}`;
        model.Description = `Integration-test Decision model for ${what} ${AGENT_LIVE_FIXTURE_TAG}`;
        model.AIModelTypeID = requireDecisionModelTypeID();
        model.IsActive = true;
        model.PowerRank = 0;
        model.SpeedRank = 0;
        model.CostRank = 0;
        await this.save(model, `model '${what}'`);
        this.modelIDs.push(model.ID);

        for (const spec of rows) {
            const row = await this.provider.GetEntityObject<MJAIModelVendorEntity>('MJ: AI Model Vendors', this.user);
            row.NewRecord();
            row.ID = spec.ID;
            row.ModelID = model.ID;
            row.VendorID = RequireVendorID(spec.VendorName);
            row.TypeID = requireVendorTypeID(spec.Type);
            row.Priority = spec.Priority;
            row.Status = 'Active';
            row.DriverClass = spec.DriverClass ?? null;
            row.APIName = spec.APIName ?? null;
            row.SupportedResponseFormats = 'Any';
            row.SupportsEffortLevel = false;
            row.SupportsStreaming = false;
            await this.save(row, `${spec.Type} row of model '${what}'`);
            this.modelVendorIDs.push(row.ID);
        }

        await this.RefreshEngine();
        const loaded = AIEngine.Instance.ModelsByID.get(NormalizeUUID(model.ID));
        if (!loaded) {
            throw new Error(`The test model '${model.Name}' is not in the AI engine after a reload`);
        }
        return loaded;
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
            await this.deleteUntrackedPromptRuns();
            await this.deleteAll('MJ: AI Credential Bindings', this.bindingIDs);
            await this.deleteAll('MJ: AI Prompt Models', this.promptModelIDs);
            await this.deleteAll('MJ: AI Prompts', this.promptIDs);
            await this.deleteAll('MJ: AI Model Vendors', this.modelVendorIDs);
            await this.deleteAll('MJ: AI Models', this.modelIDs);
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

    private async save(entity: BaseEntity, what: string): Promise<void> {
        if (!(await entity.Save())) {
            throw new Error(`Could not save the ${what}: ${entity.LatestResult?.CompleteMessage ?? 'no message'}`);
        }
    }

    private async deleteAll(entityName: string, ids: string[]): Promise<void> {
        for (const id of ids.splice(0).reverse()) {
            await this.deleteRow(entityName, id);
        }
    }

    /**
     * Deletes one row, logging a delete that throws or returns false with its reason. `Delete()` reports
     * a refused delete (a foreign key still pointing at the row) by returning false, not by throwing.
     */
    private async deleteRow(entityName: string, id: string): Promise<void> {
        try {
            const row = await this.provider.GetEntityObject<BaseEntity>(entityName, this.user);
            if (!(await row.InnerLoad(CompositeKey.FromID(id)))) {
                return;
            }
            if (!(await row.Delete())) {
                console.error(`[decision-fixtures] could not delete ${entityName} ${id}: ${row.LatestResult?.CompleteMessage ?? 'no message'}`);
            }
        } catch (err: unknown) {
            console.error(`[decision-fixtures] deleting ${entityName} ${id} threw:`, err);
        }
    }

    /**
     * Any run of this fixture's prompts or models it was not handed, such as one from a run that threw,
     * which would block the prompt's or the model's delete.
     */
    private async deleteUntrackedPromptRuns(): Promise<void> {
        const filters: string[] = [];
        if (this.promptIDs.length > 0) {
            filters.push(`PromptID IN (${this.inList(this.promptIDs)})`);
        }
        if (this.modelIDs.length > 0) {
            const models = this.inList(this.modelIDs);
            filters.push(`ModelID IN (${models})`, `OriginalModelID IN (${models})`);
        }
        if (filters.length === 0) {
            return;
        }
        const ids = await this.idsWhere('MJ: AI Prompt Runs', filters.join(' OR '));
        await this.deleteAll('MJ: AI Prompt Runs', ids);
    }

    /** The IDs of the rows of `entityName` that match `filter`, read past every cache; none, logged, when the read fails. */
    private async idsWhere(entityName: string, filter: string): Promise<string[]> {
        const rows = await RunView.FromMetadataProvider(this.provider).RunView<{ ID: string }>({
            EntityName: entityName,
            ExtraFilter: filter,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        }, this.user);
        if (!rows.Success) {
            console.error(`[decision-fixtures] could not read ${entityName} to clean up: ${rows.ErrorMessage}`);
            return [];
        }
        return rows.Results.map(r => r.ID);
    }

    private inList(ids: string[]): string {
        return ids.map(id => `'${EscapeSQLString(id)}'`).join(', ');
    }

    /** The credentials' audit-log rows, then the credentials. */
    private async deleteCredentials(): Promise<void> {
        const ids = this.credentialIDs.splice(0);
        if (ids.length === 0) {
            return;
        }
        await Settle(CREDENTIAL_TOUCH_SETTLE_MS);
        await this.deleteAll('MJ: Audit Logs', await this.idsWhere('MJ: Audit Logs', `RecordID IN (${this.inList(ids)})`));
        await this.deleteAll('MJ: Credentials', ids);
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
