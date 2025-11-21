import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';

/**
 * App switcher dropdown in the header.
 * Displays current app and allows switching between apps.
 */
@Component({
  selector: 'mj-app-switcher',
  templateUrl: './app-switcher.component.html',
  styleUrls: ['./app-switcher.component.scss']
})
export class AppSwitcherComponent {
  @Input() activeApp: BaseApplication | null = null;
  @Output() appSelected = new EventEmitter<string>();

  showDropdown = false;

  constructor(private appManager: ApplicationManager) {}

  /**
   * Get all available applications
   */
  get apps(): BaseApplication[] {
    const apps = this.appManager.GetAllApps();
    // console.log('[AppSwitcher] Apps loaded:', apps.map(a => ({
    //   Name: a.Name,
    //   Color: a.Color,
    //   GetColor: a.GetColor(),
    //   Icon: a.Icon
    // })));
    return apps;
  }

  /**
   * Toggle dropdown visibility
   */
  toggleDropdown(): void {
    this.showDropdown = !this.showDropdown;
  }

  /**
   * Select an application
   */
  selectApp(app: BaseApplication): void {
    this.showDropdown = false;
    if (app.ID !== this.activeApp?.ID) {
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
}
