/**
 * Width mode for the form panels container.
 * - 'centered': Max-width constrained and centered (default, good for readability)
 * - 'full-width': No max-width constraint, uses full available width
 */
export type FormWidthMode = 'centered' | 'full-width';

/**
 * Variant for collapsible panel styling.
 * - 'default': Standard white card with accent border
 * - 'related-entity': Blue-accented card for related entity grid sections
 * - 'inherited': Purple-accented card for IS-A inherited field sections
 */
export type PanelVariant = 'default' | 'related-entity' | 'inherited';

/**
 * Information about a section within the form.
 * Used to initialize and track section state.
 *
 * @template M Optional metadata type for custom per-section data
 */
export interface FormSectionInfo<M = unknown> {
  /** Unique key for this section (used in state persistence) */
  SectionKey: string;
  /** Display name shown in the panel header */
  SectionName: string;
  /** Whether the section starts expanded. Default: true for field sections, false for related entities */
  IsExpanded: boolean;
  /** Row count for related entity sections (shown as badge) */
  RowCount?: number;
  /** Custom metadata attached to this section */
  Metadata?: M;
  /** Panel variant for styling */
  Variant?: PanelVariant;
  /** Font Awesome icon class for the section header */
  Icon?: string;
  /**
   * If set, indicates this section contains fields inherited from a parent entity.
   * The value is the parent entity name (e.g., "Products" for a Meeting IS-A Product).
   */
  InheritedFromEntity?: string;
}

/**
 * Event emitted when a panel drag-to-reorder operation starts.
 */
export interface PanelDragStartEvent {
  SectionKey: string;
  Event: DragEvent;
}

/**
 * Event emitted when a panel is dropped onto another panel for reordering.
 */
export interface PanelDropEvent {
  SourceSectionKey: string;
  TargetSectionKey: string;
}

/**
 * Context object passed from the form to all child components (panels, fields).
 * Eliminates the need for many individual @Input properties.
 *
 * Property names use camelCase to maintain structural compatibility with
 * {@link BaseFormContext} from `@memberjunction/ng-base-forms`. This allows
 * BaseFormComponent.formContext to be passed directly to ng-forms components.
 */
export interface FormContext {
  /** Current search filter string for highlighting/filtering sections and fields */
  sectionFilter?: string;
  /** Whether to show fields that have empty values in read-only mode */
  showEmptyFields?: boolean;
}

/**
 * Result of a form save operation.
 */
export interface FormSaveResult {
  /** Whether the save was successful */
  Success: boolean;
  /** Error message if save failed */
  ErrorMessage?: string;
  /** Number of milliseconds the save took */
  DurationMs?: number;
}

/**
 * Event emitted after a record is saved.
 */
export interface RecordSavedEvent {
  EntityName: string;
  RecordId: string;
  /** The display name of the saved record (for tab title updates, etc.) */
  RecordDisplayName?: string;
  Result: FormSaveResult;
}

/**
 * Event emitted after a record is deleted.
 */
export interface RecordDeletedEvent {
  EntityName: string;
  RecordId: string;
}
