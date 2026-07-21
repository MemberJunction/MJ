/**
 * @fileoverview Theme Studio dashboard (org-theming Phase 5) — the polished authoring
 * surface for brand themes, matching theme-studio-mockup-v2: a preview-primary layout
 * with a collapsible, resizable slide-panel editor, three switchable preview surfaces
 * (Explorer UI style-guide, Skip reports, agent output), and a fullscreen mode.
 *
 * Preview fidelity (proposal 16.2 / decision #4): every surface is fed by the SAME
 * derivation module as the save path (@memberjunction/theme-engine). The mockup's
 * parallel `--p-*` + JS color math is replaced by the real derived `--mj-*` token map,
 * pushed onto the preview canvas — so hovers, dark re-point, and status colors are the
 * true generator output, not an approximation.
 *
 * Customization escalates in order (design feedback v1.1): seeds → token overrides
 * (visual token browser + recipes) → custom CSS (escape hatch, CodeMirror-backed).
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
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { Extension } from '@codemirror/state';
import { RunView } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseDashboard, ThemeService } from '@memberjunction/ng-shared';
import { MJThemeEntity, ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { CodeEditorComponent } from '@memberjunction/ng-code-editor';
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
import {
  buildCssWarnings,
  isBuiltInTheme,
  MJ_CHROME_SELECTOR_INFO,
  MJ_CHROME_SELECTORS,
  parseOverridesJson,
  pickWorstOnPrimary,
  THEME_RECIPES,
  ThemeRecipe,
  TOKEN_CATEGORIES,
  TOKEN_PREVIEW_TARGETS,
} from './theme-studio.constants';
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

/** One row in the visual token browser. */
interface TokenRow {
  name: string;
  /** Effective value shown (override if present, else derived for the preview mode). */
  value: string;
  overridden: boolean;
  /** Whether `value` is a plain hex color editable with a color picker. */
  isColor: boolean;
  /** Normalized 6-digit hex for input[type=color] (only meaningful when isColor). */
  colorValue: string;
}

/** One category group in the visual token browser. */
interface TokenGroup {
  key: string;
  label: string;
  rows: TokenRow[];
  modified: number;
}

type PreviewSurface = 'explorer' | 'artifact';

/** Panel sizing (Q3): resizable with a min, an advanced-mode preset, and a preview floor. */
const PANEL_MIN_WIDTH = 392;
const PANEL_ADVANCED_WIDTH = 600;
const PREVIEW_MIN_WIDTH = 640;
const PANEL_MAX_FRACTION = 0.55;
/** User-settings key for a manually-dragged panel width. */
const PANEL_WIDTH_KEY = 'mj.themeStudio.panelWidth.v1';
/** Brand-overlay id used for the temporary "Preview on my workspace" application. */
const WORKSPACE_PREVIEW_ID = 'theme-studio-draft-preview';

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
  @ViewChild('stage') private stageEl?: ElementRef<HTMLElement>;
  @ViewChild('cssCm') private cssCm?: CodeEditorComponent;
  @ViewChild('galDialog') private galDialog?: ElementRef<HTMLElement>;
  private themesChangedSub?: Subscription;

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

  /** Preset gallery shown as step one of "New theme" (Q1#2). */
  public presetGalleryOpen = false;

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

  /** Interactive-mock state (Q1#6) — clickable tabs/nav/switches/accordion so the
   *  derived state token families (hover/active/focus) demonstrate themselves live. */
  public readonly mockNavItems = ['Dashboards', 'Data', 'Agents'];
  public mockNav = 0;
  public readonly mockTabs = ['Overview', 'Members', 'Renewals'];
  public mockTab = 0;
  public mockSwitchA = true;
  public mockSwitchB = false;
  public mockAccordionOpen = false;

  /** Advanced customization (persisted): per-token overrides + raw scoped CSS. */
  public advancedOpen = false;
  public tokenOverrides: Record<string, string> = {};
  public customCss = '';
  public showGeneratedCss = false;

  /** Visual token browser state (Q2#1). */
  public tokenSearch = '';
  public tokenGroups: TokenGroup[] = [];
  public openTokenCats = new Set<string>();
  public editingToken: string | null = null;
  public editingTokenValue = '';
  private editingTokenOriginal = '';
  private editingTokenWasOverridden = false;

  /** Recipes (Q2#3): curated intents expanded to token sets. On/off is tracked by
   *  PROVENANCE — `activeRecipeKeys` records exactly which override keys each active
   *  recipe produced, so hand-set overrides never masquerade as an active recipe and
   *  toggling off removes only keys the recipe still owns. */
  public readonly chromeSelectorInfo = MJ_CHROME_SELECTOR_INFO;
  public recipeStates: { recipe: ThemeRecipe; on: boolean }[] = [];
  private activeRecipeKeys = new Map<string, string[]>();

  /** Inline custom-CSS validation results (Q3#6). */
  public cssWarnings: string[] = [];

  /** Panel sizing (Q3#1/#2). */
  public panelWidth = PANEL_MIN_WIDTH;
  public panelResizing = false;
  private manualPanelWidth: number | null = null;

  /** "Preview on my workspace" (Q3#8). */
  public workspacePreviewOn = false;
  private priorOverlayId: string | null = null;
  private workspacePreviewTimer: ReturnType<typeof setTimeout> | undefined;

  /** CodeMirror extensions for the custom-CSS editor: MJ selector + token completions. */
  public readonly cssEditorExtensions: Extension[] = [
    autocompletion({ override: [(ctx) => this.mjCssCompletionSource(ctx)] }),
  ];

  private tokenHighlightEl: HTMLStyleElement | null = null;
  private appliedVarKeys = new Set<string>();
  private liveTokenCache: Set<string> | null = null;
  /** Sheet count the cache was built against — lazy-loaded chunks add stylesheets. */
  private liveTokenCacheSheetCount = -1;

  constructor(private cdRef: ChangeDetectorRef, private themeService: ThemeService) {
    super();
  }

  ngAfterViewInit(): void {
    this.syncPanelWidth();
    this.applyPreviewVars();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Theme Studio';
  }

  protected initDashboard(): void {
    this.seeds = { ...MJ_DEFAULT_SEEDS };
    this.loadPersistedPanelWidth();
    this.refreshRecipeStates();
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
    clearTimeout(this.workspacePreviewTimer);
    if (this.workspacePreviewOn) {
      void this.endWorkspacePreview(false);
    }
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
    this.reexpandActiveRecipes();
    this.applyPreviewVars();
    this.rebuildTokenBrowser();
    this.refreshWorkspacePreviewDebounced();
  }

  /** The text-on-primary contrast headline, reporting the WORST of light and dark (Q1#3). */
  public get onPrimaryWorst(): { check: ContrastCheck; mode: 'light' | 'dark' } | undefined {
    const detail = this.onPrimaryDetail;
    return pickWorstOnPrimary(detail.light, detail.dark);
  }

  /** Per-mode text-on-primary detail shown alongside the worst-of-both headline. */
  public get onPrimaryDetail(): { light?: ContrastCheck; dark?: ContrastCheck } {
    return {
      light: this.derived.contrast.light.find((c) => c.name === 'text-on-primary'),
      dark: this.derived.contrast.dark.find((c) => c.name === 'text-on-primary'),
    };
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
   * any [data-theme="dark"] rules inside the canvas resolve. Stale keys from removed
   * overrides (e.g. a recipe toggled off) are cleared before re-applying.
   */
  private applyPreviewVars(): void {
    const el = this.previewCanvas?.nativeElement;
    if (!el) return;
    // Advanced token overrides win, layered last — mirrors emitOverlayCss's merge order.
    const vars = { ...this.derived.overlayVars, ...this.derived.tokens[this.previewMode], ...this.tokenOverrides };
    for (const k of this.appliedVarKeys) {
      if (!(k in vars)) el.style.removeProperty(k);
    }
    this.appliedVarKeys = new Set(Object.keys(vars));
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
  // Advanced customization — token browser + recipes + raw CSS
  // ========================================

  /** Token names in the derived contract (completion, insert picker, validation). */
  public get overridableTokens(): string[] {
    const names = new Set([...Object.keys(this.derived.overlayVars), ...Object.keys(this.derived.tokens.light)]);
    return Array.from(names).sort();
  }

  /** Overrides/custom CSS don't change derivation — re-apply the preview layer, refresh
   *  the browser rows + recipe states, and keep any live workspace preview in sync. */
  public onAdvancedChanged(): void {
    this.applyPreviewVars();
    this.rebuildTokenBrowser();
    this.refreshWorkspacePreviewDebounced();
    this.publishAgentContextDebounced();
  }

  /** Expand/collapse the Advanced card, auto-widening the panel while it's open (Q3#2). */
  public toggleAdvanced(): void {
    this.advancedOpen = !this.advancedOpen;
    this.syncPanelWidth();
  }

  /** Closed-state summary — "3 token overrides · 14 lines CSS" (Q3#7). */
  public get advancedSummary(): string | null {
    const overrideCount = Object.keys(this.tokenOverrides).length;
    const cssLines = this.customCss.trim() ? this.customCss.trim().split('\n').length : 0;
    if (!overrideCount && !cssLines) return null;
    const parts: string[] = [];
    if (overrideCount) parts.push(`${overrideCount} token override${overrideCount === 1 ? '' : 's'}`);
    if (cssLines) parts.push(`${cssLines} line${cssLines === 1 ? '' : 's'} CSS`);
    return parts.join(' · ');
  }

  // ---- Visual token browser (Q2#1) ----

  /** Rebuild the grouped, searchable token rows. */
  private rebuildTokenBrowser(): void {
    const q = this.tokenSearch.trim().toLowerCase();
    const names = new Set([
      ...Object.keys(this.derived.overlayVars),
      ...Object.keys(this.derived.tokens.light),
      ...Object.keys(this.tokenOverrides),
    ]);
    const groups: TokenGroup[] = TOKEN_CATEGORIES.map((c) => ({ key: c.key, label: c.label, rows: [], modified: 0 }));
    const other: TokenGroup = { key: 'other', label: 'Other', rows: [], modified: 0 };
    for (const name of Array.from(names).sort()) {
      if (q && !name.toLowerCase().includes(q)) continue;
      const derivedVal = this.derived.tokens[this.previewMode][name] ?? this.derived.overlayVars[name] ?? '';
      const overridden = name in this.tokenOverrides;
      const value = overridden ? this.tokenOverrides[name] : derivedVal;
      const hex = /^#[0-9a-fA-F]{6}$/.test(value.trim());
      const row: TokenRow = { name, value, overridden, isColor: hex, colorValue: hex ? value.trim() : '#000000' };
      const catIndex = TOKEN_CATEGORIES.findIndex((c) => c.match.test(name));
      const group = catIndex >= 0 ? groups[catIndex] : other;
      group.rows.push(row);
      if (overridden) group.modified++;
    }
    this.tokenGroups = [...groups, other].filter((g) => g.rows.length > 0);
  }

  public onTokenSearchChanged(): void {
    this.rebuildTokenBrowser();
  }

  public toggleTokenCategory(key: string): void {
    if (this.openTokenCats.has(key)) {
      this.openTokenCats.delete(key);
    } else {
      this.openTokenCats.add(key);
    }
  }

  /** A category is open when toggled open, or always while a search narrows the rows. */
  public isTokenCategoryOpen(key: string): boolean {
    return this.tokenSearch.trim().length > 0 || this.openTokenCats.has(key);
  }

  public setTokenOverride(name: string, value: string): void {
    this.tokenOverrides = { ...this.tokenOverrides, [name]: value };
    this.releaseRecipeOwnership(name);
    this.onAdvancedChanged();
  }

  public resetTokenOverride(name: string): void {
    const next = { ...this.tokenOverrides };
    delete next[name];
    this.tokenOverrides = next;
    this.releaseRecipeOwnership(name);
    if (this.editingToken === name) this.editingToken = null;
    this.onAdvancedChanged();
  }

  public onTokenColorInput(name: string, event: Event): void {
    this.setTokenOverride(name, (event.target as HTMLInputElement).value);
  }

  /** Begin inline text editing for a non-color token value. */
  public beginTokenEdit(row: TokenRow): void {
    this.editingToken = row.name;
    this.editingTokenValue = row.value;
    this.editingTokenOriginal = row.value;
    this.editingTokenWasOverridden = row.overridden;
  }

  public commitTokenEdit(): void {
    if (!this.editingToken) return;
    const name = this.editingToken;
    const value = this.editingTokenValue.trim();
    this.editingToken = null;
    // An unchanged, previously-underived value is a no-op — don't mark it modified.
    if (!value || (!this.editingTokenWasOverridden && value === this.editingTokenOriginal)) return;
    this.setTokenOverride(name, value);
  }

  public cancelTokenEdit(): void {
    this.editingToken = null;
  }

  // ---- Reverse highlight (Q2#2): token row hover → outline preview elements ----

  /** Outline the preview elements that use `token` (exact by construction — the canvas
   *  markup is ours; see TOKEN_PREVIEW_TARGETS). Unmapped tokens simply don't highlight. */
  public highlightTokenTargets(token: string): void {
    const canvas = this.previewCanvas?.nativeElement;
    if (!canvas) return;
    const selectors = TOKEN_PREVIEW_TARGETS[token];
    if (!selectors?.length) {
      this.clearTokenHighlight();
      return;
    }
    if (!this.tokenHighlightEl || !this.tokenHighlightEl.isConnected) {
      this.tokenHighlightEl = document.createElement('style');
      this.tokenHighlightEl.id = 'ts-token-highlight';
      canvas.appendChild(this.tokenHighlightEl);
    }
    const scoped = selectors.map((s) => `.ts-canvas ${s}`).join(', ');
    // Fixed magenta on purpose: an inspector affordance that must stand out on any theme.
    this.tokenHighlightEl.textContent = `${scoped} { outline: 2px solid #e935c1 !important; outline-offset: 2px; }`;
  }

  public clearTokenHighlight(): void {
    if (this.tokenHighlightEl) this.tokenHighlightEl.textContent = '';
  }

  // ---- Recipes (Q2#3) — provenance-tracked ----

  /** Toggle a recipe: expand its token set into overrides (recording ownership), or
   *  remove exactly the keys it still owns. Keys the user hand-edited after enabling
   *  were released from ownership at edit time and are never touched here. */
  public toggleRecipe(recipe: ThemeRecipe): void {
    const owned = this.activeRecipeKeys.get(recipe.id);
    const next = { ...this.tokenOverrides };
    if (owned) {
      for (const k of owned) delete next[k];
      this.activeRecipeKeys.delete(recipe.id);
    } else {
      const tokens = recipe.tokens(this.derived, this.seeds);
      const keys = Object.keys(tokens);
      if (keys.length === 0) return;
      Object.assign(next, tokens);
      this.activeRecipeKeys.set(recipe.id, keys);
    }
    this.tokenOverrides = next;
    this.refreshRecipeStates();
    this.onAdvancedChanged();
  }

  /** Derive the on/off rows shown in the Recipes card from the provenance map. */
  private refreshRecipeStates(): void {
    this.recipeStates = THEME_RECIPES.map((recipe) => ({ recipe, on: this.activeRecipeKeys.has(recipe.id) }));
  }

  /** A hand edit (set or reset) takes ownership of `name` away from any active recipe,
   *  so recipe toggle-off / re-expansion never clobbers or deletes the user's value.
   *  A recipe left with no owned keys is effectively off. */
  private releaseRecipeOwnership(name: string): void {
    let changed = false;
    for (const [id, keys] of this.activeRecipeKeys) {
      if (!keys.includes(name)) continue;
      const remaining = keys.filter((k) => k !== name);
      if (remaining.length > 0) {
        this.activeRecipeKeys.set(id, remaining);
      } else {
        this.activeRecipeKeys.delete(id);
      }
      changed = true;
    }
    if (changed) this.refreshRecipeStates();
  }

  /** Re-expand active recipes from the CURRENT derived theme so their values follow the
   *  brand as seeds change. Only recipe-owned keys are rewritten; keys a recipe no
   *  longer produces are dropped from both the overrides and the ownership record. */
  private reexpandActiveRecipes(): void {
    if (this.activeRecipeKeys.size === 0) return;
    const next = { ...this.tokenOverrides };
    for (const recipe of THEME_RECIPES) {
      const owned = this.activeRecipeKeys.get(recipe.id);
      if (!owned) continue;
      const tokens = recipe.tokens(this.derived, this.seeds);
      const remaining: string[] = [];
      for (const key of owned) {
        if (key in tokens) {
          next[key] = tokens[key];
          remaining.push(key);
        } else {
          delete next[key];
        }
      }
      if (remaining.length > 0) {
        this.activeRecipeKeys.set(recipe.id, remaining);
      } else {
        this.activeRecipeKeys.delete(recipe.id);
      }
    }
    this.tokenOverrides = next;
    this.refreshRecipeStates();
  }

  /** Rebuild provenance for a freshly loaded override set (no stored provenance):
   *  a recipe is considered active only when every key it would produce is present
   *  with EXACTLY the value it would produce — since active recipes track the seeds
   *  (see reexpandActiveRecipes), a saved active recipe always value-matches. */
  private inferActiveRecipes(): void {
    this.activeRecipeKeys.clear();
    for (const recipe of THEME_RECIPES) {
      const tokens = recipe.tokens(this.derived, this.seeds);
      const keys = Object.keys(tokens);
      if (keys.length > 0 && keys.every((k) => this.tokenOverrides[k] === tokens[k])) {
        this.activeRecipeKeys.set(recipe.id, keys);
      }
    }
    this.refreshRecipeStates();
  }

  // ---- Custom CSS editor (Q3#4/#5/#6) ----

  public onCssEditorChange(value: string): void {
    this.customCss = value;
    this.validateCustomCss();
    this.onAdvancedChanged();
  }

  /** All completions offered: real chrome selectors + the theme's derived token names. */
  private get cssSuggestions(): string[] {
    return [...MJ_CHROME_SELECTORS, ...this.overridableTokens];
  }

  /** CodeMirror completion source over the MJ chrome selectors + `--mj-*` tokens. */
  private mjCssCompletionSource(context: CompletionContext): CompletionResult | null {
    const word = context.matchBefore(/[-\w.]+/);
    if (!word || (word.text.length < 2 && !context.explicit)) return null;
    return {
      from: word.from,
      options: this.cssSuggestions.map((s) => ({ label: s, type: s.startsWith('--') ? 'variable' : 'type' })),
      validFor: /^[-\w.]*$/,
    };
  }

  /** Insert a chrome selector at the caret; on an empty line, scaffold a full rule. */
  public insertChromeSelector(selector: string): void {
    const view = this.cssCm?.view;
    if (!view) {
      const prefix = this.customCss.trim() ? `${this.customCss.replace(/\s+$/, '')}\n\n` : '';
      this.onCssEditorChange(`${prefix}${selector} {\n  \n}`);
      return;
    }
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    if (line.text.trim().length === 0) {
      const opener = `${selector} {\n  `;
      view.dispatch({
        changes: { from: pos, insert: `${opener}\n}` },
        selection: { anchor: pos + opener.length },
      });
    } else {
      view.dispatch({
        changes: { from: pos, insert: selector },
        selection: { anchor: pos + selector.length },
      });
    }
    view.focus();
  }

  /** Insert-token picker (same enumeration the overrides use). */
  public onInsertTokenPick(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const token = select.value;
    select.value = '';
    if (!token) return;
    const text = `var(${token})`;
    const view = this.cssCm?.view;
    if (!view) {
      this.onCssEditorChange(this.customCss + text);
      return;
    }
    const pos = view.state.selection.main.head;
    view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
    view.focus();
  }

  /** Inline validation at edit time (Q3#6): @import removal + unknown --mj-* names. */
  private validateCustomCss(): void {
    this.cssWarnings = buildCssWarnings(this.customCss, this.knownMjTokens());
  }

  /** The full known --mj-* set: the derived contract ∪ every token the live app defines. */
  private knownMjTokens(): Set<string> {
    const known = new Set(this.overridableTokens);
    for (const t of this.collectLiveMjTokens()) known.add(t);
    return known;
  }

  /** Scan loaded stylesheets for every defined `--mj-*` custom property, so the
   *  unknown-name warning validates against the real base contract (no false positives
   *  on base tokens outside the derived overlay, e.g. --mj-shadow-sm). Re-scans when
   *  the stylesheet count changes (lazy-loaded chunks add sheets after first scan). */
  private collectLiveMjTokens(): Set<string> {
    if (this.liveTokenCache && document.styleSheets.length === this.liveTokenCacheSheetCount) {
      return this.liveTokenCache;
    }
    this.liveTokenCacheSheetCount = document.styleSheets.length;
    const set = new Set<string>();
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet
      }
      for (const rule of Array.from(rules)) {
        this.collectTokensFromRule(rule, set);
      }
    }
    this.liveTokenCache = set;
    return set;
  }

  private collectTokensFromRule(rule: CSSRule, set: Set<string>): void {
    if (rule instanceof CSSStyleRule) {
      for (const prop of Array.from(rule.style)) {
        if (prop.startsWith('--mj-')) set.add(prop);
      }
    }
    const children = (rule as CSSGroupingRule).cssRules;
    if (children) {
      for (const child of Array.from(children)) {
        this.collectTokensFromRule(child, set);
      }
    }
  }

  /** The actual overlay CSS this theme produces (tokens + advanced layer) — read-only view. */
  public get generatedCss(): string {
    return emitOverlayCss(this.currentThemeId ?? 'preview', this.derived, {
      overrides: this.tokenOverrides,
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

  // ========================================
  // View / panel / fullscreen chrome
  // ========================================

  public setView(view: PreviewSurface): void {
    this.activeView = view;
  }

  public setPreviewMode(mode: 'light' | 'dark'): void {
    this.previewMode = mode;
    this.applyPreviewVars();
    this.rebuildTokenBrowser();
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

  // ---- Panel resize (Q3#1): drag handle, clamped, persisted per user ----

  /** Clamp a requested panel width: >= the design minimum, <= 55% of the stage, and
   *  never eating the canvas below its ~640px floor (the resize clamps, not the preview). */
  private clampPanelWidth(width: number): number {
    const stageWidth = this.stageEl?.nativeElement.clientWidth ?? window.innerWidth;
    const max = Math.max(PANEL_MIN_WIDTH, Math.min(stageWidth * PANEL_MAX_FRACTION, stageWidth - PREVIEW_MIN_WIDTH));
    return Math.round(Math.min(max, Math.max(PANEL_MIN_WIDTH, width)));
  }

  /** Manually-dragged width wins; otherwise auto-widen while Advanced is open (Q3#2). */
  private syncPanelWidth(): void {
    this.panelWidth = this.clampPanelWidth(this.manualPanelWidth ?? (this.advancedOpen ? PANEL_ADVANCED_WIDTH : PANEL_MIN_WIDTH));
  }

  private loadPersistedPanelWidth(): void {
    try {
      const raw = UserInfoEngine.Instance.GetSetting(PANEL_WIDTH_KEY);
      const parsed = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(parsed) && parsed >= PANEL_MIN_WIDTH) {
        this.manualPanelWidth = parsed;
      }
    } catch {
      // no persisted width — defaults apply
    }
    this.syncPanelWidth();
  }

  public startPanelResize(event: PointerEvent): void {
    event.preventDefault();
    const handle = event.target as HTMLElement;
    this.panelResizing = true;
    const startX = event.clientX;
    const startWidth = this.panelWidth;
    const onMove = (e: PointerEvent) => {
      this.panelWidth = this.clampPanelWidth(startWidth + (startX - e.clientX));
      this.cdRef.detectChanges();
    };
    const end = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      this.panelResizing = false;
      this.manualPanelWidth = this.panelWidth;
      UserInfoEngine.Instance.SetSettingDebounced(PANEL_WIDTH_KEY, String(this.panelWidth));
      this.cdRef.detectChanges();
    };
    // Pointer capture routes all events to the handle until release: drags ending
    // outside the window still fire pointerup, pointercancel (touch interruption) is
    // handled, and the listeners die with the element if the component is destroyed.
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  @HostListener('window:resize')
  public onWindowResize(): void {
    this.syncPanelWidth();
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
    if (this.presetGalleryOpen) {
      this.presetGalleryOpen = false;
      this.cdRef.detectChanges();
      return;
    }
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
    this.tokenOverrides = parseOverridesJson(entity.Overrides);
    this.customCss = entity.CustomCSS ?? '';
    this.validateCustomCss();
    // Provenance from the outgoing theme must not survive into the loaded one; the
    // loaded overrides carry no provenance, so rebuild it by exact value match.
    this.activeRecipeKeys.clear();
    this.recompute();
    this.inferActiveRecipes();
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

  /**
   * Start a fresh, unsaved draft. From the UI this opens on the preset gallery
   * (choosing a personality first, Q1#2); agent-driven calls skip straight to the
   * MJ default seeds.
   */
  public newTheme(showGallery = true): void {
    this.themePickerOpen = false;
    this.currentThemeId = null;
    this.currentName = 'New Theme';
    this.seeds = { ...MJ_DEFAULT_SEEDS };
    this.tokenOverrides = {};
    this.customCss = '';
    this.cssWarnings = [];
    this.activeRecipeKeys.clear();
    this.refreshRecipeStates();
    this.recompute();
    this.presetGalleryOpen = showGallery;
    if (showGallery) this.focusPresetGallery();
  }

  /** Move focus into the gallery once it renders — aria-modal without focus is a trap
   *  for keyboard/AT users (Esc + Tab must operate on the dialog, not what's behind it). */
  private focusPresetGallery(): void {
    setTimeout(() => this.galDialog?.nativeElement.focus());
  }

  /** Preset gallery: pick a personality card as step one of a new theme. */
  public choosePreset(preset: ThemePreset): void {
    this.presetGalleryOpen = false;
    this.applyPreset(preset);
    this.cdRef.detectChanges();
  }

  /** Close the gallery keeping the MJ-default draft (the "start blank" path). */
  public closePresetGallery(): void {
    this.presetGalleryOpen = false;
  }

  public discard(): void {
    const id = this.currentThemeId;
    const current = id ? this.themes.find((t) => UUIDsEqual(t.id, id)) : undefined;
    if (current) {
      this.selectTheme(current);
    } else {
      this.newTheme(false);
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
      entity.Overrides = Object.keys(this.tokenOverrides).length ? JSON.stringify(this.tokenOverrides) : null;
      entity.CustomCSS = this.customCss.trim() || null;
      if (await entity.Save()) {
        const wasNew = !this.currentThemeId;
        this.currentThemeId = entity.ID;
        // While the draft preview is on, BrandOverlayId is the preview id — the theme
        // the user actually has applied is the one the preview will restore.
        const liveOverlayId = this.workspacePreviewOn ? this.priorOverlayId : this.themeService.BrandOverlayId;
        if (UUIDsEqual(liveOverlayId, entity.ID) || (!wasNew && entity.IsDefault)) {
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
      this.abandonWorkspacePreview();
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
    // A real apply supersedes any draft workspace preview — abandon it (no restore;
    // the overlay applied below takes over) so a later toggle-off can't revert this.
    this.abandonWorkspacePreview();
    this.themeService.RegisterBrandTheme({
      id: this.currentThemeId,
      name: this.currentName,
      seeds: this.seeds,
      overrides: this.tokenOverrides,
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
    this.notify(`Applied "${this.currentName}" to your workspace — it stays applied across sessions.`);
    this.cdRef.detectChanges();
  }

  // ---- "Preview on my workspace" (Q3#8): draft against the REAL chrome ----

  /**
   * Temporarily apply the in-memory draft (seeds + overrides + custom CSS) to the real
   * app chrome so custom-CSS selectors are authored against reality. The preview stays
   * on while you navigate other tabs (that's the point — the Studio tab is cached, not
   * destroyed) and reverts on toggle-off or when the Studio tab is closed. It is never
   * persisted ({ persist: false }), so a reload always restores the user's real theme.
   */
  public async toggleWorkspacePreview(): Promise<void> {
    if (this.workspacePreviewOn) {
      await this.endWorkspacePreview();
      return;
    }
    this.priorOverlayId = this.themeService.BrandOverlayId;
    this.registerDraftPreview();
    await this.themeService.ApplyBrandOverlay(WORKSPACE_PREVIEW_ID, { persist: false });
    this.workspacePreviewOn = true;
    this.notify('Draft applied to your workspace for preview — edits update live. Toggle off to revert.', 'info');
    this.cdRef.detectChanges();
  }

  private registerDraftPreview(): void {
    this.themeService.RegisterBrandTheme({
      id: WORKSPACE_PREVIEW_ID,
      name: `${this.currentName} (draft preview)`,
      seeds: this.seeds,
      overrides: this.tokenOverrides,
      customCss: this.customCss,
    });
  }

  /** While the workspace preview is on, keep it tracking the draft (debounced). */
  private refreshWorkspacePreviewDebounced(): void {
    if (!this.workspacePreviewOn) return;
    clearTimeout(this.workspacePreviewTimer);
    this.workspacePreviewTimer = setTimeout(() => {
      if (!this.workspacePreviewOn) return;
      this.registerDraftPreview();
      void this.themeService.ApplyBrandOverlay(WORKSPACE_PREVIEW_ID, { persist: false });
    }, 400);
  }

  /** Drop the draft preview WITHOUT restoring the prior overlay — used when a real
   *  apply (Apply to me / save-of-live-theme / set org default) is about to take over
   *  the workspace, so a later toggle-off can't silently revert what the user applied. */
  private abandonWorkspacePreview(): void {
    if (!this.workspacePreviewOn) return;
    this.workspacePreviewOn = false;
    clearTimeout(this.workspacePreviewTimer);
    this.priorOverlayId = null;
  }

  private async endWorkspacePreview(notifyUser = true): Promise<void> {
    if (!this.workspacePreviewOn) return;
    this.workspacePreviewOn = false;
    clearTimeout(this.workspacePreviewTimer);
    if (this.priorOverlayId) {
      await this.themeService.ApplyBrandOverlay(this.priorOverlayId);
    } else {
      this.themeService.ClearBrandOverlay();
    }
    this.priorOverlayId = null;
    if (notifyUser) {
      this.notify('Workspace preview ended — your previous theme is back.');
      this.cdRef.detectChanges();
    }
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
        OverrideTokenCount: Object.keys(this.tokenOverrides).length,
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
          this.newTheme(false);
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
          this.presetGalleryOpen = false;
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
