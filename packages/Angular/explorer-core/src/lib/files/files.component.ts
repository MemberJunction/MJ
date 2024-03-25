import { Component } from '@angular/core';

@Component({
  selector: 'app-files',
  templateUrl: './files.component.html',
  styleUrls: ['./files.component.css'],
})
export class FilesComponent {
  public CategoryID: number | undefined;

  public categorySelected(newCategoryID: number) {
    this.CategoryID = newCategoryID;
  }
}
