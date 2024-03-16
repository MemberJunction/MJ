import { Component } from '@angular/core';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent {
  public currentItem: 'EntityPermissions' | 'Users' | 'Roles' = 'EntityPermissions';

  public selectItem(item: 'EntityPermissions' | 'Users' | 'Roles') {
    this.currentItem = item;
  }
}
