/**
 * Optional per-entity configuration bag.
 *
 * Stored as JSON in `MJ: Entities.Configuration`. CodeGen emits a typed
 * `ConfigurationObject` accessor on `MJEntityEntity` that returns
 * `IEntityConfiguration | null`.
 *
 * **NULL / `{}` / omitted keys** use the defaults on
 * {@link IEntityFormConfiguration} (`Layout: auto`, `RelatedRolePolicy: smart`).
 * Membership itself is L1 inclusion + L2 ranker + L3 `MJ: Form Chrome Rules`
 * + L4 user order. `BaseFormPolicy.DecorateChrome` is cosmetics only.
 *
 * Expand by adding a property here — no schema migration. Anything the engine
 * filters, sorts, or joins on stays a **column** on `Entity`. Anything the UI
 * consumes at render time belongs in this bag.
 *
 * @see guides/FORMS_ARCHITECTURE_GUIDE.md §7d
 */
export interface IEntityConfiguration {
    /**
     * Presentation / chrome. Null = host defaults (`Layout: auto`,
     * `RelatedRolePolicy: smart`).
     */
    UI?: IEntityUIConfiguration;

    /**
     * Optional file attachment configuration for this entity.
     * Controls whether attachments are permitted and sets entity-level upload policies.
     */
    Attachments?: IEntityAttachmentsConfiguration;

    /**
     * Record cloning configuration.
     * Omitted or Enabled=false means the entity cannot be a clone ROOT.
     * It may still be cloned as a child of another root when that root's relationship
     * policy says Deep, unless NotCloneable is true.
     */
    Clone?: IEntityCloneConfiguration;
}

/**
 * Configuration for entity-level file attachments.
 */
export interface IEntityAttachmentsConfiguration {
    /**
     * Whether file attachments/linking are enabled for this entity.
     * Default: true when storage providers are active. Set to false to explicitly disallow attachments.
     */
    Enabled?: boolean;

    /**
     * Maximum allowed size per attachment in bytes (e.g. 52428800 for 50MB).
     * When omitted, uses global storage provider default.
     */
    MaxFileSizeBytes?: number;

    /**
     * Allowed MIME types or file extensions (e.g. ['image/*', 'application/pdf', '.docx']).
     * When omitted, all file types supported by the storage provider are allowed.
     */
    AllowedContentTypes?: string[];

    /**
     * Optional default Storage Account ID to route uploads for this entity.
     */
    DefaultStorageAccountID?: string;

    /**
     * Optional default File Category ID for attachments on this entity.
     */
    DefaultCategoryID?: string;
}

/**
 * Entity-level presentation configuration.
 *
 * Nested under {@link IEntityConfiguration.UI} so later UI concerns (list
 * cards, search chrome, map defaults) can sit beside `Form` without a
 * migration.
 */
export interface IEntityUIConfiguration {
    /**
     * How the generated record form arranges its sections.
     * Null = inherit {@link IEntityFormConfiguration} defaults.
     */
    Form?: IEntityFormConfiguration;
}

/**
 * Generated-form chrome for this entity (L2 defaults).
 *
 * Consumed by `<mj-record-form-container>`. L1 `inclusion` and L3
 * `MJ: Form Chrome Rules` decide membership; this bag only ranks Auto
 * leftovers and chooses accordion vs left-nav.
 */
export interface IEntityFormConfiguration {
    /**
     * Layout chrome for the generated form.
     *
     * - `'accordion'` — every first-class section is a collapsible panel.
     * - `'left-nav'` — a left rail of section groups; the body shows one group.
     * - `'auto'` — accordion until the first-class section count reaches
     *   {@link AutoLeftNavAt}, then left-nav.
     *
     * Omit to treat as `'auto'`.
     */
    Layout?: 'accordion' | 'left-nav' | 'auto';

    /**
     * Section-count threshold used when {@link Layout} is `'auto'` (or omitted).
     * Defaults to 8. Ignored for an explicit `'accordion'` or `'left-nav'`.
     */
    AutoLeftNavAt?: number;

    /**
     * How Auto (omitted inclusion) relationships are resolved.
     *
     * - `'keep-all-primary'` — every remaining Auto related stays first-class.
     * - `'smart'` — budgeted ranker: same-schema 1:N / collections / custom
     *   display components stay top-level; cross-schema hang-ons and platform
     *   plumbing fold into More once the Auto pool exceeds
     *   {@link PrimaryRelatedBudget}.
     *
     * Omit to treat as `'smart'`.
     */
    RelatedRolePolicy?: 'keep-all-primary' | 'smart';

    /**
     * Max Auto related grids that stay first-class when
     * {@link RelatedRolePolicy} is `'smart'`. Default 6. Explicit
     * `inclusion: 'Primary'` is never capped by this number.
     */
    PrimaryRelatedBudget?: number;
}

/**
 * Configuration for record cloning at the entity level.
 * @see plans/record-cloning/README.md §4.1
 */
export interface IEntityCloneConfiguration {
    /** Schema version of this section. Default 1. */
    Version?: 1;
    /** Master switch for cloning this entity as a ROOT. Default false. */
    Enabled?: boolean;
    /** Hard refusal: this entity's rows are never created by the clone engine, as root or as child. Overrides every relationship policy. Use for audit, run, credential and metadata entities. */
    NotCloneable?: boolean;
    /** Shown to users and returned in warnings when NotCloneable or Enabled=false. */
    NotCloneableReason?: string;
    /** Authorization name checked with ancestors. Default 'Clone Records'; resolved per §9.1. */
    RequiredAuthorization?: string;
    /** Caps. Defaults 3 and 500. A plan that exceeds either is Blocked. */
    MaxDepth?: number;
    MaxRecords?: number;
    /** IS-A subtype rows. Default 'include'. */
    Subtypes?: 'include' | 'exclude';
    /** Self-referencing IsHierarchy fields. Default 'subtree'. */
    Hierarchy?: 'subtree' | 'node';
    /** Inbound polymorphic EntityID/RecordID rows (tags, attachments, notes...). Default 'skip'. */
    SoftLinks?: 'skip' | 'include';
    Naming?: ICloneNamingConfig;
    Fields?: ICloneFieldRules;
    /** Per-relationship policy, keyed by "<RelatedEntityName>" or "<RelatedEntityName>.<JoinField>" when an entity has two FKs to the same target. Overrides the relationship's own bag when Locked is false there. */
    Relationships?: Record<string, ICloneRelationshipPolicy>;
    /** Rules applied to descendant rows cloned under THIS root, keyed by descendant entity name. Lets a root shape its children without editing the child entity's bag. */
    Descendants?: Record<string, ICloneDescendantConfig>;
    Hooks?: ICloneHookConfig;
    /** Route the ROOT through an existing creation path instead of a raw Save. Children still clone through the engine against the created root. */
    CreationPath?: ICloneCreationPath;
    /** Offer "create derived record" (BasedOnID-style inheritance) as an alternative to copying. */
    Derivation?: { Field: string; Label?: string; Description?: string };
    /** Persisted embedding columns. Default 'copy' when EmbeddingModelID matches the configured model, else regenerate. */
    Embeddings?: 'copy' | 'regenerate';
    /** The entity's own server class refuses creates by other user types (Users, Roles). The planner blocks early with the entity's reason. */
    RequiredUserType?: 'Owner';
    /** How much the UI may change. Default 'all'. 'none' = confirm only. */
    UserEditable?: 'none' | 'fields' | 'scope' | 'all';
    Presets?: IClonePreset[];
    UI?: {
        Label?: string;
        Icon?: string;
        ConfirmationMessage?: string;
        DefaultPreset?: string;
        /** FK fields the panel offers as retarget pickers (CompanyID → another company). */
        RetargetFields?: string[];
    };
}

export interface ICloneNamingConfig {
    /** Template for the name field and any string unique field with no other rule. '{Name}' interpolates the source value; '{n}' the collision counter. Default 'Copy of {Name}'. */
    Template?: string;
    /** Fields the template applies to. Default: the entity's NameField plus every IsUnique string field not otherwise handled. */
    Fields?: string[];
    /** suffix = apply Template and probe for collisions appending ' {n}'; increment = numeric/versioned bump; prompt = user must supply; none = leave untouched. Default 'suffix'. */
    Strategy?: 'suffix' | 'increment' | 'prompt' | 'none';
}

export interface ICloneFieldRules {
    /** Never copied; take the column default. Beyond the always-excluded set (PK, __mj_*, identity, computed, virtual, denied-create). */
    Exclude?: string[];
    /** Literal stamps applied after the copy. Values pass through BaseEntity.Set and validation. */
    Reset?: Record<string, unknown>;
    /** Set to the cloning user's ID. */
    Ownership?: string[];
    /** The user must supply a value; un-suffixable uniques such as Email. Missing → plan Blocked. */
    PromptFor?: string[];
    /** Server-minted values (numbers, slugs): blanked so the entity's Save hook allocates. */
    ServerAllocated?: string[];
    /** Rich rewrites. Evaluated per row with the source row as fields, plus clone context (user, now, root, keyMap) — see §7.5. */
    Rules?: Record<string, unknown>;
    /** JSON columns that embed record IDs. */
    JsonRemap?: Record<string, IJsonRemapSpec[]>;
    /** Columns that must be cleared together (all-or-nothing CHECK pairs). Each group is cleared as a unit when any member is reset. */
    ClearTogether?: string[][];
    /** Unique keys the metadata cannot see: composite and filtered indexes. See §7.3. */
    UniqueKeys?: Array<{ Fields: string[]; Scope: 'Global' | 'Parent' | 'LiveState'; ScopeField?: string }>;
    /** Drift guard (§13.3): every field must appear in Copy, Exclude, Reset, Ownership, PromptFor, ServerAllocated or JsonRemap, or validation fails. Default false. */
    Strict?: boolean;
    /** Explicit copy allow-list, used with Strict. */
    Copy?: string[];
}

export interface IJsonRemapSpec {
    /** Path selector: dot segments and [*] for arrays, e.g. 'layout.content[*].componentState.config.viewId'. */
    Path: string;
    /** remap = rewrite via key map when the target is in the clone set, else per OnMissing; reuse = leave; regenerate = new UUID; null = set null; drop = remove element/key. */
    Mode: 'remap' | 'reuse' | 'regenerate' | 'null' | 'drop';
    /** Entity the ID refers to, for remap. */
    Entity?: string;
    /** For remap when the referenced record was not cloned: reuse the original (default) or drop the element and count it. */
    OnMissing?: 'reuse' | 'drop';
}

export interface ICloneRelationshipPolicy {
    Policy?: 'Deep' | 'Reference' | 'Skip';
    /** UI may not change it. */
    Locked?: boolean;
    MaxRecords?: number;
    /** Write the source's positional values after the last Add instead of letting the collection renumber. Default false. */
    PreserveSequence?: boolean;
    /** Formula over the child row (fields.X); only rows evaluating true are cloned. */
    IncludeWhen?: string;
    Fields?: ICloneFieldRules;
}

export interface ICloneDescendantConfig {
    Fields?: ICloneFieldRules;
    Naming?: ICloneNamingConfig;
}

export interface ICloneHookConfig {
    /** Entity Actions (Create/Update invocations) during the clone save. Default 'suppress'. */
    EntityActions?: 'suppress' | 'fire';
    /** Entity AI Actions. Default 'suppress'. */
    AIActions?: 'suppress' | 'fire';
    /** Children the entity's own server Save() creates. The engine never clones these, and warns if a relationship policy tries. */
    ServerGeneratedChildren?: string[];
    /** Values set before the save to keep expensive hooks quiet, restored on the row after the clone when RestoreAfterSave is true. */
    PreSaveOverrides?: Record<string, unknown>;
    RestoreAfterSave?: string[];
    /** Action run once per created ROOT after commit, with the new key. */
    PostCloneAction?: string;
}

export interface ICloneCreationPath {
    Kind: 'Action' | 'RemoteOperation';
    Name: string;
    /** Source field or formula → input param. */
    InputMapping: Record<string, string>;
    /** Output param holding the created key. */
    OutputKeyParam: string;
}

/**
 * A named clone scope a user can pick instead of adjusting options one by one.
 * `Options` apply as if the request had sent them (so `UserEditable` still limits them);
 * `Relationships` override edge policies by related entity name, like `Clone.Relationships`.
 */
export interface IClonePreset {
    /** Stable identifier sent by clients in `Options.Preset`. */
    Key: string;
    /** Name shown in the preset picker. */
    Label: string;
    Description?: string;
    /** Plan options this preset sets, e.g. `{ "MaxDepth": 2 }`. */
    Options?: Record<string, unknown>;
    /** Edge policy overrides, keyed by related entity name. */
    Relationships?: Record<string, { Policy: 'Deep' | 'Reference' | 'Skip' }>;
}

