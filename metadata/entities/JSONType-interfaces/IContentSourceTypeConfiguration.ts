/**
 * Type-level configuration for a Content Source Type.
 *
 * Describes what fields/inputs are required when creating a content source
 * of this type. The UI reads this to dynamically render the appropriate
 * widgets (URL input, entity picker, storage provider selector, etc.)
 * without hardcoding source-type-specific logic.
 *
 * Each Content Source Type row (Entity, RSS Feed, Website, Cloud Storage,
 * Local File System) stores its own RequiredFields array describing what
 * the user needs to provide when configuring a source of that type.
 */
export interface IContentSourceTypeConfiguration {
    /**
     * Settings for individual extractors, keyed by extractor key, handed to that extractor as
     * `ExtractRequest.Options`. Layered: the Content Source Type's, then the source's
     * `SourceSpecificConfiguration`, then the source's own, then a run's `Options`. For example the
     * `Manifest` extractor (a CSV or TSV listing documents) reads `{ "Manifest": { "LinkColumn": "Link",
     * "TextColumn": "Body", "TitleColumn": "Title", "DateColumn": "Published", "DecoratorColumn": "Journal",
     * "KeyColumn": "ID", "Columns": { "Member Type": "Audience" }, "Delimiter": "," } }`.
     */
    ExtractorOptions?: Record<string, Record<string, unknown>>;

    /**
     * The registered page renderer (`BasePageRenderer`) that loads this source's web pages, for sites
     * built by script in the browser: `Headless` loads them in a headless Chromium (needs the
     * `playwright` package). Used by the website crawler and by Extract. Unset: a plain HTTP GET.
     */
    PageRenderer?: string;

    /**
     * The entity items of every source of this type are created, loaded and saved as: an IS-A extension of `MJ: Content Items`
     * (for example a product's own `Content Items` entity), by name. Saving an item as its extension
     * writes both rows under one ID, so no item exists without its extension row; an existing item that
     * has none gets it added. Used when the source names none; overrides the content type's and the system default
     * (`ContentPipeline.ItemEntity` on the default AI Configuration). Unset everywhere means plain
     * `MJ: Content Items`. An entity that is not an extension of `MJ: Content Items` fails the item.
     */
    ItemEntity?: string;

    /** Fields required when creating a content source of this type */
    RequiredFields?: IContentSourceTypeField[];
    /** Whether this source type requires a Content Type selection. Default true. Entity sources set this to false. */
    RequiresContentType?: boolean;
    /** Whether this source type requires a File Type selection. Default true. Entity sources set this to false. */
    RequiresFileType?: boolean;
}

/**
 * Describes a single field/input that a content source of this type requires.
 * The UI renders the appropriate widget based on the Type property.
 */
export interface IContentSourceTypeField {
    /** Internal field key — stored in ContentSource.Configuration.SourceSpecificConfiguration */
    Key: string;
    /** Display label for the UI widget */
    Label: string;
    /**
     * Widget type to render:
     * - 'text': plain text input
     * - 'url': URL input with validation
     * - 'path': file/directory path input
     * - 'entity-picker': dropdown of MJ entities (filtered to those with entity documents)
     * - 'entity-doc-picker': dropdown of entity documents for the selected entity
     * - 'storage-provider-picker': dropdown of registered MJ Storage providers
     * - 'dropdown': generic dropdown with options from the Options array
     */
    Type: 'text' | 'url' | 'path' | 'entity-picker' | 'entity-doc-picker' | 'storage-provider-picker' | 'dropdown';
    /** Help text shown below the widget */
    Description?: string;
    /** Whether this field must be filled before saving */
    Required?: boolean;
    /** Default value for the field */
    DefaultValue?: string;
    /** For 'dropdown' type: available options */
    Options?: IContentSourceTypeFieldOption[];
    /** For 'entity-doc-picker': only show if the selected entity has > 1 document */
    ShowOnlyIfMultiple?: boolean;
    /**
     * For dependent fields: the Key of the field this depends on.
     * E.g., entity-doc-picker depends on entity-picker's value.
     */
    DependsOnField?: string;
}

/** A selectable option for dropdown-type fields */
export interface IContentSourceTypeFieldOption {
    /** Display label */
    Label: string;
    /** Value stored in configuration */
    Value: string;
}
