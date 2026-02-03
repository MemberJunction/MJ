import { Component } from '@angular/core';

/**
 * Container component for the General settings tab.
 * Wraps Profile Information and Account Info sections.
 */
@Component({
  selector: 'mj-general-settings',
  templateUrl: './general-settings.component.html',
  styleUrls: ['./general-settings.component.css']
})
export class GeneralSettingsComponent {
  // Section expansion state
  ProfileExpanded = true;
  AccountExpanded = true;

  ToggleProfile(): void {
    this.ProfileExpanded = !this.ProfileExpanded;
  }

  ToggleAccount(): void {
    this.AccountExpanded = !this.AccountExpanded;
  }
}
