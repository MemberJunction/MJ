/**
 * @fileoverview Theme Studio dashboard (org-theming Phase 5) — the polished authoring
 * surface for brand themes, matching theme-studio-mockup-v2: a preview-primary layout
 * with a collapsible slide-panel editor, three switchable preview surfaces (Explorer
 * UI style-guide, Skip reports, agent output), and a fullscreen mode.
 *
 * Preview fidelity (proposal 16.2 / decision #4): every surface is fed by the SAME
 * derivation module as the save path (@memberjunction/theme-engine). The mockup's
 * parallel `--p-*` + JS color math is replaced by the real derived `--mj-*` token map,
 * pushed onto the preview canvas — so hovers, dark re-point, and status colors are the
 * true generator output, not an approximation.
 * @module ThemeStudio
 */

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseDashboard, ThemeService } from '@memberjunction/ng-shared';
import { MJThemeEntity, ResourceData } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ViewToggleOption } from '@memberjunction/ng-ui-components';
import {
  ContrastCheck,
  derive,
  DerivedTheme,
  emitOverlayCss,
  emitScopedCustomCss,
  MJ_DEFAULT_SEEDS,
  ThemeSeeds,
} from '@memberjunction/theme-engine';
import { isBuiltInTheme, MJ_CHROME_SELECTORS } from './theme-studio.constants';
import { buildThemeStudioAgentContext, resolveThemeByIDOrName, ThemeSummaryRow } from './theme-agent-context';

/** A named starting point that leads with identity, not a blank color picker (16.5). */
interface ThemePreset {
  name: string;
  seeds: ThemeSeeds;
}

/** A row in the saved-themes picker. */
interface ThemeListItem {
  id: string;
  name: string;
  isDefault: boolean;
  swatches: string[];
}

type PreviewSurface = 'explorer' | 'artifact';

@RegisterClass(BaseDashboard, 'ThemeStudioDashboard')
@Component({
  standalone: false,
  selector: 'mj-theme-studio-dashboard',
  templateUrl: './theme-studio-dashboard.component.html',
  styleUrls: ['./theme-studio-dashboard.component.css'],
})
export class ThemeStudioDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  @ViewChild('previewCanvas') private previewCanvas?: ElementRef<HTMLElement>;
  @ViewChild('nameInput') private nameInput?: ElementRef<HTMLInputElement>;
  @ViewChild('cssEditor') private cssEditor?: ElementRef<HTMLTextAreaElement>;
  private themesChangedSub?: Subscription;

  /** Custom-CSS autocomplete (MJ chrome selectors + --mj-* tokens). */
  public cssAcOpen = false;
  public cssAcItems: string[] = [];
  public cssAcIndex = 0;

  public readonly presets: ThemePreset[] = [
    { name: 'MJ Default', seeds: { ...MJ_DEFAULT_SEEDS } },
    { name: 'Cool Professional', seeds: { primary: '#4f46e5', accent: '#22d3ee', tertiary: '#0ea5e9', neutralChroma: 0.02, vibrancy: 1, radius: 8, depth: 1 } },
    { name: 'Warm Editorial', seeds: { primary: '#b45309', accent: '#e11d48', tertiary: '#d97706', neutralChroma: 0.05, vibrancy: 1.05, radius: 14, depth: 1 } },
    { name: 'High Contrast', seeds: { primary: '#0f172a', accent: '#2563eb', tertiary: '#0891b2', neutralChroma: 0, vibrancy: 1.2, radius: 4, depth: 1 } },
    { name: 'Muted Enterprise', seeds: { primary: '#0f766e', accent: '#64748b', tertiary: '#0e7490', neutralChroma: 0.03, vibrancy: 0.8, radius: 8, depth: 0.8 } },
  ];

  public readonly fontOptions: { label: string; value: string }[] = [
    { label: 'Inter (default)', value: MJ_DEFAULT_SEEDS.fontFamily! },
    { label: 'Georgia (serif)', value: "'Georgia', 'Times New Roman', serif" },
    { label: 'Trebuchet', value: "'Trebuchet MS', Verdana, sans-serif" },
    { label: 'System UI', value: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  ];

  /** Height %s + labels for the demo bar chart. */
  public readonly barHeights = [64, 88, 72, 96, 80, 100];
  public readonly barValues = ['$0.5M', '$0.9M', '$0.7M', '$1.1M', '$0.8M', '$1.2M'];
  public readonly barCats = ['Prospect', 'Qualify', 'Propose', 'Negotiate', 'Commit', 'Won'];

  public seeds: ThemeSeeds = { ...MJ_DEFAULT_SEEDS };
  public derived: DerivedTheme = derive(this.seeds);

  public themes: ThemeListItem[] = [];
  public currentThemeId: string | null = null;
  public currentName = 'New Theme';
  public previewMode: 'light' | 'dark' = 'light';
  public activeView: PreviewSurface = 'explorer';
  public panelCollapsed = false;
  public fullscreen = false;
  public editingName = false;
  private nameBackup = '';
  public themePickerOpen = false;
  public saving = false;

  /** Toolbar segmented controls (mj-view-toggle options). */
  public readonly surfaceOptions: ViewToggleOption[] = [
    { key: 'explorer', label: 'Explorer UI' },
    { key: 'artifact', label: 'Artifact' },
  ];
  public readonly modeOptions: ViewToggleOption[] = [
    { key: 'light', label: 'Light', icon: 'fa-solid fa-sun' },
    { key: 'dark', label: 'Dark', icon: 'fa-solid fa-moon' },
  ];

  /** Preview-only branding/density knobs (not part of the seed contract yet). */
  public footerNotice = 'Confidential';
  public baseFontSize = 14;
  public density = 16;

  /** Advanced customization (persisted): per-token overrides + raw scoped CSS. */
  public advancedOpen = false;
  public overrideRows: { key: string; value: string }[] = [];
  public customCss = '';
  public showGeneratedCss = false;

  constructor(private cdRef: ChangeDetectorRef, private themeService: ThemeService) {
    super();
  }

  ngAfterViewInit(): void {
    this.applyPreviewVars();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Theme Studio';
  }

  protected initDashboard(): void {
    this.seeds = { ...MJ_DEFAULT_SEEDS };
    this.recompute();
    // Keep the switcher list fresh when themes change in the Manage Themes tab.
    this.themesChangedSub = this.themeService.ThemesChanged$.subscribe(() => {
      this.loadData();
    });
    this.registerAgentTools();
  }

  override ngOnDestroy(): void {
    this.themesChangedSub?.unsubscribe();
    clearTimeout(this.agentContextTimer);
    super.ngOnDestroy();
  }

  /** Toggle the theme switcher; refresh the list on open so deletes/renames made in the
   *  Manage Themes tab are reflected without a hard refresh. */
  public async toggleThemePicker(): Promise<void> {
    this.themePickerOpen = !this.themePickerOpen;
    if (this.themePickerOpen) {
      await this.loadData();
    }
  }

  protected async loadData(): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<MJThemeEntity>({
        EntityName: 'MJ: Themes',
        OrderBy: 'Name',
        ResultType: 'entity_object',
      });
      this.themes = (result.Success ? result.Results : []).map((t) => ({
        id: t.ID,
        name: t.Name,
        isDefault: t.IsDefault,
        swatches: this.swatchesFor(t.Seeds),
      }));
    } catch {
      this.themes = [];
    }
    this.publishAgentContext();
    this.cdRef.detectChanges();
  }

  private swatchesFor(seedsJson: string): string[] {
    try {
      const s = JSON.parse(seedsJson) as ThemeSeeds;
      return [s.primary, s.accent ?? s.primary, s.tertiary ?? s.accent ?? s.primary];
    } catch {
      return ['#0076b6', '#38a9d9', '#8b5cf6'];
    }
  }

  // ========================================
  // Derivation — the single source feeding every preview surface + validation + save
  // ========================================

  public recompute(): void {
    this.derived = derive(this.seeds);
    this.applyPreviewVars();
  }

  public get contrastChecks(): ContrastCheck[] {
    return this.derived.contrast[this.previewMode];
  }

  /** The text-on-primary check for the previewed mode (drives the Brand card chip). */
  public get onPrimaryCheck(): ContrastCheck | undefined {
    return this.contrastChecks.find((c) => c.name === 'text-on-primary');
  }

  /** All 10 derived categorical colors (--mj-viz-1..10) — the full chart-palette contract. */
  public get vizColors(): string[] {
    return Array.from({ length: 10 }, (_, i) => this.derived.overlayVars[`--mj-viz-${i + 1}`]).filter(Boolean);
  }

  public get vizOverridden(): boolean {
    return !!this.seeds.vizPalette && this.seeds.vizPalette.length > 0;
  }

  /** Dark-mode primary the theme derives (ramp step), shown as a note on the Brand card. */
  public get darkPrimary(): string {
    return this.derived.tokens.dark['--mj-brand-primary'];
  }

  /** Secondary (deep brand) derived for light mode. */
  public get secondaryColor(): string {
    return this.derived.tokens.light['--mj-brand-secondary'];
  }

  public editViz(index: number, event: Event): void {
    const color = (event.target as HTMLInputElement).value;
    const arr = [...(this.seeds.vizPalette ?? this.vizColors)];
    arr[index] = color;
    this.seeds.vizPalette = arr;
    this.recompute();
    this.publishAgentContextDebounced();
  }

  public resetViz(): void {
    delete this.seeds.vizPalette;
    this.recompute();
  }

  /**
   * Push the derived token map onto the preview canvas as scoped CSS vars — the
   * fidelity guarantee. Also sets preview-only density/size vars and the mode attr so
   * any [data-theme="dark"] rules inside the canvas resolve.
   */
  private applyPreviewVars(): void {
    const el = this.previewCanvas?.nativeElement;
    if (!el) return;
    // Advanced token overrides win, layered last — mirrors emitOverlayCss's merge order.
    const vars = { ...this.derived.overlayVars, ...this.derived.tokens[this.previewMode], ...this.overridesMap() };
    for (const [k, v] of Object.entries(vars)) {
      el.style.setProperty(k, v);
    }
    el.style.setProperty('--ts-space', `${this.density}px`);
    el.style.setProperty('--ts-fs', `${this.baseFontSize}px`);
    el.setAttribute('data-theme', this.previewMode);
    this.applyPreviewCustomCss(el);
  }

  /** Inject the raw custom CSS into the preview, scoped to the canvas so it only affects
   *  the preview (approximate — the mock's markup differs from live chrome selectors). */
  private applyPreviewCustomCss(el: HTMLElement): void {
    const STYLE_ID = 'ts-preview-custom';
    let style = el.querySelector<HTMLStyleElement>(`style#${STYLE_ID}`);
    const css = this.customCss.trim();
    if (!css) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      el.appendChild(style);
    }
    el.setAttribute('data-ts-preview', '1');
    // Same hoist-then-scope as the live overlay so @keyframes/@font-face work in preview too.
    style.textContent = emitScopedCustomCss('[data-ts-preview="1"]', css);
  }

  // ========================================
  // Advanced customization (overrides + raw CSS)
  // ========================================

  /** Build the override token map from the editable rows (blank keys dropped). */
  private overridesMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const row of this.overrideRows) {
      const key = row.key.trim();
      if (key) map[key] = row.value;
    }
    return map;
  }

  /** Parse a persisted Overrides JSON map into editable rows. */
  private overrideRowsFrom(json: string | null): { key: string; value: string }[] {
    if (!json) return [];
    try {
      const obj = JSON.parse(json) as Record<string, string>;
      return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
    } catch {
      return [];
    }
  }

  /** Token names offered for autocomplete in the override editor. */
  public get overridableTokens(): string[] {
    const names = new Set([...Object.keys(this.derived.overlayVars), ...Object.keys(this.derived.tokens.light)]);
    return Array.from(names).sort();
  }

  public addOverrideRow(): void {
    this.overrideRows = [...this.overrideRows, { key: '', value: '' }];
  }

  public removeOverrideRow(index: number): void {
    this.overrideRows = this.overrideRows.filter((_, i) => i !== index);
    this.onAdvancedChanged();
  }

  /** Overrides/custom CSS don't change derivation — just re-apply the preview layer. */
  public onAdvancedChanged(): void {
    this.applyPreviewVars();
  }

  /** The actual overlay CSS this theme produces (tokens + advanced layer) — read-only view. */
  public get generatedCss(): string {
    return emitOverlayCss(this.currentThemeId ?? 'preview', this.derived, {
      overrides: this.overridesMap(),
      customCss: this.customCss,
    });
  }

  public async copyGeneratedCss(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.generatedCss);
      this.notify('Generated CSS copied to clipboard.');
    } catch {
      this.notify('Copy failed — select the text and copy manually.');
    }
  }

  // ---- Custom-CSS autocomplete (MJ chrome selectors + --mj-* tokens) ----

  /** All completions offered: real chrome selectors + the theme's derived token names. */
  private get cssSuggestions(): string[] {
    return [...MJ_CHROME_SELECTORS, ...this.overridableTokens];
  }

  /** The identifier-ish word straddling the caret (selectors, classes, --mj-* tokens). */
  private currentCssWord(): { word: string; start: number; end: number } {
    const el = this.cssEditor?.nativeElement;
    const pos = el?.selectionStart ?? this.customCss.length;
    let start = pos;
    while (start > 0 && /[-\w.]/.test(this.customCss[start - 1])) start--;
    return { word: this.customCss.slice(start, pos), start, end: pos };
  }

  /** Text actually changed: update the live preview and refresh suggestions. Driving the
   *  refresh off model changes (not keyup) keeps arrow-key navigation from resetting it. */
  public onCustomCssChanged(): void {
    this.onAdvancedChanged();
    this.refreshCssAutocomplete();
  }

  /** Recompute suggestions for the word at the caret (called on type/click). */
  public refreshCssAutocomplete(): void {
    const { word } = this.currentCssWord();
    if (word.length < 2) {
      this.cssAcOpen = false;
      return;
    }
    const lower = word.toLowerCase();
    const matches = this.cssSuggestions.filter((s) => s.toLowerCase().includes(lower));
    // Prefix matches first, then substring matches — both alphabetical within group.
    matches.sort((a, b) => {
      const ap = a.toLowerCase().startsWith(lower) ? 0 : 1;
      const bp = b.toLowerCase().startsWith(lower) ? 0 : 1;
      return ap - bp || a.localeCompare(b);
    });
    this.cssAcItems = matches.slice(0, 8);
    this.cssAcIndex = 0;
    this.cssAcOpen = this.cssAcItems.length > 0;
  }

  public onCssKeydown(event: KeyboardEvent): void {
    if (!this.cssAcOpen) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.cssAcIndex = (this.cssAcIndex + 1) % this.cssAcItems.length;
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.cssAcIndex = (this.cssAcIndex - 1 + this.cssAcItems.length) % this.cssAcItems.length;
        break;
      case 'Enter':
      case 'Tab':
        event.preventDefault();
        this.applyCssSuggestion(this.cssAcItems[this.cssAcIndex]);
        break;
      case 'Escape':
        this.cssAcOpen = false;
        break;
    }
  }

  /** Replace the word at the caret with the chosen suggestion, then restore focus. */
  public applyCssSuggestion(item: string): void {
    const el = this.cssEditor?.nativeElement;
    if (!el) return;
    const { start, end } = this.currentCssWord();
    this.customCss = this.customCss.slice(0, start) + item + this.customCss.slice(end);
    this.cssAcOpen = false;
    const caret = start + item.length;
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
      this.onAdvancedChanged();
    });
  }

  /** Close the dropdown on blur, deferred so a suggestion click lands first. */
  public onCssBlur(): void {
    setTimeout(() => {
      this.cssAcOpen = false;
      this.cdRef.detectChanges();
    }, 150);
  }

  // ========================================
  // View / panel / fullscreen chrome
  // ========================================

  public setView(view: PreviewSurface): void {
    this.activeView = view;
  }

  public setPreviewMode(mode: 'light' | 'dark'): void {
    this.previewMode = mode;
    this.applyPreviewVars();
    this.publishAgentContextDebounced();
  }

  /** mj-view-toggle (KeyChange) adapter for the light/dark segment. */
  public onModeToggle(key: string): void {
    this.setPreviewMode(key === 'dark' ? 'dark' : 'light');
  }

  /** mj-view-toggle (KeyChange) adapter for the preview-surface chips. */
  public onSurfaceToggle(key: string): void {
    this.setView(key === 'artifact' ? 'artifact' : 'explorer');
    this.publishAgentContextDebounced();
  }

  public togglePanel(): void {
    this.panelCollapsed = !this.panelCollapsed;
    this.publishAgentContextDebounced();
  }

  /** Prefer the native Fullscreen API — it promotes the canvas to the browser's top
   *  layer, so it fills the real screen regardless of any transformed/`contain`ed
   *  ancestor, and browser Esc reliably exits. Falls back to CSS-fixed overlay if the
   *  API is unavailable or rejects. */
  public async toggleFullscreen(on: boolean): Promise<void> {
    try {
      if (on) {
        const el = this.previewCanvas?.nativeElement;
        if (el?.requestFullscreen) {
          await el.requestFullscreen();
          return; // state syncs via fullscreenchange
        }
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
    } catch {
      /* fall through to CSS fallback */
    }
    this.fullscreen = on;
    this.cdRef.detectChanges();
  }

  @HostListener('document:fullscreenchange')
  public onFullscreenChange(): void {
    this.fullscreen = !!document.fullscreenElement;
    this.cdRef.detectChanges();
  }

  @HostListener('document:keydown.escape')
  public onEscape(): void {
    // Only needed for the CSS fallback; native fullscreen handles Esc itself.
    if (this.fullscreen && !document.fullscreenElement) {
      this.fullscreen = false;
      this.cdRef.detectChanges();
    }
  }

  public onDensityChanged(): void {
    this.applyPreviewVars();
  }

  public onBaseSizeChanged(): void {
    this.applyPreviewVars();
  }

  // ========================================
  // Editing
  // ========================================

  public applyPreset(preset: ThemePreset): void {
    this.seeds = { ...preset.seeds };
    if (!this.currentThemeId) {
      this.currentName = this.uniqueName(preset.name);
    }
    this.recompute();
  }

  private uniqueName(base: string): string {
    const taken = new Set(this.themes.map((t) => t.name.trim().toLowerCase()));
    if (!taken.has(base.trim().toLowerCase())) return base;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base} ${Date.now()}`;
  }

  public onSeedsChanged(): void {
    this.recompute();
    this.publishAgentContextDebounced();
  }

  public async selectTheme(item: ThemeListItem): Promise<void> {
    this.themePickerOpen = false;
    const md = this.ProviderToUse;
    const entity = await md.GetEntityObject<MJThemeEntity>('MJ: Themes');
    if (!(await entity.Load(item.id))) {
      this.cdRef.detectChanges();
      return;
    }
    this.currentThemeId = entity.ID;
    this.currentName = entity.Name;
    try {
      this.seeds = { ...MJ_DEFAULT_SEEDS, ...(JSON.parse(entity.Seeds) as ThemeSeeds) };
    } catch {
      this.seeds = { ...MJ_DEFAULT_SEEDS };
    }
    this.overrideRows = this.overrideRowsFrom(entity.Overrides);
    this.customCss = entity.CustomCSS ?? '';
    this.recompute();
    this.publishAgentContext();
    // Async continuation under the OnPush resource wrapper: refresh the header pill,
    // editor inputs, and preview now that the loaded theme is in place.
    this.cdRef.detectChanges();
  }

  public get currentIsDefault(): boolean {
    const id = this.currentThemeId;
    return id ? this.themes.find((t) => UUIDsEqual(t.id, id))?.isDefault ?? false : false;
  }

  /** Whether a picker row is the currently-loaded theme (case-insensitive GUID compare). */
  public isCurrentTheme(id: string): boolean {
    return !!this.currentThemeId && UUIDsEqual(id, this.currentThemeId);
  }

  /** The protected built-in theme is read-only — editing/saving over it is blocked. */
  public get isBuiltInSelected(): boolean {
    return isBuiltInTheme(this.currentThemeId);
  }

  /** Fork the current seeds into a new, editable theme (used to customize the built-in). */
  public saveAsCopy(): void {
    this.currentThemeId = null;
    this.currentName = this.uniqueName(`${this.currentName} Copy`);
    this.notify(`Editing a copy — "${this.currentName}". Save to create it.`);
  }

  /** Inline-rename the current theme in the header. For a saved theme the new name is
   *  persisted immediately on commit; for an unsaved draft it persists on Save. */
  public startRename(): void {
    if (this.isBuiltInSelected) {
      this.notify('The built-in theme is read-only — use "Save as copy" to rename it.');
      return;
    }
    this.nameBackup = this.currentName;
    this.editingName = true;
    setTimeout(() => this.nameInput?.nativeElement.select());
  }

  public async commitRename(): Promise<void> {
    if (!this.editingName) return;
    this.editingName = false;
    this.currentName = this.currentName.trim() || this.nameBackup || 'Untitled theme';
    // No change, unsaved draft, or built-in → nothing to persist now.
    if (this.currentName === this.nameBackup || !this.currentThemeId || this.isBuiltInSelected) return;
    try {
      const md = this.ProviderToUse;
      const entity = await md.GetEntityObject<MJThemeEntity>('MJ: Themes');
      if (!(await entity.Load(this.currentThemeId))) return;
      entity.Name = this.currentName;
      if (await entity.Save()) {
        await this.loadData();
        this.themeService.NotifyThemesChanged();
        this.notify(`Renamed to "${this.currentName}".`);
      } else {
        const msg = entity.LatestResult?.CompleteMessage ?? 'unknown error';
        this.currentName = this.nameBackup;
        this.notify(/UQ_Theme_Name|UNIQUE KEY/i.test(msg) ? `A theme named "${entity.Name}" already exists — choose a different name.` : `Rename failed: ${msg}`, 'error');
      }
    } catch (e) {
      this.currentName = this.nameBackup;
      this.notify(`Rename failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      this.cdRef.detectChanges();
    }
  }

  public cancelRename(): void {
    this.currentName = this.nameBackup;
    this.editingName = false;
  }

  public newTheme(): void {
    this.themePickerOpen = false;
    this.currentThemeId = null;
    this.currentName = 'New Theme';
    this.seeds = { ...MJ_DEFAULT_SEEDS };
    this.overrideRows = [];
    this.customCss = '';
    this.recompute();
  }

  public discard(): void {
    const id = this.currentThemeId;
    const current = id ? this.themes.find((t) => UUIDsEqual(t.id, id)) : undefined;
    if (current) {
      this.selectTheme(current);
    } else {
      this.newTheme();
    }
  }

  // ========================================
  // Persistence
  // ========================================

  public async save(): Promise<void> {
    if (this.isBuiltInSelected) {
      this.notify('The built-in theme is read-only — use "Save as copy" to customize it.');
      return;
    }
    const name = this.currentName.trim();
    if (!name) {
      this.notify('Give the theme a name before saving.');
      return;
    }
    // If this isn't already a loaded theme but the name matches an existing one, treat
    // Save as an UPDATE to that theme (names are unique, so a match is unambiguous) —
    // rather than blocking and forcing the user to make a new theme.
    if (!this.currentThemeId) {
      const existing = this.themes.find((t) => t.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        if (isBuiltInTheme(existing.id)) {
          this.notify('The built-in theme is read-only — rename it to save a copy.');
          return;
        }
        this.currentThemeId = existing.id;
      }
    }
    this.saving = true;
    try {
      const md = this.ProviderToUse;
      const entity = await md.GetEntityObject<MJThemeEntity>('MJ: Themes');
      if (this.currentThemeId) {
        if (!(await entity.Load(this.currentThemeId))) {
          this.notify('Could not load the theme to update — it may have been deleted. Refresh and try again.', 'error');
          return;
        }
      } else {
        entity.NewRecord();
        entity.Status = 'Active';
      }
      entity.Name = name;
      entity.Seeds = JSON.stringify(this.seeds);
      const overrides = this.overridesMap();
      entity.Overrides = Object.keys(overrides).length ? JSON.stringify(overrides) : null;
      entity.CustomCSS = this.customCss.trim() || null;
      if (await entity.Save()) {
        const wasNew = !this.currentThemeId;
        this.currentThemeId = entity.ID;
        if (UUIDsEqual(this.themeService.BrandOverlayId, entity.ID) || (!wasNew && entity.IsDefault)) {
          await this.applyLive();
        }
        await this.loadData();
        this.themeService.NotifyThemesChanged();
        this.notify(`Saved "${entity.Name}".`);
      } else {
        this.notify(`Save failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.notify(/UQ_Theme_Name|UNIQUE KEY/i.test(msg) ? `A theme named "${name}" already exists — choose a different name.` : `Save failed: ${msg}`, 'error');
    } finally {
      this.saving = false;
      this.cdRef.detectChanges();
    }
  }

  public async setAsDefault(): Promise<void> {
    if (this.currentThemeId) await this.setDefaultById(this.currentThemeId);
  }

  /**
   * Make theme `id` the single org default and apply it live. Clears any other
   * default first (app-layer enforcement — there is no DB unique index), then applies
   * the persisted seeds via ThemeService so the running app re-themes immediately.
   */
  private async setDefaultById(id: string): Promise<void> {
    try {
      const md = this.ProviderToUse;
      const rv = new RunView();
      const others = await rv.RunView<MJThemeEntity>({
        EntityName: 'MJ: Themes',
        ExtraFilter: `IsDefault = 1 AND ID <> '${id}'`,
        ResultType: 'entity_object',
      });
      if (others.Success) {
        for (const other of others.Results) {
          other.IsDefault = false;
          if (!(await other.Save())) {
            this.notify(`Could not clear the previous default "${other.Name}": ${other.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error');
            return;
          }
        }
      }
      const entity = await md.GetEntityObject<MJThemeEntity>('MJ: Themes');
      if (!(await entity.Load(id))) return;
      entity.IsDefault = true;
      if (!(await entity.Save())) {
        this.notify(`Could not set default: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error');
        return;
      }
      let seeds: ThemeSeeds;
      try {
        seeds = { ...MJ_DEFAULT_SEEDS, ...(JSON.parse(entity.Seeds) as ThemeSeeds) };
      } catch {
        seeds = { ...MJ_DEFAULT_SEEDS };
      }
      this.themeService.RegisterBrandTheme({ id: entity.ID, name: entity.Name, seeds, overrides: entity.Overrides, customCss: entity.CustomCSS });
      await this.themeService.ApplyBrandOverlay(entity.ID);
      await this.loadData();
      this.themeService.NotifyThemesChanged();
      this.notify(`"${entity.Name}" is now the default and is applied.`);
    } catch (e) {
      this.notify(`Could not set default: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      this.cdRef.detectChanges();
    }
  }

  /** Apply the current (edited) theme to the live app via ThemeService (used on save). */
  private async applyLive(): Promise<void> {
    if (!this.currentThemeId) return;
    this.themeService.RegisterBrandTheme({
      id: this.currentThemeId,
      name: this.currentName,
      seeds: this.seeds,
      overrides: this.overridesMap(),
      customCss: this.customCss,
    });
    await this.themeService.ApplyBrandOverlay(this.currentThemeId);
  }

  /**
   * Apply this theme to the current user's workspace now and remember it as their
   * choice (persists across sessions). Distinct from "Set as org default", which is
   * the organization-wide fallback for everyone.
   */
  public async applyToMe(): Promise<void> {
    if (!this.currentThemeId) return;
    await this.applyLive();
    await this.themeService.SetSelectedBrandTheme(this.currentThemeId);
    this.notify(`Applied "${this.currentName}" to your workspace.`);
    this.cdRef.detectChanges();
  }

  private notify(message: string, style: 'success' | 'error' | 'info' = 'success'): void {
    MJNotificationService.Instance.CreateSimpleNotification(message, style, 2500);
  }

  // ---------------------------------------------------------------
  // Agent context + tools (read / preview-state / user-scoped only —
  // see the SAFETY BOUNDARY in theme-agent-context.ts)
  // ---------------------------------------------------------------

  private agentContextTimer: ReturnType<typeof setTimeout> | undefined;

  private summaryRows(): ThemeSummaryRow[] {
    return this.themes.map((t) => ({
      ID: t.id,
      Name: t.name,
      Status: 'Active',
      IsDefault: t.isDefault,
      BuiltIn: isBuiltInTheme(t.id),
    }));
  }

  private publishAgentContext(): void {
    this.navigationService.SetAgentContext(
      this,
      buildThemeStudioAgentContext({
        Themes: this.summaryRows(),
        CurrentThemeID: this.currentThemeId,
        CurrentThemeName: this.currentName,
        IsBuiltInSelected: this.isBuiltInSelected,
        PreviewMode: this.previewMode,
        PreviewSurface: this.activeView,
        EditorPanelOpen: !this.panelCollapsed,
        Seeds: this.seeds,
        OverrideTokenCount: Object.keys(this.overridesMap()).length,
        HasCustomCss: this.customCss.trim().length > 0,
        Contrast: this.derived.contrast,
      })
    );
  }

  /** Coalesce slider-drag bursts into one context publish. */
  private publishAgentContextDebounced(): void {
    clearTimeout(this.agentContextTimer);
    this.agentContextTimer = setTimeout(() => this.publishAgentContext(), 300);
  }

  private registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'ListThemes',
        Description: 'Reload and return the saved brand themes available in the studio.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          await this.loadData();
          return { Success: true, Data: { ThemeNames: this.themes.map((t) => t.name).slice(0, 25) } };
        },
      },
      {
        Name: 'SelectTheme',
        Description: 'Load a saved theme into the editor, referenced by ID or name (partial, case-insensitive match accepted).',
        ParameterSchema: {
          type: 'object',
          properties: { theme: { type: 'string', description: 'The theme ID or name.' } },
          required: ['theme'],
        },
        Handler: async (params) => {
          const resolved = resolveThemeByIDOrName(this.summaryRows(), params['theme']);
          if (!resolved.ok) {
            return { Success: false, ErrorMessage: resolved.error };
          }
          const item = this.themes.find((t) => UUIDsEqual(t.id, resolved.value.ID));
          if (!item) {
            return { Success: false, ErrorMessage: 'Theme list changed — run ListThemes and retry.' };
          }
          await this.selectTheme(item);
          return { Success: true, Data: { CurrentThemeName: this.currentName } };
        },
      },
      {
        Name: 'NewTheme',
        Description: 'Start a fresh, unsaved theme draft from the MJ default seeds (nothing persists until the user saves).',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.newTheme();
          this.cdRef.detectChanges();
          return { Success: true, Data: { CurrentThemeName: this.currentName } };
        },
      },
      {
        Name: 'ApplyPreset',
        Description: `Apply a named starting preset to the in-memory draft. Available presets: ${this.presets.map((p) => p.name).join(', ')}.`,
        ParameterSchema: {
          type: 'object',
          properties: { preset: { type: 'string', description: 'The preset name (partial match accepted).' } },
          required: ['preset'],
        },
        Handler: async (params) => {
          const ref = typeof params['preset'] === 'string' ? params['preset'].trim().toLowerCase() : '';
          const preset = this.presets.find((p) => p.name.toLowerCase() === ref)
            ?? this.presets.find((p) => p.name.toLowerCase().includes(ref));
          if (!ref || !preset) {
            return { Success: false, ErrorMessage: `Unknown preset. Available: ${this.presets.map((p) => p.name).join(', ')}.` };
          }
          this.applyPreset(preset);
          this.publishAgentContext();
          this.cdRef.detectChanges();
          return { Success: true, Data: { Preset: preset.name } };
        },
      },
      {
        Name: 'SetSeeds',
        Description: 'Update one or more brand seeds on the IN-MEMORY draft (preview only — the user saves from the UI). Colors are hex like #0076b6.',
        ParameterSchema: {
          type: 'object',
          properties: {
            primary: { type: 'string', description: 'Primary brand hex color.' },
            accent: { type: 'string', description: 'Accent hex color.' },
            tertiary: { type: 'string', description: 'Tertiary hex color.' },
            neutralChroma: { type: 'number', description: 'Brand tint in grays, 0–0.08.' },
            vibrancy: { type: 'number', description: 'Ramp saturation multiplier, 0.5–1.4.' },
            radius: { type: 'number', description: 'Base corner radius in px, 0–20.' },
            depth: { type: 'number', description: 'Brand shadow strength, 0–1.' },
          },
        },
        Handler: async (params) => this.handleSetSeeds(params),
      },
      {
        Name: 'SetPreviewMode',
        Description: "Switch the preview between 'light' and 'dark'.",
        ParameterSchema: {
          type: 'object',
          properties: { mode: { type: 'string', description: "'light' | 'dark'" } },
          required: ['mode'],
        },
        Handler: async (params) => {
          const mode = params['mode'];
          if (mode !== 'light' && mode !== 'dark') {
            return { Success: false, ErrorMessage: "mode must be 'light' or 'dark'." };
          }
          this.setPreviewMode(mode);
          this.cdRef.detectChanges();
          return { Success: true, Data: { PreviewMode: this.previewMode } };
        },
      },
      {
        Name: 'SetPreviewSurface',
        Description: "Switch the preview surface between 'explorer' (chrome style guide) and 'artifact' (generated report).",
        ParameterSchema: {
          type: 'object',
          properties: { surface: { type: 'string', description: "'explorer' | 'artifact'" } },
          required: ['surface'],
        },
        Handler: async (params) => {
          const surface = params['surface'];
          if (surface !== 'explorer' && surface !== 'artifact') {
            return { Success: false, ErrorMessage: "surface must be 'explorer' or 'artifact'." };
          }
          this.setView(surface);
          this.cdRef.detectChanges();
          return { Success: true, Data: { PreviewSurface: this.activeView } };
        },
      },
      {
        Name: 'ApplyToMe',
        Description: "Apply the currently-loaded SAVED theme to the CURRENT USER's workspace (a per-user preference — not the org default). Fails on an unsaved draft.",
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          if (!this.currentThemeId) {
            return { Success: false, ErrorMessage: 'The draft is unsaved — the user must save it first.' };
          }
          await this.applyToMe();
          return { Success: true, Data: { AppliedThemeName: this.currentName } };
        },
      },
    ]);
  }

  /** Validate + apply a partial seed update from the agent (clamped to the UI ranges). */
  private handleSetSeeds(params: Record<string, unknown>): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    const HEX = /^#[0-9a-fA-F]{6}$/;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const next: ThemeSeeds = { ...this.seeds };
    let changed = 0;
    for (const key of ['primary', 'accent', 'tertiary'] as const) {
      const v = params[key];
      if (v !== undefined) {
        if (typeof v !== 'string' || !HEX.test(v.trim())) {
          return { Success: false, ErrorMessage: `${key} must be a 6-digit hex color like #0076b6.` };
        }
        next[key] = v.trim().toLowerCase();
        changed++;
      }
    }
    const numeric: Array<{ key: 'neutralChroma' | 'vibrancy' | 'radius' | 'depth'; lo: number; hi: number }> = [
      { key: 'neutralChroma', lo: 0, hi: 0.08 },
      { key: 'vibrancy', lo: 0.5, hi: 1.4 },
      { key: 'radius', lo: 0, hi: 20 },
      { key: 'depth', lo: 0, hi: 1 },
    ];
    for (const { key, lo, hi } of numeric) {
      const v = params[key];
      if (v !== undefined) {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          return { Success: false, ErrorMessage: `${key} must be a number between ${lo} and ${hi}.` };
        }
        next[key] = clamp(v, lo, hi);
        changed++;
      }
    }
    if (changed === 0) {
      return { Success: false, ErrorMessage: 'Provide at least one seed to change.' };
    }
    this.seeds = next;
    this.recompute();
    this.publishAgentContext();
    this.cdRef.detectChanges();
    return { Success: true, Data: { SeedsChanged: changed, ContrastPasses: this.derived.contrast.passes } };
  }
}
