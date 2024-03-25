import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { FileCategoryEntity } from '@memberjunction/core-entities';

import { kendoSVGIcon } from '@memberjunction/ng-shared';

@Component({
  selector: 'mj-files-category-tree',
  templateUrl: './category-tree.html',
  styleUrls: ['./category-tree.css'],
})
export class CategoryTreeComponent implements OnInit {
  @Output() categorySelected = new EventEmitter<number>();

  public isLoading: boolean = false;
  public showNew: boolean = false;
  public newCategoryName = '';

  public kendoSVGIcon = kendoSVGIcon;

  public categoriesData: FileCategoryEntity[] = [];

  private md = new Metadata();

  constructor() {}

  ngOnInit(): void {
    this.Refresh();
  }

  async createNewCategory() {
    this.showNew = true;
  }

  cancelNewCategory() {
    this.showNew = false;
  }

  async saveNewCategory() {
    this.isLoading = true;
    const categoryEntity: FileCategoryEntity = await this.md.GetEntityObject('File Categories');
    categoryEntity.NewRecord();
    categoryEntity.Name = this.newCategoryName;
    await categoryEntity?.Save();
    this.categoriesData = [...this.categoriesData, categoryEntity];
    this.showNew = false;
    this.isLoading = false;
  }

  async Refresh() {
    this.isLoading = true;

    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'File Categories',
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
