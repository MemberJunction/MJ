import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DashboardItem } from '../../single-dashboard.component';

@Component({
  standalone: false,
  selector: 'app-delete-item-dialog',
  templateUrl: './delete-item.component.html',
  styleUrls: ['./delete-item.component.css']
})
export class DeleteItemComponent implements OnInit {
  @Output() OnClose = new EventEmitter<any>();

  /**
   * @deprecated Use {@link OnClose}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (onClose) keeps working. Must stay AFTER OnClose: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() onClose = this.OnClose;
  @Output() RemoveDashboardItem = new EventEmitter<any>();

  /**
   * @deprecated Use {@link RemoveDashboardItem}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (removeDashboardItem) keeps working. Must stay AFTER RemoveDashboardItem: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() removeDashboardItem = this.RemoveDashboardItem;
  @Input() DashboardItem! : DashboardItem | null;

  /** @deprecated Use {@link DashboardItem}. */
  @Input() set dashboardItem(value: DashboardItem | null) {
    this.DashboardItem = value;
  }
  /** @deprecated Use {@link DashboardItem}. */
  get dashboardItem(): DashboardItem | null {
    return this.DashboardItem;
  }

  ngOnInit(): void {

  }

  public ConfirmDeleteItem(): void {
    if(this.DashboardItem){
      this.RemoveDashboardItem.emit(this.DashboardItem);
    }
    else{
      console.log("item is null");
    }

    this.OnClose.emit();
  }

  /** @deprecated Use {@link ConfirmDeleteItem}. */
  public confirmDeleteItem(): void {
    return this.ConfirmDeleteItem();
  }

  public CloseDialog(): void {
    this.OnClose.emit();
  }

  /** @deprecated Use {@link CloseDialog}. */
  public closeDialog(): void {
    return this.CloseDialog();
  }
}
