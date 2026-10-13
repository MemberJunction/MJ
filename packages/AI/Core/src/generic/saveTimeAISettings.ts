import { BaseSingleton } from '@memberjunction/global';

/**
 * Host-level switches for the AI work that server entity saves perform. Every switch defaults to
 * enabled; the host sets one to `false` to turn that work off for ALL saves it serves, including
 * saves that arrive over GraphQL, where the caller cannot set a per-instance flag (for example a
 * deterministic integration-test host). The deterministic part of each save still runs; only the
 * model call is skipped.
 *
 * MJServer reads these from the `saveTimeAI` section of its config at startup and installs them on
 * {@link SaveTimeAISettings}.
 *
 * The family covers every save-time model call of a server entity class except Duplicate Runs (by design,
 * see the exclusions below):
 *
 * | Switch | Entities whose save calls the model | Model call | What runs instead when `false` |
 * |---|---|---|---|
 * | `QueryParameters` | `MJ: Queries`, `MJ: Query SQLs` | the "SQL Query Parameter Extraction" prompt | deterministic parameters, fields, entities and dependencies with heuristic descriptions |
 * | `TemplateParameters` | `MJ: Template Contents` | the template parameter description prompt | deterministic parameters with heuristic descriptions |
 * | `ViewSmartFilters` | `MJ: User Views` | the "Smart Filter Generation" prompt | the view keeps its current WhereClause |
 * | `CodeGeneration` | `MJ: Actions` (Type 'Generated'), `MJ: Remote Operations` (GenerationType 'AI') | the code-generation prompts | the record saves with its current code |
 * | `Embeddings` | `MJ: Queries`, `MJ: Tags`, `MJ: AI Agent Notes`, `MJ: AI Agent Examples`, `MJ: Components` | the local (in-process) embedding model | nothing is computed or cleared: the stored vectors are left exactly as they are, even when the source text is now empty |
 *
 * Not in the family:
 * - `MJ: Duplicate Runs` (by design): saving a new run starts duplicate detection, which vectorizes the
 *   source records through the Entity Document's embedding model (`MJDuplicateRunEntityServer`,
 *   `DuplicateRecordDetector`). Creating the run IS the request to detect; a switch would make the entity a no-op.
 * - `MJ: AI Agent Requests`: a responded request resumes the agent; that run is the feature itself, not
 *   work done for the save.
 * - Entity Actions and Entity AI Actions that metadata attaches to any entity (including the
 *   `Run Record Process` action a Record Process's on-change trigger owns): the provider fires them on save
 *   (`GenericDatabaseProvider.HandleEntityActions` / `HandleEntityAIActions`); attaching them is the request,
 *   and Entity AI Actions already have a per-save opt-out (`EntitySaveOptions.SkipEntityAIActions`).
 * - `MJ: Vector Indexes` (creates the index in the vector database, not a model call) and
 *   `MJ: AI Prompt Runs` (computes cost from stored usage).
 *
 * `BaseEntity.SkipEmbeddings` (set by `mj sync push`) is a different, per-instance deferral: every entity above
 * that embeds on save clears a changed record's vector instead of computing it, and the engine that serves those
 * vectors embeds and persists records without one (through `EmbeddingBackfill` in `@memberjunction/aiengine`) when
 * it starts and when such records change — `QueryEngineServer` (queries, when it loads), `TagEngine` (tags, when it
 * loads), `AIEngine` (agent notes and examples, once its embeddings load) and `ComponentMetadataEngineServer`
 * (components, at server startup). While `embeddings` is off, every one of those engines computes
 * nothing either: the switch covers the save path and every automatic embedding path behind it. `TagEngine` also
 * embeds a tag it creates or renames (with the tag model); that is skipped too. Explicit, user-requested work
 * (`TagEngine.RebuildTagEmbeddings`, similarity searches) is not save-time work and is not affected.
 *
 * Lives in `@memberjunction/ai` — the lowest package every reader depends on (the entity servers, MJServer,
 * `AIEngine`, `TagEngine`, `QueryEngineServer`, `ComponentMetadataEngineServer`, the integration test suite) —
 * so one switch is read the same way everywhere.
 *
 * The four prompt switches are the ones a host that must make no live model call turns off
 * ({@link SaveTimeAISettings.PromptKinds}). `Embeddings` runs a local model: in-process, needs no
 * credentials, writes no AI Prompt Run, and returns the same vector for the same text.
 */
export interface SaveTimeAIConfig {
    /** `false` disables AI enrichment of query parameters and fields on `MJ: Queries` / `MJ: Query SQLs` saves. */
    QueryParameters?: boolean;
    /** `false` disables AI enrichment of template parameters on `MJ: Template Contents` saves. */
    TemplateParameters?: boolean;
    /** `false` disables Smart Filter WHERE-clause generation on `MJ: User Views` saves. */
    ViewSmartFilters?: boolean;
    /** `false` disables code generation on `MJ: Actions` and `MJ: Remote Operations` saves. */
    CodeGeneration?: boolean;
    /** `false` disables the embedding of text fields on save, and the automatic embedding paths behind it. */
    Embeddings?: boolean;
}

/** One switch of {@link SaveTimeAIConfig}. */
export type SaveTimeAIKind = keyof SaveTimeAIConfig;

/**
 * The process's {@link SaveTimeAIConfig}. A {@link BaseSingleton}, so every copy of this package
 * loaded into one process reads the same settings.
 */
export class SaveTimeAISettings extends BaseSingleton<SaveTimeAISettings> {
    /** The switches whose model call runs an AI prompt (a live model, credentials, an AI Prompt Run row). */
    public static readonly PromptKinds: readonly SaveTimeAIKind[] = ['QueryParameters', 'TemplateParameters', 'ViewSmartFilters', 'CodeGeneration'];

    private _config: Readonly<SaveTimeAIConfig> = {};

    /** Use {@link SaveTimeAISettings.Instance}. */
    public constructor() {
        super();
    }

    /** The process-wide settings. */
    public static get Instance(): SaveTimeAISettings {
        return SaveTimeAISettings.getInstance<SaveTimeAISettings>();
    }

    /** The installed switches. An empty object (the default) leaves every kind enabled. */
    public get Config(): Readonly<SaveTimeAIConfig> {
        return this._config;
    }

    public set Config(config: Readonly<SaveTimeAIConfig>) {
        this._config = { ...config };
    }

    /**
     * True when the host has switched the given kind off. Only an explicit `false` disables: an
     * absent key and `true` both leave it enabled, so a config that predates a new switch keeps
     * that work running.
     */
    public IsDisabled(kind: SaveTimeAIKind): boolean {
        return this._config[kind] === false;
    }

    /** A config that turns every {@link PromptKinds} switch off and leaves the others as they are in `base`. */
    public static WithPromptsDisabled(base: Readonly<SaveTimeAIConfig>): SaveTimeAIConfig {
        const config: SaveTimeAIConfig = { ...base };
        for (const kind of SaveTimeAISettings.PromptKinds) {
            config[kind] = false;
        }
        return config;
    }
}
