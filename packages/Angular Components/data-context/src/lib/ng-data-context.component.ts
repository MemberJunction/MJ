import { Component, Input, OnInit } from '@angular/core';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { DataContextEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'mj-data-context',
  templateUrl: './ng-data-context.component.html',
  styleUrls: ['./ng-data-context.component.css']
})
export class DataContextComponent implements OnInit {
  public showloader: boolean = false;
  @Input() dataContextId!: number;
  public dataContextRecord?: DataContextEntity;

  dataContextItems: any = [];
 
  ngOnInit(): void {
    if(this.dataContextId){
      this.showloader = true;
      this.LoadDataContext(this.dataContextId);
    }
  }

  async LoadDataContext(dataContextId: number) {
    if (dataContextId) {
      const md = new Metadata();
      this.dataContextRecord = await md.GetEntityObject<DataContextEntity>("Data Contexts");
      await this.dataContextRecord.Load(dataContextId);

      const rv = new RunView();
      const response = await rv.RunView(
        { 
          EntityName: "Data Context Items", 
          ExtraFilter: `DataContextID=${dataContextId}`,
          Fields: ["Type", "SQL", "ViewID", "QueryID", "EntityID", "RecordID"]
        });
      if(response.Success){
        this.dataContextItems = response.Results;
        this.showloader = false;
      } else {
        LogError(response.ErrorMessage);
        this.showloader = false;
      }
    }
  }
 
}
