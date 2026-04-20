import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, inject,
  OnChanges, SimpleChanges, ViewEncapsulation
} from '@angular/core';
import { BaseEntity, EntityInfo, CompositeKey } from '@memberjunction/core';
import { FormNavigationEvent, EntityHierarchyNavigationEvent } from '../types/navigation-events';
import { DiscoverISADescendants, BuildDescendantTree, IsaRelatedItem } from './isa-hierarchy-utils';

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
 * - Builds a tree structure for nested sub-card rendering
 * - Renders an `<mj-isa-related-card>` for each root-level related entity
 *   (grandchildren render as nested sub-cards inside their parent card)
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

  /** Root-level related IS-A entities to display cards for (children nested inside) */
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
   * and all descendants (children, grandchildren, etc.) as a tree.
   */
  private async DiscoverRelatedItems(): Promise<void> {
    this.RelatedItems = [];

    if (!this.Record) return;

    const entityInfo = this.Record.EntityInfo;
    if (!entityInfo) return;

    // Case 1: Current entity is a child type — find siblings via parent
    if (entityInfo.IsChildType && entityInfo.ParentEntityInfo) {
      this.DiscoverSiblingsFromParent(entityInfo);
    }

    // Case 2: Current entity is a parent type — discover all descendants as tree
    if (entityInfo.IsParentType) {
      await this.DiscoverDescendants();
    }

    this.cdr.markForCheck();
  }

  /**
   * When viewing a child entity (e.g., Member), find sibling entities
   * (e.g., Speaker) that also have records with the same parent PK.
   * Uses the parent's ISAChildren if the parent uses overlapping subtypes.
   */
  private DiscoverSiblingsFromParent(entityInfo: EntityInfo): void {
    const parent = this.Record?.ISAParent;
    if (!parent) return;

    const parentInfo = entityInfo.ParentEntityInfo!;

    if (parentInfo.AllowMultipleSubtypes) {
      const children = parent.ISAChildren;
      if (children) {
        for (const child of children) {
          if (child.entityName !== entityInfo.Name) {
            this.RelatedItems.push({
              EntityName: child.entityName,
              Relationship: 'sibling',
              Depth: 0,
              Children: []
            });
          }
        }
      }
    }
  }

  /**
   * Recursively discover all IS-A descendants and build a tree structure.
   * Root-level children appear as top-level cards; grandchildren nest inside.
   */
  private async DiscoverDescendants(): Promise<void> {
    if (!this.Record) return;

    const descendants = await DiscoverISADescendants(this.Record);
    const tree = BuildDescendantTree(descendants);
    this.RelatedItems.push(...tree);
  }

  /** Relay navigation events from child cards */
  OnCardNavigate(event: EntityHierarchyNavigationEvent): void {
    this.Navigate.emit(event);
  }
}
