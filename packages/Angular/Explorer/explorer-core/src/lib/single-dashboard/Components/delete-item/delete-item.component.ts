import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DashboardItem } from '../../single-dashboard.component';

@Component({
  standalone: false,
  selector: 'app-delete-item-dialog',
  templateUrl: './delete-item.component.html',
  styleUrls: ['./delete-item.component.css']
})
export class DeleteItemComponent implements OnInit {
  @Output() onClose = new EventEmitter<any>();
  @Output() removeDashboardItem = new EventEmitter<any>();
  @Input() dashboardItem! : DashboardItem | null;

  ngOnInit(): void {

  }

  public confirmDeleteItem(): void {
    if(this.dashboardItem){
      this.removeDashboardItem.emit(this.dashboardItem);
    }
    else{
      console.log("item is null");
    }

    this.onClose.emit();
  }

  public closeDialog(): void {
    this.onClose.emit();
  }
}
