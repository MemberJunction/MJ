import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { ThemeService, ThemeDefinition } from '@memberjunction/ng-shared-generic';

/**
 * A selectable theme option shown in the picker — one per registered theme, plus a
 * synthetic "System" option that follows the OS setting.
 */
interface ThemeOption {
  /** Registered theme id, or the literal 'system' for OS auto-detect. */
  Id: string;
  Name: string;
  Description?: string;
  Icon: string;
  PreviewColors?: string[];
}

/**
 * Appearance settings — a real, functional theme picker.
 *
 * MJ's theming system (light / dark / registered custom themes + a "system" auto-detect
 * mode) is fully implemented in `ThemeService`; this panel simply exposes it in Settings
 * (it was previously a "Coming Soon" placeholder). Selecting a theme persists the choice
 * per-user via `ThemeService.SetTheme`, which writes to `MJ: User Settings` and applies it
 * immediately across the app. The same preference is honored by the avatar-menu theme
 * switcher, so the two stay in sync through the shared `Preference$` stream.
 */
@Component({
  standalone: false,
  selector: 'mj-appearance-settings',
  templateUrl: './appearance-settings.component.html',
  styleUrls: ['./appearance-settings.component.css']
})
export class AppearanceSettingsComponent implements OnInit, OnDestroy {
  private themeService = inject(ThemeService);
  private preferenceSub?: Subscription;

  /** The theme cards rendered in the picker (registered themes + a System option). */
  public ThemeOptions: ThemeOption[] = [];

  /** The currently-selected preference — a theme id or 'system'. Kept in sync reactively. */
  public SelectedPreference = 'system';

  ngOnInit(): void {
    this.ThemeOptions = this.buildThemeOptions();
    this.SelectedPreference = this.themeService.Preference;
    // Stay in sync if the theme is changed elsewhere (e.g. the avatar-menu switcher).
    this.preferenceSub = this.themeService.Preference$.subscribe(p => (this.SelectedPreference = p));
  }

  ngOnDestroy(): void {
    this.preferenceSub?.unsubscribe();
  }

  /** Apply and persist the chosen theme. */
  public async SelectTheme(id: string): Promise<void> {
    await this.themeService.SetTheme(id);
  }

  public IsSelected(id: string): boolean {
    return this.SelectedPreference === id;
  }

  private buildThemeOptions(): ThemeOption[] {
    const options: ThemeOption[] = this.themeService.AvailableThemes.map(t => ({
      Id: t.Id,
      Name: t.Name,
      Description: t.Description,
      Icon: this.iconForTheme(t),
      PreviewColors: t.PreviewColors
    }));
    // Append a "System" option that auto-detects the OS light/dark preference,
    // mirroring the avatar-menu theme switcher.
    options.push({
      Id: 'system',
      Name: 'System',
      Description: 'Follow your operating system setting',
      Icon: 'fa-solid fa-desktop'
    });
    return options;
  }

  private iconForTheme(theme: ThemeDefinition): string {
    if (theme.IsBuiltIn) {
      return theme.Id === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    }
    // Custom themes: hint at their base with the moon/sun, else a generic palette.
    return theme.BaseTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-palette';
  }
}
