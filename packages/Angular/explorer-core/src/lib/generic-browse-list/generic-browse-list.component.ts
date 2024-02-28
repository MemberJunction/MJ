import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router'
import { SharedService } from '@memberjunction/ng-shared';

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
  @Input() public iconName: string = 'view';
  @Input() public showAddButton: boolean = false;
  @Input() public addText: string = 'Create New';
  @Input() public backText: string = 'Go Back';
  @Output() public addButtonClickEvent: EventEmitter<any> = new EventEmitter<any>();
  @Output() public deleteButtonClickEvent: EventEmitter<any> = new EventEmitter<any>();
  @Output() public itemClickEvent: EventEmitter<any> = new EventEmitter<any>();

  constructor(public sharedService: SharedService, private router: Router) {
    this.router = router;
  }

  public itemClick(item: any) {
    if (item) {
      this.itemClickEvent.emit(item);
    }
  }

  public deleteItem(item: any){
    if(item){
      this.deleteButtonClickEvent.emit(item);
    }
  }

  public addButtonClicked() {
    this.addButtonClickEvent.emit();
  }

  public goHomeButtonClicked(){
    this.router.navigate(["dashboard"]);
  }
}
