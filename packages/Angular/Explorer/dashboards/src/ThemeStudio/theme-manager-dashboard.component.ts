/**
 * @fileoverview Theme Manager dashboard (org-theming Phase 5) — the "Manage Themes"
 * top-level tab of the Theme Studio application. A table of saved brand themes with
 * govern actions: set default (applied live), duplicate, delete, and open/edit. The
 * visual authoring happens in the sibling "Theme Studio" tab.
 * @module ThemeStudio
 */

import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CompositeKey, RunView } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseDashboard, ThemeService } from '@memberjunction/ng-shared';
import { MJThemeEntity, ResourceData } from '@memberjunction/core-entities';
import { MJ_DEFAULT_SEEDS, ThemeSeeds } from '@memberjunction/theme-engine';
import { isBuiltInTheme } from './theme-studio.constants';

interface ThemeRow {
  id: string;
  name: string;
  isDefault: boolean;
  status: string;
  swatches: string[];
  builtIn: boolean;
  starred: boolean;
}

@RegisterClass(BaseDashboard, 'ThemeManagerDashboard')
@Component({
  standalone: false,
  selector: 'mj-theme-manager-dashboard',
  templateUrl: './theme-manager-dashboard.component.html',
  styleUrls: ['./theme-manager-dashboard.component.css'],
})
export class ThemeManagerDashboardComponent extends BaseDashboard implements OnDestroy {
  public themes: ThemeRow[] = [];
  public deleteTarget: ThemeRow | null = null;
  public toast = '';
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private themesChangedSub?: Subscription;

  constructor(private cdRef: ChangeDetectorRef, private themeService: ThemeService) {
    super();
  }

  override ngOnDestroy(): void {
    this.themesChangedSub?.unsubscribe();
    super.ngOnDestroy();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Manage Themes';
  }

  /** Whether this theme is the brand currently applied to the session (case-insensitive
   *  GUID compare — RunView ids and entity ids can differ in case). */
  public isApplied(id: string): boolean {
    const active = this.themeService.BrandOverlayId;
    return !!active && UUIDsEqual(id, active);
  }

  protected initDashboard(): void {
    // Reload when a theme is created/renamed/etc. in the Theme Studio tab (or elsewhere).
    this.themesChangedSub = this.themeService.ThemesChanged$.subscribe(() => {
      this.loadData();
    });
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
        status: t.Status,
        swatches: this.swatchesFor(t.Seeds),
        builtIn: isBuiltInTheme(t.ID),
        starred: this.themeService.IsStarred(t.ID),
      }));
    } catch {
      this.themes = [];
    }
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

  /** Star / unstar a theme (adds it to the user's starred set for the user-menu modal). */
  public async toggleStar(row: ThemeRow): Promise<void> {
    row.starred = await this.themeService.ToggleStar(row.id);
    this.cdRef.detectChanges();
  }

  /** Open the theme record (edit) — the shell handles this via the resource wrapper. */
  public edit(row: ThemeRow): void {
    if (row.builtIn) {
      this.notify('The built-in theme is read-only — duplicate it to customize.');
      return;
    }
    this.OpenEntityRecord.emit({ EntityName: 'MJ: Themes', RecordPKey: CompositeKey.FromID(row.id) });
  }

  /** Apply this theme to the current user's workspace now and remember it as their choice. */
  public async applyToMe(row: ThemeRow): Promise<void> {
    try {
      const md = this.ProviderToUse;
      const entity = await md.GetEntityObject<MJThemeEntity>('MJ: Themes');
      if (!(await entity.Load(row.id))) return;
      this.themeService.RegisterBrandTheme({ id: entity.ID, name: entity.Name, seeds: entity.Seeds, overrides: entity.Overrides, customCss: entity.CustomCSS });
      await this.themeService.ApplyBrandOverlay(entity.ID);
      await this.themeService.SetSelectedBrandTheme(entity.ID);
      this.notify(`Applied "${entity.Name}" to your workspace.`);
    } catch (e) {
      this.notify(`Could not apply: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.cdRef.detectChanges();
    }
  }

  /** Make this the single org-wide default and apply it to the running app immediately. */
  public async setDefault(row: ThemeRow): Promise<void> {
    try {
      const md = this.ProviderToUse;
      const rv = new RunView();
      const others = await rv.RunView<MJThemeEntity>({
        EntityName: 'MJ: Themes',
        ExtraFilter: `IsDefault = 1 AND ID <> '${row.id}'`,
        ResultType: 'entity_object',
      });
      if (others.Success) {
        for (const other of others.Results) {
          other.IsDefault = false;
          await other.Save();
        }
      }
      const entity = await md.GetEntityObject<MJThemeEntity>('MJ: Themes');
      if (!(await entity.Load(row.id))) return;
      entity.IsDefault = true;
      if (!(await entity.Save())) {
        this.notify(`Could not set default: ${entity.LatestResult?.Message ?? 'unknown error'}`);
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
      this.notify(`Could not set default: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.cdRef.detectChanges();
    }
  }

  public async duplicate(row: ThemeRow): Promise<void> {
    try {
      const md = this.ProviderToUse;
      const src = await md.GetEntityObject<MJThemeEntity>('MJ: Themes');
      if (!(await src.Load(row.id))) return;
      const copy = await md.GetEntityObject<MJThemeEntity>('MJ: Themes');
      copy.NewRecord();
      copy.Name = this.uniqueName(`${src.Name} Copy`);
      copy.Description = src.Description;
      copy.Seeds = src.Seeds;
      copy.Status = 'Active';
      if (await copy.Save()) {
        await this.loadData();
        this.themeService.NotifyThemesChanged();
        this.notify(`Duplicated as "${copy.Name}".`);
      } else {
        this.notify(`Duplicate failed: ${copy.LatestResult?.Message ?? 'unknown error'}`);
      }
    } catch (e) {
      this.notify(`Duplicate failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.cdRef.detectChanges();
    }
  }

  public async remove(row: ThemeRow): Promise<void> {
    this.deleteTarget = null;
    if (row.builtIn) {
      this.notify('The built-in theme cannot be deleted.');
      return;
    }
    try {
      const md = this.ProviderToUse;
      const entity = await md.GetEntityObject<MJThemeEntity>('MJ: Themes');
      if (!(await entity.Load(row.id))) return;
      if (await entity.Delete()) {
        await this.loadData();
        this.themeService.NotifyThemesChanged();
        this.notify(`Deleted "${row.name}".`);
      } else {
        this.notify(`Delete failed: ${entity.LatestResult?.Message ?? 'unknown error'}`);
      }
    } catch (e) {
      this.notify(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.cdRef.detectChanges();
    }
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

  private notify(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = '';
      this.cdRef.detectChanges();
    }, 2400);
  }
}
