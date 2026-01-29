import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RunViewParams } from '@memberjunction/core';

@Component({
  selector: 'mj-single-search-result',
  templateUrl: './single-search-result.component.html',
  styleUrls: ['./single-search-result.component.css']
})
export class SingleSearchResultComponent {
  @Input() public entity: string = '';
  @Input() public searchInput: string = '';
  @Output() public loadComplete: EventEmitter<any> = new EventEmitter<any>();
  @Output() public loadStarted: EventEmitter<any> = new EventEmitter<any>();

  public get params(): RunViewParams {
    const p: RunViewParams = {
      EntityName: this.entity,
      ExtraFilter: "ID IS NOT NULL", // temporary hack as ExtraFilter is required for dynamic views
      UserSearchString: this.searchInput,
    }
    return p;
  }
 

}
