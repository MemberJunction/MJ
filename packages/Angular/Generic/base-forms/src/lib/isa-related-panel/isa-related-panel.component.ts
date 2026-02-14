import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, inject,
  OnChanges, SimpleChanges, ViewEncapsulation
} from '@angular/core';
import { BaseEntity, EntityInfo, CompositeKey } from '@memberjunction/core';
import { FormNavigationEvent, EntityHierarchyNavigationEvent } from '../types/navigation-events';

/**
 * Represents one related IS-A entity to display in the panel.
 */
export interface IsaRelatedItem {
  /** The entity name (e.g., "Members", "Speakers") */
  EntityName: string;
  /** Relationship to the current form's entity */
  Relationship: 'sibling' | 'child';
}

/**
 * Container panel that discovers and displays IS-A related entity records
 * (siblings and children) for the current form's record.
 *
 * **Placement**: Sits to the right of the main form panels inside
 * `<mj-record-form-container>`. Hidden when in edit mode or when
 * no related IS-A records exist.
 *
 * **Data flow**:
 * - Receives the current `Record` (BaseEntity) as input
 * - Inspects `EntityInfo.ParentEntityInfo` and `ISAChildren` to discover related records
 * - Renders an `<mj-isa-related-card>` for each related entity
 *
 * @example
 * ```html
 * <mj-isa-related-panel
 *   [Record]="record"
 *   (Navigate)="OnNavigate($event)">
 * </mj-isa-related-panel>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-isa-related-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './isa-related-panel.component.html',
  styleUrls: ['./isa-related-panel.component.css']
})
export class MjIsaRelatedPanelComponent implements OnChanges {
  private cdr = inject(ChangeDetectorRef);

  /** The entity record currently displayed in the form */
  @Input() Record: BaseEntity | null = null;

  /** Whether the form is in edit mode (panel hides during edit) */
  @Input() EditMode = false;

  /** Whether the panel is collapsed (icon-only strip in full-width mode) */
  @Input() Collapsed = false;

  /** Emitted for navigation to a related record */
  @Output() Navigate = new EventEmitter<FormNavigationEvent>();

  /** List of related IS-A entities to display cards for */
  RelatedItems: IsaRelatedItem[] = [];

  /** Whether there are any related IS-A items to show */
  get HasItems(): boolean {
    return this.RelatedItems.length > 0;
  }

  /** The current record's display name (to suppress in child cards when identical) */
  get CurrentRecordName(): string {
    if (!this.Record) return '';
    const name = this.Record.GetRecordName();
    return name ? String(name) : '';
  }

  /** The shared primary key for all IS-A related records */
  get SharedPrimaryKey(): CompositeKey | null {
    return this.Record?.PrimaryKey ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['Record']) {
      this.DiscoverRelatedItems();
    }
  }

  /**
   * Discover IS-A related entities by examining the current record's
   * entity hierarchy. Finds siblings (other children of the same parent)
   * and direct children.
   */
  private DiscoverRelatedItems(): void {
    this.RelatedItems = [];

    if (!this.Record) return;

    const entityInfo = this.Record.EntityInfo;
    if (!entityInfo) return;

    // Case 1: Current entity is a child type — find siblings via parent
    if (entityInfo.IsChildType && entityInfo.ParentEntityInfo) {
      this.DiscoverSiblingsFromParent(entityInfo);
    }

    // Case 2: Current entity is a parent type with overlapping subtypes —
    // show children from ISAChildren
    if (entityInfo.IsParentType && entityInfo.AllowMultipleSubtypes) {
      this.DiscoverOverlappingChildren();
    }

    // Case 3: Current entity is a parent type with disjoint subtype —
    // show the single child if it exists
    if (entityInfo.IsParentType && !entityInfo.AllowMultipleSubtypes) {
      this.DiscoverDisjointChild();
    }

    this.cdr.markForCheck();
  }

  /**
   * When viewing a child entity (e.g., Member), find sibling entities
   * (e.g., Speaker) that also have records with the same parent PK.
   * Uses the parent's ISAChildren if the parent uses overlapping subtypes,
   * or the parent's ISAChild for disjoint.
   */
  private DiscoverSiblingsFromParent(entityInfo: EntityInfo): void {
    const parent = this.Record?.ISAParent;
    if (!parent) return;

    const parentInfo = entityInfo.ParentEntityInfo!;

    if (parentInfo.AllowMultipleSubtypes) {
      // Overlapping: ISAChildren on the parent gives us all active children
      const children = parent.ISAChildren;
      if (children) {
        for (const child of children) {
          // Skip ourselves
          if (child.entityName !== entityInfo.Name) {
            this.RelatedItems.push({
              EntityName: child.entityName,
              Relationship: 'sibling'
            });
          }
        }
      }
    } else {
      // Disjoint: there can only be one child, so no siblings
      // Nothing to add
    }
  }

  /**
   * When viewing an overlapping parent (e.g., Person with AllowMultipleSubtypes),
   * show all active child records.
   */
  private DiscoverOverlappingChildren(): void {
    const children = this.Record?.ISAChildren;
    if (!children) return;

    for (const child of children) {
      this.RelatedItems.push({
        EntityName: child.entityName,
        Relationship: 'child'
      });
    }
  }

  /**
   * When viewing a disjoint parent entity, show the single child if present.
   */
  private DiscoverDisjointChild(): void {
    const child = this.Record?.ISAChild;
    if (!child) return;

    this.RelatedItems.push({
      EntityName: child.EntityInfo.Name,
      Relationship: 'child'
    });
  }

  /** Relay navigation events from child cards */
  OnCardNavigate(event: EntityHierarchyNavigationEvent): void {
    this.Navigate.emit(event);
  }
}
