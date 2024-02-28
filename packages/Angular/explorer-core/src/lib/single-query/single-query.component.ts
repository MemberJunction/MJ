import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { LogError, Metadata, RunQuery } from '@memberjunction/core';
import { QueryEntity } from '@memberjunction/core-entities';
import { QueryGridComponent } from '@memberjunction/ng-query-grid';

@Component({
  selector: 'app-single-query',
  templateUrl: './single-query.component.html',
  styleUrls: ['./single-query.component.css']
})
export class SingleQueryComponent implements OnInit {
  @Input() queryId!: number;  
  @Output() public loadComplete: EventEmitter<any> = new EventEmitter<any>();
  @Output() public loadStarted: EventEmitter<any> = new EventEmitter<any>();

  @ViewChild('theQuery', { static: true }) theQuery!: QueryGridComponent;

  public queryEntity!: QueryEntity;

  public queryData!: any[];
 
  ngOnInit(): void {
    this.doLoad();
  }
  async doLoad(): Promise<void> {
    try {
      // get info on the report we are loading
      this.loadStarted.emit();
      const md = new Metadata();
      this.queryEntity = await md.GetEntityObject<QueryEntity>('Queries');
      await this.queryEntity.Load(this.queryId);

      const runReport = new RunQuery();
      const result = await runReport.RunQuery({QueryID: this.queryId});
      if (result && result.Success && result.Results.length > 0) {
        this.queryData = result.Results;
      }
      this.loadComplete.emit();
    }
    catch (err) {
      LogError(err);
    }
  }


}




























