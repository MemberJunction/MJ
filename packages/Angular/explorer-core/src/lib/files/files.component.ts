import { Component } from '@angular/core';

@Component({
  selector: 'app-files',
  templateUrl: './files.component.html',
  styleUrls: ['./files.component.css']
})
export class FilesComponent {
  public currentItem: 'EntityPermissions' | 'Users' | 'Roles' = 'EntityPermissions';

  public selectItem(item: 'EntityPermissions' | 'Users' | 'Roles') {
    this.currentItem = item;
  }
}
