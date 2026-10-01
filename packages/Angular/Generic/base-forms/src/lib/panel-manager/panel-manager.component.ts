import {
  Component, Input, Output, EventEmitter, ElementRef,
  ChangeDetectionStrategy, ChangeDetectorRef, inject,
  OnChanges, SimpleChanges,
} from '@angular/core';
import type { MjButtonVariant } from '@memberjunction/ng-ui-components';
import { Metadata, type CompositeKey, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { FormLifecycleStatus, FormScope } from '@memberjunction/core-entities';
import { FormPanelAdminService } from './form-panel-admin.service';
import { FormSlotProbeService } from '../apply/form-slot-probe.service';
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
  KeepEditedRowKey,
  PlacementStateFromContribution,
  type FormPlacementContext,
  type FormPlacementDecision,
  type FormPlacementRelated,
  type FormPlacementState,
} from '../apply/form-placement';
import { DescribeVisibleTo } from '../apply/form-placement-text';

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
  private readonly probe = inject(FormSlotProbeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** What held focus before the drawer opened, and gets it back when the drawer closes. */
  private drawerOpener: HTMLElement | null = null;
  /** What held focus before the placement dialog or the audience chooser opened over the list. */
  private layerOpener: HTMLElement | null = null;

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
    /** What the item is now. Publishing turns it on, which the chooser says first. */
    Status: string;
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
  /** Who sees the panel being edited, for the placement dialog to state. */
  public EditVisibleTo = DescribeVisibleTo('User');
  /** What the panel being edited is now: on, a draft, or off. */
  public EditStatus: FormLifecycleStatus = 'Active';

  /** ID of the row a write is running on, so only its buttons go quiet. */
  public Busy: string | null = null;

  /** ID of the row awaiting a second press to confirm removal. */
  public Confirming: string | null = null;

  public Error = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['Visible'] && this.Visible) {
      this.drawerOpener = this.focusedElement();
      this.Refresh();
      this.focusLater('.mj-pm-close');
    } else if (changes['Visible'] && !changes['Visible'].firstChange) {
      this.restoreFocus('drawer');
    } else if (changes['Entity'] || changes['Compiled'] || changes['StockGrids'] || changes['FullCustomForm']
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
      Rendering: this.admin.RenderingFor(this.Entity, provider),
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
    const row = this.rows.find((candidate) => UUIDsEqual(candidate.ID, item.ID));
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
    if (row.RelatedEntity && row.RelatedJoinField) spec.relatedJoinField = row.RelatedJoinField;
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
    this.EditVisibleTo = DescribeVisibleTo(row.Scope, row.Role);
    this.EditStatus = lifecycleStatus(row.Status);
    this.Error = '';
    this.layerOpener = this.focusedElement();
    this.cdr.markForCheck();
    this.focusLater('.mj-pm-edit');
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
    dialog.State = PlacementStateFromContribution(
      this.EditProposal, dialog.Context, this.EditStatus === 'Active', this.EditStatus === 'Inactive');
  };

  public async OnEditApplied(decision: FormPlacementDecision): Promise<void> {
    const item = this.Editing;
    const existing = this.EditContext?.Existing ?? [];
    this.CloseEdit();
    if (!item) return;
    const row = this.rows.find((candidate) => UUIDsEqual(candidate.ID, item.ID));
    const contribution = row ? KeepEditedRowKey(decision.Contribution, row, existing) : decision.Contribution;
    const status: FormLifecycleStatus = decision.ActivateNow ? 'Active' : decision.KeepOff ? 'Inactive' : 'Pending';
    await this.run(item.ID, () => this.admin.SetPlacement(item.ID, contribution, status, this.Provider));
  }

  /** Clicking the backdrop closes the dialog; clicking the dialog itself does not. */
  public OnEditScrimClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.CloseEdit();
  }

  /** A contribution row as the placement dialog lists it: its key, position and order. */
  private existingFrom(rowID: string, slot: string, title: string): FormPlacementContext['Existing'][number] {
    const row = this.rows.find((candidate) => UUIDsEqual(candidate.ID, rowID));
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
    return (this.rows.find((row) => UUIDsEqual(row.ID, rowID))?.ContributionKey ?? '').trim();
  }

  public CloseEdit(): void {
    const wasOpen = this.Editing !== null;
    this.Editing = null;
    this.EditContext = null;
    this.EditProposal = null;
    this.EditComponentID = null;
    this.cdr.markForCheck();
    if (wasOpen) this.restoreFocus('layer');
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
    if (!UUIDsEqual(this.Confirming, item.ID)) {
      this.Confirming = item.ID;
      this.cdr.markForCheck();
      return;
    }
    this.Confirming = null;
    await this.run(item.ID, () => this.admin.Remove(item.ID, this.Provider));
  }

  /** Quiet until the first press; solid red while it waits for the second. */
  public RemoveVariant(item: FormPanelInventoryItem): MjButtonVariant {
    return UUIDsEqual(this.Confirming, item.ID) ? 'danger' : 'flat';
  }

  public RemoveLabel(item: FormPanelInventoryItem): string {
    if (!UUIDsEqual(this.Confirming, item.ID)) return 'Remove';
    return item.Audience === 'yours' ? 'Really remove?' : 'Remove for everyone?';
  }

  public ToggleLabel(item: FormPanelInventoryItem): string {
    return item.CanTurnOn ? 'Turn on' : 'Turn off';
  }

  /** Hide a panel for this user. Nobody else is affected. */
  public OnHide(item: FormPanelInventoryItem): void {
    if (!item.CanHide || !item.HideKey || !this.EntityName) return;
    this.admin.Hide(this.EntityName, item.HideKey);
    this.afterChange();
  }

  /** Bring back a panel this user hid. */
  public OnShow(item: FormPanelInventoryItem): void {
    if (!item.CanShow || !item.HideKey || !this.EntityName) return;
    this.admin.Show(this.EntityName, item.HideKey);
    this.afterChange();
  }

  /** Switch to another full custom form, or back to the generated form. */
  public OnUseForm(form: FormPanelFormItem): void {
    if (form.IsCurrent) return;
    this.FormChosen.emit(form.ID);
  }

  /** Open the audience chooser on a panel. */
  public OnPublishPanel(item: FormPanelInventoryItem): void {
    if (!item.CanPublish && !item.CanChangeAudience) return;
    const row = this.rows.find((r) => UUIDsEqual(r.ID, item.ID));
    if (!row) return;
    this.openAudience({ Kind: 'panel', ID: item.ID, Title: item.Title, Status: row.Status, Scope: row.Scope as FormScope, RoleID: row.RoleID });
  }

  /** Open the audience chooser on a full custom form. */
  public OnPublishForm(form: FormPanelFormItem): void {
    if (!form.ID || (!form.CanPublish && !form.CanChangeAudience)) return;
    const row = this.admin.OverridesForEntity(this.Entity).find((r) => UUIDsEqual(r.ID, form.ID));
    this.openAudience({
      Kind: 'form', ID: form.ID, Title: form.Title, Status: row?.Status ?? 'Active',
      Scope: (row?.Scope ?? 'User') as FormScope, RoleID: row?.RoleID ?? null,
    });
  }

  private openAudience(target: NonNullable<MjPanelManagerComponent['Publishing']>): void {
    this.Publishing = target;
    this.Error = '';
    this.layerOpener = this.focusedElement();
    this.cdr.markForCheck();
    this.focusLater('.mj-pm-audience');
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
   * out in the terms the publisher chose — which people, and on which records. Publishing turns
   * the item on, so a draft or an item that is off says it will go live.
   */
  public get AudienceConsequence(): string {
    const target = this.Publishing;
    if (!target) return '';
    const role = this.RoleOptions.find((r) => UUIDsEqual(r.ID, target.RoleID))?.Name;
    if (target.Scope === 'Role' && !role) return 'Choose a role.';
    const what = target.Kind === 'form' ? 'this form' : 'this panel';
    const records = `every ${this.EntityName} record`;
    const forWhom = target.Scope === 'User' ? 'you only' : target.Scope === 'Global' ? 'everyone' : `everyone in ${role}`;
    if (target.Status === 'Pending') return `This draft will go live for ${forWhom}, on ${records}.`;
    if (target.Status === 'Inactive') {
      const state = target.Kind === 'form' ? 'This form is set aside' : 'This panel is off';
      return `${state}. It will go live for ${forWhom}, on ${records}.`;
    }
    if (target.Scope === 'User') return `Only you will see ${what}, on ${records}.`;
    if (target.Scope === 'Global') return `Everyone will see ${what} on ${records}.`;
    return `Everyone in ${role} will see ${what} on ${records}.`;
  }

  /** Whether the chosen audience is complete enough to publish. */
  public get CanConfirmAudience(): boolean {
    return !!this.Publishing && (this.Publishing.Scope !== 'Role' || !!this.Publishing.RoleID);
  }

  public async ConfirmAudience(): Promise<void> {
    const target = this.Publishing;
    if (!target || !this.CanConfirmAudience) return;
    this.Publishing = null;
    this.restoreFocus('layer');
    const audience: FormAudience = { Scope: target.Scope, RoleID: target.RoleID };
    await this.run(target.ID, () => target.Kind === 'form'
      ? this.admin.PublishOverride(target.ID, audience, this.Provider)
      : this.admin.PublishContribution(target.ID, audience, this.Provider));
  }

  public CancelAudience(): void {
    this.Publishing = null;
    this.cdr.markForCheck();
    this.restoreFocus('layer');
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
    this.layerOpener = null;
    this.restoreFocus('drawer');
    this.Closed.emit();
  }

  public OnOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.OnClose();
  }

  /**
   * Keys pressed inside the drawer. Escape closes the top layer: the placement dialog, then the
   * audience chooser, then the drawer. Tab and Shift+Tab wrap at the ends of that layer, so focus
   * stays in it. Keys pressed in an overlay that renders outside the drawer, such as the icon
   * picker's grid, do not reach here.
   */
  public OnKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.Editing) this.CloseEdit();
      else if (this.Publishing) this.CancelAudience();
      else this.OnClose();
      return;
    }
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) this.keepFocusInside(event);
  }

  /** Wraps Tab at the first and last stop of the top layer, and brings focus back into it. */
  private keepFocusInside(event: KeyboardEvent): void {
    const layer = this.topLayer();
    if (!layer) return;
    const stops = tabStops(layer);
    const active = this.focusedElement();
    if (stops.length === 0) {
      event.preventDefault();
      layer.focus();
      return;
    }
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!active || !layer.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && (active === first || active === layer)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** The layer that holds focus: the placement dialog, else the audience chooser, else the drawer. */
  private topLayer(): HTMLElement | null {
    const root = this.host.nativeElement;
    return root.querySelector<HTMLElement>('.mj-pm-edit')
      ?? root.querySelector<HTMLElement>('.mj-pm-audience')
      ?? root.querySelector<HTMLElement>('.mj-pm-drawer');
  }

  /** Moves focus to the first stop inside `selector` once the view has drawn it. */
  private focusLater(selector: string): void {
    setTimeout(() => {
      const target = this.host.nativeElement.querySelector<HTMLElement>(selector);
      if (!target) return;
      const stop = target.matches(TAB_STOPS) ? target : tabStops(target)[0];
      (stop ?? target).focus();
    }, 0);
  }

  /** Gives focus back to what held it before the drawer, or one of its layers, opened. */
  private restoreFocus(which: 'drawer' | 'layer'): void {
    const opener = which === 'drawer' ? this.drawerOpener : this.layerOpener;
    if (which === 'drawer') this.drawerOpener = null;
    else this.layerOpener = null;
    if (opener?.isConnected) opener.focus();
  }

  private focusedElement(): HTMLElement | null {
    const active = this.host.nativeElement.ownerDocument?.activeElement;
    return active instanceof HTMLElement ? active : null;
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
        this.afterChange();
      }
    } finally {
      this.Busy = null;
      this.cdr.markForCheck();
    }
  }

  /**
   * After a change to what is on the form: drop the placement dialog's reading of it, rebuild
   * the list, and tell the form to resolve again.
   */
  private afterChange(): void {
    if (this.EntityName) this.probe.Forget(this.EntityName);
    this.Refresh();
    this.Changed.emit();
  }
}

/** Elements Tab stops on inside the drawer. */
const TAB_STOPS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), '
  + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The elements Tab stops on inside `root`, in document order. Leaves out anything inside an
 * `inert` or `hidden` subtree, such as the placement dialog's read-only form preview, which
 * cannot take focus.
 */
function tabStops(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TAB_STOPS)).filter((el) => !el.closest('[inert], [hidden]'));
}

/** A row's status as a lifecycle status. Anything unknown reads as off. */
function lifecycleStatus(status: string): FormLifecycleStatus {
  return status === 'Active' || status === 'Pending' ? status : 'Inactive';
}
