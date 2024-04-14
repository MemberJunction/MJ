import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { FileCategoryEntity } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';

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
  public selectedKeys = [];
  public renameFileCategory: FileCategoryEntity | undefined;

  public categoriesData: FileCategoryEntity[] = [];

  private md = new Metadata();

  constructor(private sharedService: SharedService) {}

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

  async deleteCategory(fileCategory: FileCategoryEntity) {
    this.isLoading = true;
    const { ID } = fileCategory;
    const success = await fileCategory.Delete();
    if (!success) {
      console.error('Unable to delete file category', fileCategory);
      this.sharedService.CreateSimpleNotification(`Unable to delete category '${fileCategory.Name}'`, 'error');
      return;
    }

    this.categoriesData = this.categoriesData.filter((c) => c.ID !== ID);
    this.clearSelection();
    this.isLoading = false;
  }

  clearSelection() {
    this.selectedKeys = [];
    this.categorySelected.emit(undefined);
  }

  handleMenuSelect(e: ContextMenuSelectEvent) {
    const action = e.item?.text?.toLowerCase() ?? '';
    switch (action) {
      case 'rename':
        this.renameFileCategory = e.item.data;
        break;

      case 'delete':
        this.deleteCategory(e.item.data);
        break;

      default:
        break;
    }
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
