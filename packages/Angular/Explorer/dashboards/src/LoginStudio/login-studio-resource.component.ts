/**
 * @fileoverview Login Studio: design the Explorer sign-in page as data, on the default theme.
 * @module LoginStudio
 */

import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnInit, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { CdkDrag, CdkDropList, CdkDropListGroup, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { takeUntil } from 'rxjs';
import { LogError, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJThemeEntity, ResourceData } from '@memberjunction/core-entities';
import { BaseResourceComponent, ThemeService } from '@memberjunction/ng-shared';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
  MJAlertComponent, MJButtonDirective, MJConfirmService, MJEmptyStateComponent, MJPageBodyComponent, MJPageHeaderComponent,
  MJPageLayoutComponent, MJStatBadgeComponent, MJViewToggleComponent, type MJStatBadgeVariant, type ViewToggleOption,
} from '@memberjunction/ng-ui-components';
import { MJLoginRegionComponent, type MJLoginRegionCommand, type MJLoginRegionDrop } from '@memberjunction/ng-auth-services';
import {
  CloneLoginBlock, DefaultLoginDesign, IsLoginHexColor, IsSafeLoginImageURL, LOGIN_BLOCK_META, LOGIN_BLOCK_TYPES, LOGIN_LIMITS,
  LOGIN_REGION_LABEL, LOGIN_REGIONS, LocateLoginBlock, LoginDesignProblems, LoginDesignTokens, LoginThemeTokens, NewLoginBlock,
  ParseLoginDesign, PublicLoginScreenFromTheme,
  type LoginBackgroundKind, type LoginBlock, type LoginBlockType, type LoginDesign, type LoginRegion, type ThemeLogos, type ThemeSeeds,
} from '@memberjunction/theme-engine';
import { LoginStudioInspectorComponent, type LoginBackgroundField, type LoginEdit, type LoginSurface } from './login-studio-inspector.component';

/** The drop list the palette's tiles come from. Not a region, so a drop from it CREATES a block. */
const PALETTE = 'palette';
/** A run of edits to one field within this window is one undo step, not one per keystroke. */
const COALESCE_MS = 800;
const HISTORY_CAP = 60;
/** The click a browser fires as a drag ends; ignored so a drop keeps its selection. */
const DROP_CLICK_MS = 400;
const SURFACE_LABEL: Record<LoginSurface, string> = { Banner: 'Story panel', Panel: 'Sign-in column' };
const SURFACE_ICON: Record<LoginSurface, string> = { Banner: 'fa-solid fa-image', Panel: 'fa-solid fa-right-to-bracket' };

/**
 * LOGIN STUDIO: an administrator designs the page visitors see before they sign in. The design lives on
 * the default Active theme (`LoginScreenDraft` while edited, `LoginScreen` once published), because a
 * sign-in page belongs to a brand. The preview is drawn by `<mj-login-region>`, the renderer the live
 * login screen uses; every drag also has a click or key (Add, Alt+Arrow, Delete).
 *
 * SAFETY BOUNDARY (agent): the agent reads the design and its problems (GetSignInPageDesign). Save draft,
 * Publish and "Use the stock sign-in page" are human-only: the published page is what every visitor meets
 * before signing in.
 */
@RegisterClass(BaseResourceComponent, 'LoginStudioResource')
@Component({
  standalone: true,
  selector: 'mj-login-studio-resource',
  imports: [
    CdkDropListGroup, CdkDropList, CdkDrag, SharedGenericModule, MJAlertComponent, MJButtonDirective, MJEmptyStateComponent,
    MJPageLayoutComponent, MJPageHeaderComponent, MJPageBodyComponent, MJStatBadgeComponent, MJViewToggleComponent,
    MJLoginRegionComponent, LoginStudioInspectorComponent,
  ],
  templateUrl: './login-studio-resource.component.html',
  styleUrls: ['./login-studio-resource.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginStudioResourceComponent extends BaseResourceComponent implements OnInit, AfterViewInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly confirm = inject(MJConfirmService);
  private readonly themeService = inject(ThemeService);
  private readonly doc = inject(DOCUMENT);

  public readonly Palette = LOGIN_BLOCK_TYPES.map((type) => ({ Type: type, ...LOGIN_BLOCK_META[type] }));
  public readonly PaletteListID = PALETTE;
  public readonly RegionLabel = LOGIN_REGION_LABEL;
  public readonly DeviceOptions: ViewToggleOption[] = [
    { key: 'desktop', label: 'Desktop', icon: 'fa-solid fa-desktop' },
    { key: 'mobile', label: 'Phone', icon: 'fa-solid fa-mobile-screen' },
  ];

  public Loading = true;
  public Saving = false;
  /** A failure to show, or null. */
  public ErrorMessage: string | null = null;
  /** A confirmation to show, or null. */
  public NoticeMessage: string | null = null;

  /** The theme being designed for: the default Active theme, or null when there is none. */
  public Theme: MJThemeEntity | null = null;
  public Design: LoginDesign = DefaultLoginDesign();
  public SelectedID: string | null = null;
  /** The story panel or the sign-in column, when one is selected instead of a block. */
  public SelectedSurface: LoginSurface | null = null;
  public Device: 'desktop' | 'mobile' = 'desktop';
  public Logos: ThemeLogos = {};
  /** The default theme's look, as custom properties on the preview frame. */
  public FrameStyle: Record<string, string> = {};

  /** The problems that stopped the last save; re-checked as you edit, so the alert goes once they are fixed. */
  private problems: string[] = [];
  /** What is stored, as JSON, so "unsaved" and "unpublished" are comparisons rather than flags. */
  private savedDraft: string | null = null;
  private published: string | null = null;
  /** The design as it stands in storage (or the starter, before anything is saved). */
  private baseline = JSON.stringify(this.Design);
  private seeds: ThemeSeeds | null = null;
  private undo: string[] = [];
  private redo: string[] = [];
  private lastEdit: { key: string; at: number } | null = null;
  private droppedAt = 0;
  private reportedEditing = false;

  public override ngOnInit(): void {
    super.ngOnInit();
    // The preview restates the stock gradient per color mode, so it follows a light/dark switch.
    this.themeService.AppliedTheme$.pipe(takeUntil(this.destroy$)).subscribe(() => this.changed());
    void this.Reload();
  }

  public ngAfterViewInit(): void {
    this.registerAgentTools();
  }

  public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Sign-in Page';
  }

  public async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-right-to-bracket';
  }

  /** Unsaved edits: the shell keeps this tab rather than replace it. */
  public override IsEditing(): boolean {
    return this.Unsaved;
  }

  // ── Loading ─────────────────────────────────────────────────────────────────────────────────

  /** Re-read the default theme and its sign-in page. */
  public async Reload(): Promise<void> {
    this.Loading = true;
    this.ErrorMessage = null;
    this.cdr.markForCheck();
    try {
      // The theme GET /auth/login-screen serves: the default Active one, most recently changed first.
      const rv = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<MJThemeEntity>({
        EntityName: 'MJ: Themes',
        ExtraFilter: `IsDefault = 1 AND Status = 'Active'`,
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: 1,
        ResultType: 'entity_object',
      });
      if (rv.Success) {
        this.adoptTheme(rv.Results[0] ?? null);
      } else {
        this.ErrorMessage = rv.ErrorMessage || 'Could not read the default theme.';
      }
    } catch (e) {
      LogError(e);
      this.ErrorMessage = e instanceof Error ? e.message : String(e);
    } finally {
      this.Loading = false;
      this.changed();
      this.NotifyLoadComplete();
    }
  }

  /** Take the stored state from the theme, and edit its draft (else its live page, else the starter). */
  private adoptTheme(theme: MJThemeEntity | null): void {
    this.readStored(theme);
    this.Design = ParseLoginDesign(this.savedDraft ?? this.published) ?? DefaultLoginDesign();
    this.baseline = this.CurrentJson;
    this.undo = [];
    this.redo = [];
    this.SelectedID = null;
    this.SelectedSurface = null;
    this.problems = [];
  }

  /** What is stored on the theme: what is saved, what is live, and its seeds and logos. */
  private readStored(theme: MJThemeEntity | null): void {
    this.Theme = theme;
    // Seeds and logos as the live page gets them, so the preview wears exactly what visitors will see.
    const pub = theme ? PublicLoginScreenFromTheme(theme) : null;
    this.Logos = pub?.Logos ?? {};
    this.seeds = pub?.Seeds ?? null;
    const published = ParseLoginDesign(theme?.LoginScreen);
    const draft = ParseLoginDesign(theme?.LoginScreenDraft);
    this.published = published ? JSON.stringify(published) : null;
    this.savedDraft = draft ? JSON.stringify(draft) : null;
  }

  // ── State ───────────────────────────────────────────────────────────────────────────────────

  public get CurrentJson(): string {
    return JSON.stringify(this.Design);
  }
  /** Edits not yet saved as the draft. */
  public get Unsaved(): boolean {
    return this.CurrentJson !== this.baseline;
  }
  /** The saved draft differs from what visitors see. */
  public get Unpublished(): boolean {
    return this.savedDraft !== null && this.savedDraft !== this.published;
  }
  public get IsLive(): boolean {
    return this.published !== null;
  }
  public get CanUndo(): boolean {
    return this.undo.length > 0;
  }
  public get CanRedo(): boolean {
    return this.redo.length > 0;
  }
  public get Stacked(): boolean {
    return this.Device === 'mobile';
  }

  public get StatusLabel(): string {
    if (this.Unsaved) return 'Unsaved changes';
    if (this.Unpublished) return 'Draft not published';
    if (this.IsLive) return 'Published';
    return 'Stock sign-in page';
  }
  /** The header pill: shown only when there is something to say (live, or work waiting on you). */
  public get StatusVariant(): MJStatBadgeVariant | null {
    if (this.Unsaved || this.Unpublished) return 'warning';
    return this.IsLive ? 'success' : null;
  }

  public get Selected(): LoginBlock | null {
    const hit = this.SelectedID ? LocateLoginBlock(this.Design, this.SelectedID) : null;
    return hit ? this.Design.Regions[hit.Region][hit.Index] : null;
  }
  /** The region of the selected block: a card's colors depend on which side of the page it is on. */
  public get SelectedRegion(): LoginRegion | null {
    return this.SelectedID ? LocateLoginBlock(this.Design, this.SelectedID)?.Region ?? null : null;
  }
  /** The selected surface; a selected block always wins. */
  public get Surface(): LoginSurface | null {
    return this.SelectedID ? null : this.SelectedSurface;
  }
  public get SideTitle(): string {
    if (this.Selected) return LOGIN_BLOCK_META[this.Selected.Type].Label;
    return this.Surface ? SURFACE_LABEL[this.Surface] : 'Page';
  }
  public get SideIcon(): string {
    if (this.Selected) return 'fa-solid fa-sliders';
    return this.Surface ? SURFACE_ICON[this.Surface] : 'fa-solid fa-table-columns';
  }

  /** Closing or reloading the browser with unsaved edits asks first. */
  @HostListener('window:beforeunload', ['$event'])
  public OnBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.Unsaved) e.preventDefault();
  }

  // ── Saving ──────────────────────────────────────────────────────────────────────────────────

  public async SaveDraft(): Promise<void> {
    if (!this.checkBeforeWrite()) return;
    const json = this.CurrentJson;
    if (await this.write((t) => { t.LoginScreenDraft = json; })) {
      this.baseline = json;
      this.done('Draft saved. Visitors still see the published page until you publish.');
    }
  }

  public async Publish(): Promise<void> {
    if (!this.checkBeforeWrite()) return;
    const json = this.CurrentJson;
    if (await this.write((t) => { t.LoginScreenDraft = json; t.LoginScreen = json; })) {
      this.baseline = json;
      // GET /auth/login-screen lets browsers keep its answer for a minute.
      this.done('Published. Visitors see the new sign-in page within a minute.');
    }
  }

  /** Back to what is stored (the saved draft, the live page, or the starter), dropping unsaved edits. */
  public Discard(): void {
    this.pushHistory();
    this.lastEdit = null;
    this.Design = JSON.parse(this.baseline) as LoginDesign;
    this.SelectedID = null;
    this.problems = [];
    this.ErrorMessage = null;
    this.NoticeMessage = null;
    this.changed();
  }

  /** Remove the custom page: visitors get the stock sign-in page again. */
  public async UseStockPage(): Promise<void> {
    const ok = await this.confirm.ConfirmDelete({
      title: 'Use the stock sign-in page?',
      message: 'Visitors will see the stock sign-in page, and this design and its draft are removed.',
      confirmText: 'Remove the custom page',
      cancelText: 'Keep it',
    });
    if (!ok) return;
    if (await this.write((t) => { t.LoginScreenDraft = null; t.LoginScreen = null; })) {
      this.pushHistory();
      this.lastEdit = null;
      this.Design = DefaultLoginDesign();
      this.baseline = this.CurrentJson;
      this.SelectedID = null;
      this.done('Visitors now see the stock sign-in page.');
    }
  }

  public DismissError(): void {
    this.ErrorMessage = null;
    this.cdr.markForCheck();
  }

  public DismissNotice(): void {
    this.NoticeMessage = null;
    this.cdr.markForCheck();
  }

  private done(notice: string): void {
    this.NoticeMessage = notice;
    this.changed();
  }

  /** The editor's own list of problems, in its words. The entity's Validate runs the full check on save. */
  private checkBeforeWrite(): boolean {
    this.NoticeMessage = null;
    this.problems = LoginDesignProblems(this.Design);
    this.ErrorMessage = this.problems.length ? this.problemsMessage() : null;
    this.cdr.markForCheck();
    return this.problems.length === 0;
  }

  private problemsMessage(): string {
    return `Fix these before saving: ${this.problems.join(' ')}`;
  }

  /**
   * Writes the sign-in page columns to a FRESH copy of the theme, so a save never carries back a stale
   * copy of the theme's other columns (another admin may have changed its colors or the default meanwhile).
   */
  private async write(apply: (t: MJThemeEntity) => void): Promise<boolean> {
    if (!this.Theme) return false;
    this.Saving = true;
    this.cdr.markForCheck();
    try {
      const theme = await this.ProviderToUse.GetEntityObject<MJThemeEntity>('MJ: Themes');
      if (!(await theme.Load(this.Theme.ID))) {
        this.ErrorMessage = 'The theme could not be read, so nothing was saved. Try again.';
        return false;
      }
      if (!theme.IsDefault || theme.Status !== 'Active') {
        this.ErrorMessage = `${theme.Name} is no longer the default theme, so nothing was saved. Close and reopen Login Studio to design the current one.`;
        return false;
      }
      apply(theme);
      if (!(await theme.Save())) {
        this.ErrorMessage = theme.LatestResult?.CompleteMessage || 'The save was refused.';
        return false;
      }
      // What is stored now, which another admin may have changed since this page loaded.
      this.readStored(theme);
      return true;
    } catch (e) {
      LogError(e);
      this.ErrorMessage = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      this.Saving = false;
      this.cdr.markForCheck();
    }
  }

  // ── Editing ─────────────────────────────────────────────────────────────────────────────────

  /** Every change goes through here: one undo step (or one per run of typing into a field) and a fresh object for OnPush. */
  private mutate(fn: (d: LoginDesign) => void, coalesceKey?: string): void {
    const now = Date.now();
    const coalesce = !!coalesceKey && this.lastEdit?.key === coalesceKey && now - this.lastEdit.at < COALESCE_MS;
    if (!coalesce) this.pushHistory();
    this.lastEdit = coalesceKey ? { key: coalesceKey, at: now } : null;
    const next = JSON.parse(this.CurrentJson) as LoginDesign;
    fn(next);
    this.Design = next;
    this.changed();
  }

  /** What the inspector asks for, applied as one undoable step. */
  public ApplyEdit(e: LoginEdit): void {
    switch (e.Kind) {
      case 'Block':
        return this.editSelected((b) => { Object.assign(b, { [e.Field]: e.Value }); }, e.Field);
      case 'Link':
        return this.editSelected((b) => { if (b.Type === 'links' && b.Links[e.Index]) b.Links[e.Index][e.Field] = e.Value; }, `link${e.Index}:${e.Field}`);
      case 'AddLink':
        return this.editSelected((b) => { if (b.Type === 'links' && b.Links.length < LOGIN_LIMITS.Links) b.Links.push({ Label: '', Href: 'https://' }); });
      case 'RemoveLink':
        return this.editSelected((b) => { if (b.Type === 'links') b.Links.splice(e.Index, 1); });
      case 'Page':
        return this.mutate((d) => { Object.assign(d, { [e.Field]: e.Value }); });
      case 'Heading':
        return this.mutate((d) => { d.Heading = e.Value.trim() ? e.Value.slice(0, LOGIN_LIMITS.Heading) : null; }, 'heading');
      case 'Background':
        return this.editBackground(e.Field, e.Value);
      case 'Color':
        return this.mutate((d) => {
          const v = typeof e.Value === 'string' ? e.Value.trim() : '';
          if (v) d.Colors[e.Key] = v;
          else delete d.Colors[e.Key];
        }, `color:${e.Key}`);
    }
  }

  private editSelected(fn: (b: LoginBlock) => void, coalesceField?: string): void {
    const id = this.SelectedID;
    if (!id) return;
    this.mutate((d) => {
      const hit = LocateLoginBlock(d, id);
      if (hit) fn(d.Regions[hit.Region][hit.Index]);
    }, coalesceField ? `${id}:${coalesceField}` : undefined);
  }

  private editBackground(field: LoginBackgroundField, value: string | number | null): void {
    this.mutate((d) => {
      const bg = d.Background;
      if (field === 'Kind') {
        bg.Kind = value as LoginBackgroundKind;
        // A half-typed value would block saving from a field this kind no longer shows.
        if (bg.Color && !IsLoginHexColor(bg.Color)) bg.Color = null;
        if (bg.Color2 && !IsLoginHexColor(bg.Color2)) bg.Color2 = null;
        if (bg.Kind !== 'image' && bg.ImageURL && !IsSafeLoginImageURL(bg.ImageURL)) bg.ImageURL = null;
        // Start a color choice from the theme's own brand colors rather than an empty picker.
        const primary = IsLoginHexColor(this.seeds?.primary) ? this.seeds.primary : null;
        const accent = IsLoginHexColor(this.seeds?.accent) ? this.seeds.accent : primary;
        if ((bg.Kind === 'color' || bg.Kind === 'gradient') && !bg.Color) bg.Color = primary;
        if (bg.Kind === 'gradient' && !bg.Color2) bg.Color2 = accent;
      } else if (field === 'Overlay') {
        bg.Overlay = Math.max(0, Math.min(LOGIN_LIMITS.OverlayMax, Math.round(Number(value) || 0)));
      } else {
        bg[field] = typeof value === 'string' && value.trim() ? value.trim() : null;
      }
    }, `bg:${field}`);
  }

  private pushHistory(): void {
    this.undo.push(this.CurrentJson);
    if (this.undo.length > HISTORY_CAP) this.undo.shift();
    this.redo = [];
  }

  public Undo(): void {
    const prev = this.undo.pop();
    if (prev === undefined) return;
    this.redo.push(this.CurrentJson);
    this.restore(prev);
  }

  public Redo(): void {
    const next = this.redo.pop();
    if (next === undefined) return;
    this.undo.push(this.CurrentJson);
    this.restore(next);
  }

  /** A snapshot this editor took itself, so it comes back exactly as it was, half-typed values included. */
  private restore(json: string): void {
    this.Design = JSON.parse(json) as LoginDesign;
    this.lastEdit = null;
    if (this.SelectedID && !LocateLoginBlock(this.Design, this.SelectedID)) this.SelectedID = null;
    this.changed();
  }

  /** Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z while focus is in the studio, except in a field being typed in. */
  @HostListener('keydown', ['$event'])
  public OnKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    if (e.shiftKey) this.Redo();
    else this.Undo();
  }

  // ── Blocks ──────────────────────────────────────────────────────────────────────────────────

  /** A click on the empty preview deselects, except the click that ends a drag. */
  public OnStageClick(): void {
    if (Date.now() - this.droppedAt < DROP_CLICK_MS) return;
    this.Select(null);
  }

  public OnDrop(e: MJLoginRegionDrop): void {
    this.droppedAt = Date.now();
    const to = e.To;
    if (typeof e.Item === 'string') {
      this.AddBlock(e.Item, to, e.CurrentIndex);
      return;
    }
    const from = LOGIN_REGIONS.find((r) => r === e.From);
    if (!from || (from === to && e.PreviousIndex === e.CurrentIndex)) return;
    if (from !== to && this.regionFull(to)) return;
    this.mutate((d) => {
      if (from === to) moveItemInArray(d.Regions[to], e.PreviousIndex, e.CurrentIndex);
      else transferArrayItem(d.Regions[from], d.Regions[to], e.PreviousIndex, e.CurrentIndex);
    });
  }

  /** The palette never accepts a drop: dragging a tile back onto it cancels. */
  public readonly NoEnter = (): boolean => false;

  /**
   * Add a block: dropped at a spot, or (clicked in the palette) just after the selected block, else at
   * the end of the selected surface's first region, else of the story panel.
   */
  public AddBlock(type: LoginBlockType, region?: LoginRegion, index?: number): void {
    const sel = !region && this.SelectedID ? LocateLoginBlock(this.Design, this.SelectedID) : null;
    const where: LoginRegion = region ?? sel?.Region ?? (this.Surface === 'Panel' ? 'PanelTop' : 'Banner');
    if (this.regionFull(where)) return;
    const at = index ?? (sel ? sel.Index + 1 : this.Design.Regions[where].length);
    const block = NewLoginBlock(type);
    this.SelectedID = block.ID;
    this.SelectedSurface = null;
    this.mutate((d) => d.Regions[where].splice(at, 0, block));
  }

  public OnCommand(c: MJLoginRegionCommand): void {
    const hit = LocateLoginBlock(this.Design, c.ID);
    if (!hit) return;
    const { Region: region, Index: index } = hit;
    switch (c.Kind) {
      case 'up':
      case 'down': {
        const to = index + (c.Kind === 'up' ? -1 : 1);
        if (to < 0 || to >= this.Design.Regions[region].length) return;
        this.mutate((d) => moveItemInArray(d.Regions[region], index, to));
        break;
      }
      case 'duplicate': {
        if (this.regionFull(region)) return;
        const copy = CloneLoginBlock(this.Design.Regions[region][index]);
        this.SelectedID = copy.ID;
        this.mutate((d) => d.Regions[region].splice(index + 1, 0, copy));
        break;
      }
      case 'delete':
        this.SelectedID = null;
        this.mutate((d) => d.Regions[region].splice(index, 1));
        break;
    }
  }

  /** True, with a notice, when a region has no room for another block. */
  private regionFull(region: LoginRegion): boolean {
    if (this.Design.Regions[region].length < LOGIN_LIMITS.BlocksPerRegion) return false;
    this.NoticeMessage = `${LOGIN_REGION_LABEL[region]} already has ${LOGIN_LIMITS.BlocksPerRegion} blocks.`;
    this.cdr.markForCheck();
    return true;
  }

  public Select(id: string | null): void {
    this.SelectedID = id;
    this.SelectedSurface = null;
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  /** Select the story panel or the sign-in column (a click on it in the preview, or the inspector's buttons). */
  public SelectSurface(surface: LoginSurface, e?: Event): void {
    if (e) {
      e.stopPropagation();
      if (Date.now() - this.droppedAt < DROP_CLICK_MS) return;
    }
    this.SelectedID = null;
    this.SelectedSurface = surface;
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  public SetDevice(device: string): void {
    this.Device = device === 'mobile' ? 'mobile' : 'desktop';
    this.cdr.markForCheck();
  }

  // ── Preview, agent, shell ───────────────────────────────────────────────────────────────────

  /** After any change: the problems alert, the preview, the agent's view, the shell's edit state, and the view. */
  private changed(): void {
    // A save refused for problems re-checks as you edit (or undo), and its alert goes once they are fixed.
    if (this.problems.length) {
      this.problems = LoginDesignProblems(this.Design);
      this.ErrorMessage = this.problems.length ? this.problemsMessage() : null;
    }
    // The frame wears the DEFAULT theme's look, which is not necessarily the viewer's, as the live login screen does.
    const dark = this.doc.documentElement.getAttribute('data-theme') === 'dark';
    this.FrameStyle = { ...LoginThemeTokens(this.seeds, dark), ...LoginDesignTokens(this.Design) };
    this.publishAgentContext();
    if (this.Unsaved !== this.reportedEditing) {
      this.reportedEditing = this.Unsaved;
      this.NotifyEditModeChanged(this.reportedEditing);
    }
    this.cdr.markForCheck();
  }

  private publishAgentContext(): void {
    this.navigationService.SetAgentContext(this, {
      Surface: 'Login Studio',
      ThemeName: this.Theme?.Name ?? null,
      Status: this.StatusLabel,
      Layout: this.Design.Layout,
      BlockCounts: Object.fromEntries(LOGIN_REGIONS.map((r) => [r, this.Design.Regions[r].length])),
      Selected: this.Selected ? LOGIN_BLOCK_META[this.Selected.Type].Label : this.Surface,
      Problems: LoginDesignProblems(this.Design),
    });
  }

  private registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'GetSignInPageDesign',
        Description: 'Return the sign-in page design being edited (JSON), its status, and anything that would stop it being saved.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => ({
          Success: true,
          Data: { Status: this.StatusLabel, Design: this.Design, Problems: LoginDesignProblems(this.Design) },
        }),
      },
    ]);
  }
}
