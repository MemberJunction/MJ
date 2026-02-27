import { Component, Input, Output, EventEmitter, HostListener, ViewChild } from '@angular/core';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { UserAppConfigComponent } from '@memberjunction/ng-explorer-settings';

/**
 * App switcher dropdown in the header.
 * Displays current app and allows switching between apps.
 */
@Component({
  standalone: false,
  selector: 'mj-app-switcher',
  templateUrl: './app-switcher.component.html',
  styleUrls: ['./app-switcher.component.css']
})
export class AppSwitcherComponent {
  @Input() activeApp: BaseApplication | null = null;
  @Input() isViewingSystemTab = false;
  /** ID of the app currently being loaded (shows loading indicator) */
  @Input() loadingAppId: string | null = null;
  @Output() appSelected = new EventEmitter<string>();

  @ViewChild('appConfigDialog') appConfigDialog!: UserAppConfigComponent;

  showDropdown = false;
  showConfigDialog = false;

  constructor(private appManager: ApplicationManager) {}

  /**
   * Check if the app switcher should show loading state
   */
  get isLoading(): boolean {
    return this.loadingAppId !== null;
  }

  /**
   * Get applications that should appear in the app switcher dropdown
   * (NavigationStyle = 'App Switcher' or 'Both')
   */
  get apps(): BaseApplication[] {
    return this.appManager.GetAppSwitcherApps();
  }

  /**
   * Toggle dropdown visibility
   */
  toggleDropdown(): void {
    this.showDropdown = !this.showDropdown;
  }

  /**
   * Select an application
   * When viewing a system tab, always emit to allow returning to the app
   */
  selectApp(app: BaseApplication): void {
    this.showDropdown = false;
    if (app.ID !== this.activeApp?.ID || this.isViewingSystemTab) {
      this.appSelected.emit(app.ID);
    }
  }

  /**
   * Close dropdown when clicking outside
   */
  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.app-switcher-container') && this.showDropdown) {
      this.showDropdown = false;
    }
  }

  /**
   * Open the app configuration dialog
   */
  openConfigDialog(): void {
    this.showDropdown = false;
    this.showConfigDialog = true;
    // Use setTimeout to ensure ViewChild is available
    setTimeout(() => {
      if (this.appConfigDialog) {
        this.appConfigDialog.Open();
      }
    }, 0);
  }

  /**
   * Handle when config is saved - reload the app list
   */
  onConfigSaved(): void {
    // The ApplicationManager will be refreshed by the dialog
    // Force a re-render by triggering change detection
    this.showConfigDialog = false;
  }
}
