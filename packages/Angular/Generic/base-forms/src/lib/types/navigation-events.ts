import { BaseEntity, CompositeKey, IMetadataProvider } from '@memberjunction/core';

/**
 * Union type for all navigation event kinds emitted by the forms package.
 * The host application subscribes to these and maps them to its own routing system.
 *
 * @example Explorer integration:
 * ```typescript
 * HandleNavigation(event: FormNavigationEvent): void {
 *   switch (event.Kind) {
 *     case 'record':
 *       this.navigationService.NavigateToRecord(event.EntityName, event.PrimaryKey);
 *       break;
 *     case 'external-link':
 *       window.open(event.Url, '_blank');
 *       break;
 *   }
 * }
 * ```
 */
export type FormNavigationEvent =
  | RecordNavigationEvent
  | ExternalLinkNavigationEvent
  | EmailLinkNavigationEvent
  | EntityHierarchyNavigationEvent
  | ChildEntityTypeNavigationEvent
  | NewRecordNavigationEvent
  | CreateRelatedNavigationEvent
  | DismissFormNavigationEvent;

/**
 * User clicked a foreign key link to view a related record.
 * Emitted by mj-form-field when a record link is clicked.
 */
export interface RecordNavigationEvent {
  Kind: 'record';
  /** The entity name of the target record */
  EntityName: string;
  /** The primary key of the target record */
  PrimaryKey: CompositeKey;
  /** Whether to force opening in a new tab. When omitted, NavigationService uses its default behavior (shift-key detection). */
  OpenInNewTab?: boolean;
}

/**
 * User clicked an external URL (web link field value).
 */
export interface ExternalLinkNavigationEvent {
  Kind: 'external-link';
  /** The URL to navigate to */
  Url: string;
  /** Whether to open in a new tab (default: true for external links) */
  OpenInNewTab?: boolean;
}

/**
 * User clicked an email link.
 */
export interface EmailLinkNavigationEvent {
  Kind: 'email';
  /** The email address to compose a message to */
  EmailAddress: string;
}

/**
 * User clicked an IS-A parent entity badge in the hierarchy breadcrumb
 * or an "Inherited from X" badge in a section header.
 */
export interface EntityHierarchyNavigationEvent {
  Kind: 'entity-hierarchy';
  /** The parent entity name to navigate to */
  EntityName: string;
  /** The parent record's primary key (shared PK in IS-A) */
  PrimaryKey: CompositeKey;
  /** 'parent' = navigating up the chain, 'child' = navigating down, 'self' = current entity clicked */
  Direction: 'parent' | 'child' | 'self';
}

/**
 * User selected a child entity type from the subtypes dropdown.
 * The host app should navigate to a filtered list of those child records.
 */
export interface ChildEntityTypeNavigationEvent {
  Kind: 'child-entity-type';
  /** The child entity name selected */
  ChildEntityName: string;
  /** The current (parent) entity name */
  ParentEntityName: string;
  /** The current (parent) record ID for filtering */
  ParentRecordId: string;
}

/**
 * User wants to create a new related record (from a related entity section).
 */
export interface NewRecordNavigationEvent {
  Kind: 'new-record';
  /** The entity name to create a new record for */
  EntityName: string;
  /** Default field values (e.g., foreign key pointing back to current record) */
  DefaultValues: Record<string, unknown>;
}

/**
 * Form is asking the host to close/dismiss it.
 *
 * Emitted by `BaseFormComponent.CancelEdit` when the discarded record was never
 * saved (`!record.IsSaved`) — there's no actual record to view, so leaving the
 * form open in view mode shows blank fields and confuses users. The host
 * application should close the tab/dialog/route that contained the form and
 * return the user to whatever surface they came from (typically a list view).
 *
 * Hosts that don't have a meaningful "close" semantic (e.g., a form embedded
 * inline on a dashboard) can safely ignore this — the form has already
 * reverted state and returned to view mode.
 */
export interface DismissFormNavigationEvent {
  Kind: 'dismiss';
  /** Reason for the dismiss request — useful for analytics / different host behaviors. */
  Reason: 'new-record-discarded';
}

/**
 * A field (e.g. a foreign-key dropdown) is asking the host to create a NEW record of a
 * related entity — typically because the user searched for one that doesn't exist yet.
 *
 * The Generic forms layer only *emits* this; it deliberately does not open the create
 * form itself (that would couple a generic component to the app-layer form presenter).
 * The host application opens the related entity's form (e.g. via `MJFormPresenterService`
 * as a dialog or slide-in), prefilled with {@link NewRecordValues}, and — when the user
 * saves — calls {@link Complete} with the new record so the requesting field can select it.
 *
 * @example Explorer handler:
 * ```typescript
 * case 'create-related': {
 *   const ref = this.forms.Open({
 *     EntityName: event.EntityName,
 *     Presentation: event.Presentation ?? 'dialog',
 *     NewRecordValues: event.NewRecordValues,
 *     Provider: event.Provider,
 *   });
 *   event.Complete(await ref.AfterSaved());
 *   break;
 * }
 * ```
 */
export interface CreateRelatedNavigationEvent {
  Kind: 'create-related';
  /** Entity to create a new record of (the FK field's related entity). */
  EntityName: string;
  /**
   * Default field values to prefill on the new record — lets the requester seed any
   * fields (e.g. `{ Name: 'Marketing' }` from the typed search text), not just the name.
   */
  NewRecordValues?: Record<string, unknown>;
  /** Preferred surface for the create form. The host may honor or override it. */
  Presentation?: 'dialog' | 'slide-in';
  /** Metadata provider to use (multi-provider apps). */
  Provider?: IMetadataProvider;
  /**
   * Host callback: invoke with the saved record (or `null` if the user cancelled) so the
   * requesting field can select it. Optional for the host to call — a host with no create
   * surface can ignore the whole event.
   */
  Complete: (created: BaseEntity | null) => void;
}
