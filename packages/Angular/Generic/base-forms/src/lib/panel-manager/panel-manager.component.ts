import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, inject,
  OnChanges, SimpleChanges,
} from '@angular/core';
import type { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { FormPanelAdminService } from './form-panel-admin.service';
import type { FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import {
  BuildPanelInventory,
  GroupPanelInventory,
  SummarizeInventory,
  type FormPanelCompiledRow,
  type FormPanelContributionRow,
  type FormPanelInventoryGroup,
  type FormPanelInventoryItem,
  type FormPanelStockGridRow,
} from './form-panel-inventory';
import {
  PlacementStateFromContribution,
  type FormPlacementContext,
  type FormPlacementDecision,
  type FormPlacementRelated,
  type FormPlacementState,
} from '../apply/form-placement';

/**
 * Drawer listing everything registered on one entity's form, with the switches for the
 * parts the user owns.
 *
 * It exists because applying a panel was reversible only through the Admin application's
 * raw grid. A user who added a panel has to be able to take it off in the place they
 * added it, without reading a column called `ReplacesSectionKey`.
 *
 * Compiled panels and automatic grids are listed but carry no buttons: neither is a row
 * anyone can delete, and a control that cannot work is worse than no control.
 */
@Component({
  standalone: false,
  selector: 'mj-panel-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './panel-manager.component.html',
  styleUrls: ['./panel-manager.component.css'],
})
export class MjPanelManagerComponent implements OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly admin = inject(FormPanelAdminService);

  @Input() Visible = false;

  /** The entity whose form is being managed. */
  @Input() Entity: EntityInfo | null = null;

  /** Compiled `BaseFormPanel` registrations on this entity, for the inventory. */
  @Input() Compiled: readonly FormPanelCompiledRow[] = [];

  /** Relationships the container fills a grid in for. */
  @Input() StockGrids: readonly FormPanelStockGridRow[] = [];

  /** Whether a full custom form owns this body, which holds everything else back. */
  @Input() FullCustomForm = false;

  /** Section and rail titles by key, so a claim reads as a name. */
  @Input() TitleByKey: ReadonlyMap<string, string> = new Map();

  /** Related grids on this form, so editing can still offer to take one over. */
  @Input() Related: readonly FormPlacementRelated[] = [];

  @Input() Provider: IMetadataProvider | null = null;

  /** A row was switched or removed, so the form has to resolve again. */
  @Output() Changed = new EventEmitter<void>();

  @Output() Closed = new EventEmitter<void>();

  public Items: FormPanelInventoryItem[] = [];

  /** The list, under headings. */
  public Groups: FormPanelInventoryGroup[] = [];

  /** The row being re-placed, or null. */
  public Editing: FormPanelInventoryItem | null = null;

  /** What the placement dialog opens on while editing. */
  public EditContext: FormPlacementContext | null = null;
  public EditProposal: FormContributionSpec | null = null;

  /** ID of the row a write is running on, so only its buttons go quiet. */
  public Busy: string | null = null;

  /** ID of the row awaiting a second press to confirm removal. */
  public Confirming: string | null = null;

  public Error = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['Visible'] && this.Visible) this.Refresh();
    else if (changes['Entity'] || changes['Compiled'] || changes['StockGrids'] || changes['FullCustomForm']) {
      this.Refresh();
    }
  }

  public get Summary(): string {
    return SummarizeInventory(this.Items);
  }

  public get EntityName(): string {
    return this.Entity?.Name ?? '';
  }

  public get IsEmpty(): boolean {
    return this.Items.length === 0;
  }

  /** Rebuild the list from the engine's current rows. */
  public Refresh(): void {
    this.rows = this.admin.RowsForEntity(this.Entity);
    this.Items = BuildPanelInventory({
      Contributions: this.rows,
      Compiled: this.Compiled,
      StockGrids: this.StockGrids,
      FullCustomForm: this.FullCustomForm,
      TitleByKey: this.TitleByKey,
    });
    this.Groups = GroupPanelInventory(this.Items);
    this.cdr.markForCheck();
  }

  /** The rows behind the list, so an edit can read the placement back. */
  private rows: FormPanelContributionRow[] = [];

  /**
   * Open the placement dialog on a row that is already on the form.
   *
   * Editing in place is what "remove it and add it again" was standing in for. The
   * dialog probes the form for itself, so the only context assembled here is what a
   * probe cannot know: the related grids and the other panels already installed.
   */
  public OnEdit(item: FormPanelInventoryItem): void {
    if (!item.CanEdit) return;
    const row = this.rows.find((candidate) => candidate.ID === item.ID);
    if (!row) return;

    const spec: FormContributionSpec = {
      slot: row.Slot as FormContributionSpec['slot'],
      presentation: row.Presentation === 'bare' ? 'bare' : 'panel',
      title: (row.Title ?? row.Name ?? '').trim(),
    };
    if (row.Icon) spec.icon = row.Icon;
    if (row.ReplacesSectionKey) spec.replacesSectionKey = row.ReplacesSectionKey;
    if (row.RelatedEntity) spec.relatedEntity = row.RelatedEntity;
    if (row.ContributionKey) spec.contributionKey = row.ContributionKey;

    const context: FormPlacementContext = {
      EntityName: this.Entity?.Name ?? '',
      Sections: [],
      Related: this.Related,
      // A panel cannot be asked to stand in for itself.
      Existing: this.Items
        .filter((other) => other.Origin === 'contribution' && other.ID !== item.ID)
        .map((other) => ({ Key: other.ID, Slot: other.Slot, Title: other.Title })),
      SlotsPresent: [],
      SlotsVerified: false,
      Layout: 'accordion',
      Rail: [],
      FullCustomForm: this.FullCustomForm,
      TargetsVerified: false,
    };

    this.Editing = item;
    this.EditProposal = spec;
    this.EditContext = context;
    this.Error = '';
    this.cdr.markForCheck();
  }

  /**
   * Seed the dialog with the row's own placement rather than a blank one.
   *
   * Recomputed against the dialog's context each time it asks, not replayed: the dialog
   * probes the form after it opens, so the first seed runs against a context with no
   * sections, slots or rail in it and a stored claim would not match anything yet.
   */
  public SeedEdit = (dialog: { State: FormPlacementState; Context: FormPlacementContext }): void => {
    if (!this.EditProposal || !this.Editing) return;
    const active = this.Editing.State !== 'draft' && this.Editing.State !== 'off';
    dialog.State = PlacementStateFromContribution(this.EditProposal, dialog.Context, active);
  };

  public async OnEditApplied(decision: FormPlacementDecision): Promise<void> {
    const item = this.Editing;
    this.CloseEdit();
    if (!item) return;
    await this.run(item.ID, () =>
      this.admin.SetPlacement(item.ID, decision.Contribution, decision.ActivateNow, this.Provider));
  }

  /** Clicking the backdrop closes the dialog; clicking the dialog itself does not. */
  public OnEditScrimClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.CloseEdit();
  }

  public CloseEdit(): void {
    this.Editing = null;
    this.EditContext = null;
    this.EditProposal = null;
    this.cdr.markForCheck();
  }

  public async OnToggle(item: FormPanelInventoryItem): Promise<void> {
    if (this.Busy || (!item.CanTurnOn && !item.CanTurnOff)) return;
    await this.run(item.ID, () => this.admin.SetActive(item.ID, item.CanTurnOn, this.Provider));
  }

  /**
   * Removal takes two presses on the same button rather than a second dialog. The drawer
   * is already over the form, and a confirm dialog over a drawer over a form leaves the
   * user two layers from the thing they are changing.
   */
  public async OnRemove(item: FormPanelInventoryItem): Promise<void> {
    if (this.Busy || !item.CanRemove) return;
    if (this.Confirming !== item.ID) {
      this.Confirming = item.ID;
      this.cdr.markForCheck();
      return;
    }
    this.Confirming = null;
    await this.run(item.ID, () => this.admin.Remove(item.ID, this.Provider));
  }

  public RemoveLabel(item: FormPanelInventoryItem): string {
    return this.Confirming === item.ID ? 'Really remove?' : 'Remove';
  }

  public ToggleLabel(item: FormPanelInventoryItem): string {
    return item.CanTurnOn ? 'Turn on' : 'Turn off';
  }

  public StateLabel(item: FormPanelInventoryItem): string {
    if (item.State === 'active') return 'On';
    if (item.State === 'draft') return 'Draft';
    if (item.State === 'held') return 'Held';
    return 'Off';
  }

  public OnClose(): void {
    this.Confirming = null;
    this.Error = '';
    this.CloseEdit();
    this.Closed.emit();
  }

  public OnOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.OnClose();
  }

  private async run(id: string, act: () => Promise<{ Success: boolean; Message?: string }>): Promise<void> {
    this.Busy = id;
    this.Error = '';
    this.cdr.markForCheck();
    try {
      const result = await act();
      if (!result.Success) {
        this.Error = result.Message ?? 'That did not work.';
      } else {
        this.Refresh();
        this.Changed.emit();
      }
    } finally {
      this.Busy = null;
      this.cdr.markForCheck();
    }
  }
}
