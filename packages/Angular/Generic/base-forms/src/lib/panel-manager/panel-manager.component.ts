import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, inject,
  OnChanges, SimpleChanges,
} from '@angular/core';
import { Metadata, type CompositeKey, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import type { FormScope } from '@memberjunction/core-entities';
import { FormPanelAdminService } from './form-panel-admin.service';
import { HiddenPanelKeys } from '../panel-slot/panel-hides';
import type { FormAudience } from './form-audience';
import type { FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import {
  BuildFormItems,
  BuildPanelInventory,
  DescribeAudience,
  GroupPanelInventory,
  SummarizeInventory,
  type FormPanelFormItem,
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
 * "Manage this form" — the one place to manage what is on an entity's form.
 *
 * Lists the full custom forms available to the user and the panels on the form, grouped by who
 * each belongs to, because that decides what the user may do: anything to their own, hide what
 * is shared with them, nothing to a grid a relationship draws. Holders of the Manage Form
 * Defaults authorization also get Publish and Audience, which change what other people see.
 *
 * Every write goes through the admin service to the server, where the entity subclasses enforce
 * the same rule this drawer uses to decide what to draw.
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

  /** The full custom forms the toolbar picker offers, in its order. */
  @Input() Variants: ReadonlyArray<{ ID: string; Label: string }> = [];

  /** The form this user sees now; null when it is the generated form. */
  @Input() CurrentFormID: string | null = null;

  /** The record the form is showing, for the placement dialog's preview. Null for a new record. */
  @Input() RecordKey: CompositeKey | null = null;

  /** A row was switched or removed, so the form has to resolve again. */
  @Output() Changed = new EventEmitter<void>();

  /** The user chose a different full custom form, or the generated form (null). */
  @Output() FormChosen = new EventEmitter<string | null>();

  @Output() Closed = new EventEmitter<void>();

  public Items: FormPanelInventoryItem[] = [];

  /** The full custom forms and the generated form, for the Form group. */
  public Forms: FormPanelFormItem[] = [];

  /** Whether this user may publish to a role or to everyone. */
  public CanPublish = false;

  /** The item whose audience is being chosen, or null. */
  public Publishing: {
    Kind: 'panel' | 'form';
    ID: string;
    Title: string;
    Scope: FormScope;
    RoleID: string | null;
  } | null = null;

  /** The list, under headings. */
  public Groups: FormPanelInventoryGroup[] = [];

  /** The row being re-placed, or null. */
  public Editing: FormPanelInventoryItem | null = null;

  /** What the placement dialog opens on while editing. */
  public EditContext: FormPlacementContext | null = null;
  /** The component the panel being edited renders, for the placement preview. */
  public EditComponentID: string | null = null;
  public EditProposal: FormContributionSpec | null = null;

  /** ID of the row a write is running on, so only its buttons go quiet. */
  public Busy: string | null = null;

  /** ID of the row awaiting a second press to confirm removal. */
  public Confirming: string | null = null;

  public Error = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['Visible'] && this.Visible) this.Refresh();
    else if (changes['Entity'] || changes['Compiled'] || changes['StockGrids'] || changes['FullCustomForm']
      || changes['Variants'] || changes['CurrentFormID']) {
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

  /** Whether there is more than the generated form to choose from. */
  public get HasCustomForms(): boolean {
    return this.Forms.length > 1;
  }

  /** Rebuild the list from the engine's current rows. */
  public Refresh(): void {
    const provider = this.provider;
    const user = provider?.CurrentUser;
    this.CanPublish = this.admin.CanPublish(provider);
    this.rows = this.admin.RowsForEntity(this.Entity);
    this.Items = BuildPanelInventory({
      Contributions: this.rows,
      Compiled: this.Compiled,
      StockGrids: this.StockGrids,
      FullCustomForm: this.FullCustomForm,
      TitleByKey: this.TitleByKey,
      CallerID: user?.ID ?? '',
      CallerRoleIDs: (user?.UserRoles ?? []).map((r) => r.RoleID).filter((id): id is string => !!id),
      CanPublish: this.CanPublish,
      HiddenKeys: this.EntityName ? HiddenPanelKeys(this.EntityName) : [],
    });
    this.Groups = GroupPanelInventory(this.Items);
    this.Forms = BuildFormItems({
      Variants: this.Variants,
      Overrides: this.admin.OverridesForEntity(this.Entity),
      CurrentFormID: this.CurrentFormID,
      CanPublish: this.CanPublish,
    });
    this.cdr.markForCheck();
  }

  private get provider(): IMetadataProvider | null {
    return this.Provider ?? Metadata.Provider ?? null;
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
    if (row.ReplacesSectionKeys.length > 0) spec.replacesSectionKeys = [...row.ReplacesSectionKeys];
    if (row.ReplacesFieldNames.length > 0) spec.replacesFieldNames = [...row.ReplacesFieldNames];
    if (row.InSectionKey) spec.inSectionKey = row.InSectionKey;
    if (row.SectionPosition) spec.sectionPosition = row.SectionPosition;
    if (row.RelatedEntity) spec.relatedEntity = row.RelatedEntity;
    if (row.ContributionKey) spec.contributionKey = row.ContributionKey;
    spec.sortKey = row.SortKey;

    const context: FormPlacementContext = {
      EntityName: this.Entity?.Name ?? '',
      Sections: [],
      Related: this.Related,
      // A panel cannot be asked to stand in for itself.
      // Keyed by contribution key, which is what replacing one writes and what the form draws.
      Existing: this.Items
        .filter((other) => other.Origin === 'contribution' && other.ID !== item.ID)
        .map((other) => this.existingFrom(other.ID, other.Slot, other.Title))
        .filter((other) => other.Key.length > 0),
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
    this.EditComponentID = row.ComponentID || null;
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

  /** A contribution row as the placement dialog lists it: its key, position and order. */
  private existingFrom(rowID: string, slot: string, title: string): FormPlacementContext['Existing'][number] {
    const row = this.rows.find((candidate) => candidate.ID === rowID);
    return {
      Key: this.contributionKeyOf(rowID),
      Slot: slot,
      Title: title,
      SortKey: row?.SortKey ?? 0,
      InSectionKey: row?.InSectionKey ?? null,
      SectionPosition: row?.SectionPosition ?? null,
      FieldNames: row?.ReplacesFieldNames ?? [],
      SectionKeys: row ? (row.ReplacesSectionKeys.length > 0 ? row.ReplacesSectionKeys : [row.ReplacesSectionKey ?? ''].filter(Boolean)) : [],
      ReplacesPlace: !!(row?.ReplacesSectionKey || row?.ReplacesSectionKeys.length || row?.RelatedEntity),
    };
  }

  /** A contribution row's key, or empty when the row has none. */
  private contributionKeyOf(rowID: string): string {
    return (this.rows.find((row) => row.ID === rowID)?.ContributionKey ?? '').trim();
  }

  public CloseEdit(): void {
    this.Editing = null;
    this.EditContext = null;
    this.EditProposal = null;
    this.EditComponentID = null;
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
    if (this.Confirming !== item.ID) return 'Remove';
    return item.Audience === 'yours' ? 'Really remove?' : 'Remove for everyone?';
  }

  public ToggleLabel(item: FormPanelInventoryItem): string {
    return item.CanTurnOn ? 'Turn on' : 'Turn off';
  }

  /** Hide a panel for this user. Nobody else is affected. */
  public OnHide(item: FormPanelInventoryItem): void {
    if (!item.CanHide || !item.HideKey || !this.EntityName) return;
    this.admin.Hide(this.EntityName, item.HideKey);
    this.Refresh();
    this.Changed.emit();
  }

  /** Bring back a panel this user hid. */
  public OnShow(item: FormPanelInventoryItem): void {
    if (!item.CanShow || !item.HideKey || !this.EntityName) return;
    this.admin.Show(this.EntityName, item.HideKey);
    this.Refresh();
    this.Changed.emit();
  }

  /** Switch to another full custom form, or back to the generated form. */
  public OnUseForm(form: FormPanelFormItem): void {
    if (form.IsCurrent) return;
    this.FormChosen.emit(form.ID);
  }

  /** Open the audience chooser on a panel. */
  public OnPublishPanel(item: FormPanelInventoryItem): void {
    if (!item.CanPublish && !item.CanChangeAudience) return;
    const row = this.rows.find((r) => r.ID === item.ID);
    if (!row) return;
    this.openAudience('panel', item.ID, item.Title, row.Scope as FormScope, row.RoleID);
  }

  /** Open the audience chooser on a full custom form. */
  public OnPublishForm(form: FormPanelFormItem): void {
    if (!form.ID || (!form.CanPublish && !form.CanChangeAudience)) return;
    const row = this.admin.OverridesForEntity(this.Entity).find((r) => r.ID === form.ID);
    this.openAudience('form', form.ID, form.Title, (row?.Scope ?? 'User') as FormScope, row?.RoleID ?? null);
  }

  private openAudience(kind: 'panel' | 'form', id: string, title: string, scope: FormScope, roleID: string | null): void {
    this.Publishing = { Kind: kind, ID: id, Title: title, Scope: scope, RoleID: roleID };
    this.Error = '';
    this.cdr.markForCheck();
  }

  /** The roles a holder may publish to. */
  public get RoleOptions(): ReadonlyArray<{ ID: string; Name: string }> {
    return (this.provider?.Roles ?? [])
      .map((role) => ({ ID: role.ID, Name: role.Name }))
      .sort((a, b) => a.Name.localeCompare(b.Name));
  }

  /**
   * What publishing will do, stated before it is done.
   *
   * Changing what other people see should never be a surprise, so the consequence is spelled
   * out in the terms the publisher chose — which people, and on which records.
   */
  public get AudienceConsequence(): string {
    const target = this.Publishing;
    if (!target) return '';
    const what = target.Kind === 'form' ? 'this form' : 'this panel';
    const records = `every ${this.EntityName} record`;
    if (target.Scope === 'User') return `Only you will see ${what}, on ${records}.`;
    if (target.Scope === 'Global') return `Everyone will see ${what} on ${records}.`;
    const role = this.RoleOptions.find((r) => r.ID === target.RoleID)?.Name;
    return role ? `Everyone in ${role} will see ${what} on ${records}.` : 'Choose a role.';
  }

  /** Whether the chosen audience is complete enough to publish. */
  public get CanConfirmAudience(): boolean {
    return !!this.Publishing && (this.Publishing.Scope !== 'Role' || !!this.Publishing.RoleID);
  }

  public async ConfirmAudience(): Promise<void> {
    const target = this.Publishing;
    if (!target || !this.CanConfirmAudience) return;
    this.Publishing = null;
    const audience: FormAudience = { Scope: target.Scope, RoleID: target.RoleID };
    await this.run(target.ID, () => target.Kind === 'form'
      ? this.admin.PublishOverride(target.ID, audience, this.Provider)
      : this.admin.PublishContribution(target.ID, audience, this.Provider));
  }

  public CancelAudience(): void {
    this.Publishing = null;
    this.cdr.markForCheck();
  }

  /** The audience label for a scope, as the chooser's options read it. */
  public AudienceOption(scope: FormScope): string {
    return scope === 'Role' ? 'A role' : DescribeAudience(scope);
  }

  public OnClose(): void {
    this.Confirming = null;
    this.Publishing = null;
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
