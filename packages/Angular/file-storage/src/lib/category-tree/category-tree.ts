import { Component, Input, OnInit } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { FileCategoryEntity } from '@memberjunction/core-entities';

import { kendoSVGIcon } from '@memberjunction/ng-shared';

 
@Component({
  selector: 'mj-files-category-tree',
  templateUrl: './category-tree.html',
  styleUrls: ['./category-tree.css'],
})
export class CategoryTreeComponent implements OnInit {
  @Input() EntityName!: string;
  @Input() BottomMargin: number = 0;

  public isLoading: boolean = false;

  public kendoSVGIcon = kendoSVGIcon;

  public categoriesData: FileCategoryEntity[] = [];

  constructor() {}

  ngOnInit(): void {
    this.Refresh();
  }

  async Refresh() {
    this.isLoading = true;

    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'File Categories',
      // ExtraFilter: `LEFT(Status, 1)<>'D'`, //'CategoryID=' + e.ID,
      ResultType: 'entity_object',
    });
    if (result.Success) {
      this.categoriesData = <FileCategoryEntity[]>result.Results;
    } else {
      throw new Error('Error loading file categories: ' + result.ErrorMessage);
    }
    this.isLoading = false;
  }
 
}
