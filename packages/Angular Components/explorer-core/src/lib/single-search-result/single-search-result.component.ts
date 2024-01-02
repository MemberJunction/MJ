import { Component, EventEmitter, Input, Output, ViewChild, AfterViewInit } from '@angular/core';
import { RunViewParams } from '@memberjunction/core';
import { UserViewGridComponent } from '@memberjunction/ng-user-view-grid';

@Component({
  selector: 'app-single-search-result',
  templateUrl: './single-search-result.component.html',
  styleUrls: ['./single-search-result.component.css']
})
export class SingleSearchResultComponent implements AfterViewInit {
  @Input() public entity: string = '';
  @Input() public searchInput: string = '';
  @Output() public loadComplete: EventEmitter<any> = new EventEmitter<any>();
  @Output() public loadStarted: EventEmitter<any> = new EventEmitter<any>();
  @ViewChild(UserViewGridComponent) userViewGrid!: UserViewGridComponent

  public get params(): RunViewParams {
    const p: RunViewParams = {
      EntityName: this.entity,
      ExtraFilter: "ID > 0", // temporary hack as ExtraFilter is required for dynamic views
      UserSearchString: this.searchInput,
    }
    return p;
  }

  async ngAfterViewInit() {
    this.loadStarted.emit();
    await this.userViewGrid.Refresh(this.params);
    this.loadComplete.emit();
  }

}
