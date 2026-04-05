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
