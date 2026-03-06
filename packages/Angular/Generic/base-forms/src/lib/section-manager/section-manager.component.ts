import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, inject,
  OnChanges, SimpleChanges
} from '@angular/core';
import { PanelVariant } from '../types/form-types';

/**
 * Info about a section, passed from the container to the Section Manager drawer.
 */
export interface SectionManagerItem {
  SectionKey: string;
  SectionName: string;
  Variant: PanelVariant;
  Icon: string;
}

/**
 * Slide-in drawer for managing section order.
 *
 * Provides an accessible, keyboard-friendly alternative to drag-and-drop
 * for reordering form sections. Each section is displayed as a row with
 * up/down arrow buttons to change position.
 *
 * @example
 * ```html
 * <mj-section-manager
 *   [Sections]="sectionList"
 *   [SectionOrder]="currentOrder"
 *   [Visible]="showDrawer"
 *   (SectionOrderChange)="onOrderChange($event)"
 *   (Closed)="showDrawer = false">
 * </mj-section-manager>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-section-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './section-manager.component.html',
  styleUrls: ['./section-manager.component.css']
})
export class MjSectionManagerComponent implements OnChanges {
  private cdr = inject(ChangeDetectorRef);

  /** All available sections (unordered) */
  @Input() Sections: SectionManagerItem[] = [];

  /** Current section order (array of section keys) */
  @Input() SectionOrder: string[] = [];

  /** Whether the drawer is visible */
  @Input() Visible = false;

  /** Emits the new section order when the user reorders */
  @Output() SectionOrderChange = new EventEmitter<string[]>();

  /** Emits when the drawer is closed */
  @Output() Closed = new EventEmitter<void>();

  /** Emits when the user resets to default order */
  @Output() ResetRequested = new EventEmitter<void>();

  /** Ordered list of sections for display */
  OrderedSections: SectionManagerItem[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['Sections'] || changes['SectionOrder']) {
      this.RebuildOrderedSections();
    }
  }

  OnClose(): void {
    this.Closed.emit();
  }

  OnOverlayClick(event: MouseEvent): void {
    // Only close if clicking the overlay itself, not the drawer
    if (event.target === event.currentTarget) {
      this.OnClose();
    }
  }

  OnMoveUp(index: number): void {
    if (index <= 0) return;
    const newOrder = this.OrderedSections.map(s => s.SectionKey);
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    this.SectionOrderChange.emit(newOrder);
    this.ApplyOrder(newOrder);
  }

  OnMoveDown(index: number): void {
    if (index >= this.OrderedSections.length - 1) return;
    const newOrder = this.OrderedSections.map(s => s.SectionKey);
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    this.SectionOrderChange.emit(newOrder);
    this.ApplyOrder(newOrder);
  }

  OnReset(): void {
    this.ResetRequested.emit();
  }

  GetVariantIcon(variant: PanelVariant): string {
    switch (variant) {
      case 'related-entity': return 'fa-solid fa-link';
      case 'inherited': return 'fa-solid fa-arrow-up';
      default: return 'fa-solid fa-table-cells';
    }
  }

  GetVariantLabel(variant: PanelVariant): string {
    switch (variant) {
      case 'related-entity': return 'Related';
      case 'inherited': return 'Inherited';
      default: return 'Fields';
    }
  }

  private RebuildOrderedSections(): void {
    if (!this.Sections || this.Sections.length === 0) {
      this.OrderedSections = [];
      return;
    }

    const sectionMap = new Map<string, SectionManagerItem>();
    for (const s of this.Sections) {
      sectionMap.set(s.SectionKey, s);
    }

    const ordered: SectionManagerItem[] = [];

    // Add sections in persisted order first
    if (this.SectionOrder && this.SectionOrder.length > 0) {
      for (const key of this.SectionOrder) {
        const section = sectionMap.get(key);
        if (section) {
          ordered.push(section);
          sectionMap.delete(key);
        }
      }
    }

    // Append any sections not in the persisted order (new sections)
    for (const section of sectionMap.values()) {
      ordered.push(section);
    }

    this.OrderedSections = ordered;
    this.cdr.markForCheck();
  }

  private ApplyOrder(newOrder: string[]): void {
    const sectionMap = new Map<string, SectionManagerItem>();
    for (const s of this.OrderedSections) {
      sectionMap.set(s.SectionKey, s);
    }
    this.OrderedSections = newOrder
      .map(key => sectionMap.get(key))
      .filter((s): s is SectionManagerItem => s !== undefined);
    this.cdr.markForCheck();
  }
}
