import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router'
import { SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-generic-browser-list',
  templateUrl: './generic-browser-list.component.html',
  styleUrls: ['./generic-browser-list.component.css', '../../shared/first-tab-styles.css']
})
export class GenericBrowserListComponent {
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
  @Output() public createFolderClickEvent: EventEmitter<string> = new EventEmitter<string>();
  @Output() public createResourceClickEvent: EventEmitter<any> = new EventEmitter<any>();
  @Output() public backButtonClickEvent: EventEmitter<void> = new EventEmitter<void>();

  constructor(public sharedService: SharedService, private router: Router) {
    this.router = router;
  }

  public itemClick(item: any) {
    if (item) {
      console.log("item clicked");
      this.itemClickEvent.emit(item);
    }
  }

  public deleteItem(item: any){
    if(item){
      this.deleteButtonClickEvent.emit(item);
    }
  }

    //todo - let the parent component handle this?
  public addButtonClicked() {
    this.addButtonClickEvent.emit();
  }

  public createFolder(){
    this.createFolderClickEvent.emit("new folder");
  }

  public goHomeButtonClicked(){
    this.backButtonClickEvent.emit();
  }
}
