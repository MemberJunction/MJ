import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseNavigationComponent } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-files',
  templateUrl: './files.component.html',
  styleUrls: ['./files.component.css'],
})
@RegisterClass(BaseNavigationComponent, 'Files')
export class FilesComponent extends BaseNavigationComponent {
  public CategoryID: string | undefined;

  public categorySelected(newCategoryID: string | undefined) {
    this.CategoryID = newCategoryID;
  }

  constructor() {
    super();
  }
}
