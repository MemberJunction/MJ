import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { IViewRenderer } from '../view-type.contracts';
import { CardTemplate, RecordSelectedEvent, RecordOpenedEvent } from '../../types';
import { EntityCardsComponent } from '../../entity-cards/entity-cards.component';
import { EntityViewerModule } from '../../../module';

/**
 * CardsViewRendererComponent
 * --------------------------
 * The Cards **view type** renderer — a thin {@link IViewRenderer} adapter that hosts the
 * existing {@link EntityCardsComponent} (`<mj-entity-cards>`) inside the entity-viewer's
 * pluggable view-type system. It is the dynamic-mounted plug-in that the `CardsViewType`
 * descriptor points at, replacing the descriptor's previous direct reference to
 * `EntityCardsComponent` (which did not honor the {@link IViewRenderer} contract).
 *
 * The host feeds the standard renderer inputs (`entity` / `records` / `selectedRecordId` /
 * `filterText` / `config`) via `setInput` and listens for `recordSelected` / `recordOpened`.
 * Two extra inputs (`cardTemplate`, `hiddenFieldMatches`) reproduce the host-level bindings
 * that `<mj-entity-cards>` was previously given directly in `entity-viewer.component.html` —
 * the host sets them via a guarded `setInput`.
 *
 * **Payload normalization:** `<mj-entity-cards>` emits the rich {@link RecordSelectedEvent} /
 * {@link RecordOpenedEvent} objects (`{ record, entity, compositeKey }`), but the host's
 * dynamic renderer handler expects the **raw record** and builds the composite key itself.
 * This adapter therefore extracts `.record` and re-emits just that object, matching the
 * other plug-in renderers (e.g. the Cluster renderer emits raw record objects).
 *
 * **Why import `EntityViewerModule` rather than `EntityCardsComponent` directly:**
 * {@link EntityCardsComponent} is an NgModule-declared (`standalone: false`) component, so
 * Angular forbids placing it directly in a standalone component's `imports` array (NG6008).
 * The supported way for a standalone component to consume a non-standalone component is to
 * import the NgModule that exports it — here {@link EntityViewerModule}. We import the module
 * class via its relative path (not the package barrel) to avoid a package-level circular
 * import. `EntityCardsComponent` is still imported above so its `@Input`/`@Output` types stay
 * referenced and the file documents exactly which component it adapts.
 *
 * Inputs use the camelCase names mandated by the {@link IViewRenderer} contract (the host
 * binds them by those exact names), rather than MJ's usual PascalCase for public members —
 * mirroring the Cluster renderer.
 */
@Component({
  standalone: true,
  selector: 'mj-cards-view-renderer',
  encapsulation: ViewEncapsulation.None,
  imports: [EntityViewerModule],
  template: `
    <mj-entity-cards
      [Provider]="Provider"
      [entity]="entity"
      [records]="records"
      [selectedRecordId]="selectedRecordId"
      [cardTemplate]="cardTemplate"
      [hiddenFieldMatches]="hiddenFieldMatches"
      [filterText]="filterText ?? ''"
      (recordSelected)="onRecordSelected($event)"
      (recordOpened)="onRecordOpened($event)"
    >
    </mj-entity-cards>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `,
  ],
})
export class CardsViewRendererComponent extends BaseAngularComponent implements IViewRenderer<Record<string, unknown>> {
  // ---- IViewRenderer inputs (camelCase per the host contract) ----

  /** The entity whose records are being rendered. */
  @Input() entity: EntityInfo | null = null;

  /** The records to render (already loaded/filtered by the host). */
  @Input() records: Record<string, unknown>[] = [];

  /** Primary-key string of the currently selected record, if any. */
  @Input() selectedRecordId: string | null = null;

  /** Active filter text (used by the cards view for match highlighting). */
  @Input() filterText: string | null = null;

  /**
   * View-type-specific configuration. Cards has no per-view config — this is accepted to
   * satisfy the {@link IViewRenderer} contract and is otherwise unused (no-op).
   */
  @Input() config: Record<string, unknown> = {};

  // ---- Host-level inputs for <mj-entity-cards> (not per-view config) ----

  /**
   * Optional custom card template. This is host-level configuration (not stored in the view
   * type's `config`), so the host sets it via a guarded `setInput`. Type matches
   * {@link EntityCardsComponent.cardTemplate}.
   */
  @Input() cardTemplate: CardTemplate | null = null;

  /**
   * Optional map of record primary-key strings → hidden field names that matched the active
   * filter, used by the cards view to flag matches in non-visible fields. Host-level config,
   * set by the host via a guarded `setInput`. Type matches
   * {@link EntityCardsComponent.hiddenFieldMatches}.
   */
  @Input() hiddenFieldMatches: Map<string, string> = new Map();

  // ---- IViewRenderer outputs ----

  /** Emitted when a record is selected (single click) — payload is the raw record object. */
  @Output() recordSelected = new EventEmitter<unknown>();

  /** Emitted when a record should be opened (double-click / open) — payload is the raw record object. */
  @Output() recordOpened = new EventEmitter<unknown>();

  /**
   * Required by {@link IViewRenderer}; the cards view never mutates its own config, so this
   * never emits. Declared so the host's uniform output subscription is satisfied.
   */
  @Output() configChanged = new EventEmitter<Record<string, unknown>>();

  /**
   * Relay `<mj-entity-cards>`'s selection event, normalizing to the raw record the host
   * expects (the host builds the composite key itself).
   */
  onRecordSelected(event: RecordSelectedEvent): void {
    this.recordSelected.emit(event.record);
  }

  /**
   * Relay `<mj-entity-cards>`'s open event, normalizing to the raw record the host expects
   * (the host builds the composite key itself).
   */
  onRecordOpened(event: RecordOpenedEvent): void {
    this.recordOpened.emit(event.record);
  }
}

/**
 * Tree-shaking guard. Force-references this renderer so bundlers (ESBuild/Vite) don't drop the
 * component in builds that only mount it dynamically via the ClassFactory/descriptor. Mirrors
 * the Cluster renderer's load guard; the parent wires this into a barrel/module load path.
 */
export function LoadCardsViewRenderer(): void {
  // no-op; presence prevents tree-shaking of this component
}
