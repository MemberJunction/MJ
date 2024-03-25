import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { FileCategoryEntity } from '@memberjunction/core-entities';

import { kendoSVGIcon } from '@memberjunction/ng-shared';
import { ContextMenuSelectEvent } from '@progress/kendo-angular-menu';
import { TreeItemAddRemoveArgs } from '@progress/kendo-angular-treeview';

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
  public renameFileCategory: FileCategoryEntity | undefined;

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

  async handleDrop(e: TreeItemAddRemoveArgs) {
    console.log(e);
    const sourceCategory: FileCategoryEntity = e.sourceItem.item.dataItem;
    const targetCategory: FileCategoryEntity = e.destinationItem.item.dataItem;
    sourceCategory.ParentID = targetCategory.ID;

    this.isLoading = true;
    await sourceCategory.Save();
    this.isLoading = false;
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

  handleMenuSelect(e: ContextMenuSelectEvent) {
    if (e.item.text?.toLowerCase() === 'rename') {
      this.renameFileCategory = e.item.data;
    }
    console.log('action: ', e.item.text);
    console.log('renaem this one: ', e.item.data.Name);
    console.log('File categrory', e.item.data instanceof FileCategoryEntity);
  }

  cancelRename() {
    this.renameFileCategory?.Revert();
    this.renameFileCategory = undefined;
  }

  async saveRename() {
    this.isLoading = true;
    await this.renameFileCategory?.Save();
    this.renameFileCategory = undefined;
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
