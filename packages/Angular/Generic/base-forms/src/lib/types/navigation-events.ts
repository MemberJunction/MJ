import { CompositeKey } from '@memberjunction/core';

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
  | NewRecordNavigationEvent;

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
