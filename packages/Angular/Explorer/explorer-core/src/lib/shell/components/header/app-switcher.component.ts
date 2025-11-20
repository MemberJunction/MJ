import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';

/**
 * App switcher dropdown in the header.
 * Displays current app and allows switching between apps.
 */
@Component({
  selector: 'mj-app-switcher',
  standalone: true,
  imports: [CommonModule],
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
    return this.appManager.GetAllApps();
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
