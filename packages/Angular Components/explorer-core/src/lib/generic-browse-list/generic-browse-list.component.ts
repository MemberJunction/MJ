import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router'

@Component({
  selector: 'app-generic-browse-list',
  templateUrl: './generic-browse-list.component.html',
  styleUrls: ['./generic-browse-list.component.css', '../../shared/first-tab-styles.css']
})
export class GenericBrowseListComponent {
  @Input() public showLoader: boolean = true;
  @Input() public itemType: string = '';
  @Input() public title: string = '';
  @Input() public items: any[] = [];
  @Input() public iconName: string = 'view-icon';
  @Input() public showAddButton: boolean = false;
  @Input() public addText: string = 'Add';
  @Output() public addButtonClickEvent: EventEmitter<any> = new EventEmitter<any>();
  @Output() public itemClickEvent: EventEmitter<any> = new EventEmitter<any>();

  constructor(private router: Router) {}

  public itemClick(item: any) {
    if (item) {
      this.itemClickEvent.emit(item);
    }
  }
  public addButtonClicked() {
    this.addButtonClickEvent.emit();
  }
}
