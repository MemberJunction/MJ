import { Component } from '@angular/core';

/**
 * Placeholder component for future appearance settings.
 * Will include: theme selection, display density, font size.
 */
@Component({
  standalone: false,
  selector: 'mj-appearance-settings',
  templateUrl: './appearance-settings.component.html',
  styleUrls: ['./appearance-settings.component.css']
})
export class AppearanceSettingsComponent {
  // Future planned features
  PlannedFeatures = [
    {
      icon: 'fa-solid fa-moon',
      title: 'Theme',
      description: 'Switch between light, dark, or system theme'
    },
    {
      icon: 'fa-solid fa-text-height',
      title: 'Font Size',
      description: 'Adjust text size for better readability'
    },
    {
      icon: 'fa-solid fa-expand',
      title: 'Display Density',
      description: 'Choose between comfortable and compact layouts'
    }
  ];
}
