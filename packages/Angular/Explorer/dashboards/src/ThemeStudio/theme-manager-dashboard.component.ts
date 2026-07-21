/**
 * @fileoverview Theme Manager dashboard (org-theming Phase 5) — the "Manage Themes"
 * top-level tab of the Theme Studio application. A table of saved brand themes with
 * govern actions: set default (applied live), duplicate, delete, and open/edit. The
 * visual authoring happens in the sibling "Theme Studio" tab.
 *
 * 🚨 SAFETY BOUNDARY 🚨 (see theme-agent-context.ts for the shared statement)
 * Agent tools here are read / user-scoped only: refresh, apply-to-me, star/unstar.
 * Set-org-default, duplicate, delete, and edit stay human-driven in the UI —
 * delete additionally sits behind MJConfirmService.ConfirmDelete.
 * @module ThemeStudio
 */

import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CompositeKey, RunView } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseDashboard, ThemeService } from '@memberjunction/ng-shared';
import { MJThemeEntity, ResourceData } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { MJ_DEFAULT_SEEDS, ThemeSeeds } from '@memberjunction/theme-engine';
import { isBuiltInTheme } from './theme-studio.constants';
import { buildThemeManagerAgentContext, resolveThemeByIDOrName, ThemeSummaryRow } from './theme-agent-context';

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
  private themesChangedSub?: Subscription;

  constructor(
    private cdRef: ChangeDetectorRef,
    private themeService: ThemeService,
    private confirmService: MJConfirmService
  ) {
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
    this.registerAgentTools();
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

  /** Star / unstar a theme (adds it to the user's starred set for the user-menu modal). */
  public async toggleStar(row: ThemeRow): Promise<void> {
    row.starred = await this.themeService.ToggleStar(row.id);
    this.publishAgentContext();
    this.cdRef.detectChanges();
  }

  /** Open the theme record (edit) — the shell handles this via the resource wrapper. */
  public edit(row: ThemeRow): void {
    if (row.builtIn) {
      this.notify('The built-in theme is read-only — duplicate it to customize.', 'info');
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
      this.publishAgentContext();
      this.notify(`Applied "${entity.Name}" to your workspace.`);
    } catch (e) {
      this.notify(`Could not apply: ${e instanceof Error ? e.message : String(e)}`, 'error');
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
          if (!(await other.Save())) {
            this.notify(`Could not clear the previous default "${other.Name}": ${other.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error');
            return;
          }
        }
      }
      const entity = await md.GetEntityObject<MJThemeEntity>('MJ: Themes');
      if (!(await entity.Load(row.id))) return;
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
        this.notify(`Duplicate failed: ${copy.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error');
      }
    } catch (e) {
      this.notify(`Duplicate failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      this.cdRef.detectChanges();
    }
  }

  /** Delete a theme after an explicit confirmation (MJConfirmService owns the dialog). */
  public async remove(row: ThemeRow): Promise<void> {
    if (row.builtIn) {
      this.notify('The built-in theme cannot be deleted.', 'info');
      return;
    }
    const confirmed = await this.confirmService.ConfirmDelete({
      title: 'Delete theme',
      message: `Delete "${row.name}"? This can't be undone.`,
    });
    if (!confirmed) {
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
        this.notify(`Delete failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error');
      }
    } catch (e) {
      this.notify(`Delete failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
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

  private notify(message: string, style: 'success' | 'error' | 'info' = 'success'): void {
    MJNotificationService.Instance.CreateSimpleNotification(message, style, 2500);
  }

  // ---------------------------------------------------------------
  // Agent context + tools (read / user-scoped only — see SAFETY BOUNDARY)
  // ---------------------------------------------------------------

  private summaryRows(): ThemeSummaryRow[] {
    return this.themes.map((t) => ({ ID: t.id, Name: t.name, Status: t.status, IsDefault: t.isDefault, BuiltIn: t.builtIn }));
  }

  private publishAgentContext(): void {
    this.navigationService.SetAgentContext(
      this,
      buildThemeManagerAgentContext({
        Themes: this.summaryRows(),
        AppliedThemeID: this.themeService.BrandOverlayId,
        StarredThemeIDs: this.themeService.GetStarredThemeIds(),
      })
    );
  }

  private registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'RefreshThemes',
        Description: 'Reload the saved brand themes list from the server.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          await this.loadData();
          return { Success: true, Data: { TotalThemeCount: this.themes.length } };
        },
      },
      {
        Name: 'ApplyTheme',
        Description: "Apply a saved brand theme to the CURRENT USER's workspace (a per-user preference — not the org default), referenced by ID or name (partial, case-insensitive match accepted).",
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
          const row = this.themes.find((t) => UUIDsEqual(t.id, resolved.value.ID));
          if (!row) {
            return { Success: false, ErrorMessage: 'Theme list changed — refresh and retry.' };
          }
          await this.applyToMe(row);
          return { Success: true, Data: { AppliedThemeName: resolved.value.Name } };
        },
      },
      {
        Name: 'StarTheme',
        Description: 'Star or unstar a theme for the current user (starred themes appear in the user menu), referenced by ID or name. Toggles when no explicit starred value is given.',
        ParameterSchema: {
          type: 'object',
          properties: {
            theme: { type: 'string', description: 'The theme ID or name.' },
            starred: { type: 'boolean', description: 'true to star, false to unstar; omit to toggle.' },
          },
          required: ['theme'],
        },
        Handler: async (params) => {
          const resolved = resolveThemeByIDOrName(this.summaryRows(), params['theme']);
          if (!resolved.ok) {
            return { Success: false, ErrorMessage: resolved.error };
          }
          const row = this.themes.find((t) => UUIDsEqual(t.id, resolved.value.ID));
          if (!row) {
            return { Success: false, ErrorMessage: 'Theme list changed — refresh and retry.' };
          }
          const wantStarred = typeof params['starred'] === 'boolean' ? params['starred'] : !row.starred;
          if (wantStarred !== row.starred) {
            await this.toggleStar(row);
          }
          return { Success: true, Data: { ThemeName: row.name, Starred: row.starred } };
        },
      },
    ]);
  }
}
