import { Component, Input, OnInit } from '@angular/core';
import { IMetadataProvider, IRunViewProvider, LogError, Metadata, RunView } from '@memberjunction/core';
import { DataContextEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'mj-data-context',
  templateUrl: './ng-data-context.component.html',
  styleUrls: ['./ng-data-context.component.css']
})
export class DataContextComponent implements OnInit {
  @Input() dataContextId!: string;
  @Input() Provider: IMetadataProvider | null = null;
 
  public dataContextRecord?: DataContextEntity;
  public dataContextItems: any = [];
  public showLoader: boolean = false;

  public get ProviderToUse(): IMetadataProvider {
    return this.Provider || Metadata.Provider;
  }

  ngOnInit(): void {
    if(this.dataContextId){
      this.showLoader = true;
      this.LoadDataContext(this.dataContextId);
    }
  }

  async LoadDataContext(dataContextId: string) {
    if (dataContextId) {
      const p = this.ProviderToUse;
      this.dataContextRecord = await p.GetEntityObject<DataContextEntity>("Data Contexts", p.CurrentUser);
      await this.dataContextRecord.Load(dataContextId);

      const rv = new RunView(<IRunViewProvider><any>p);
      const response = await rv.RunView(
        { 
          EntityName: "Data Context Items", 
          ExtraFilter: `DataContextID='${dataContextId}'`,
          Fields: ["Type", "SQL", "ViewID", "QueryID", "EntityID", "RecordID"]
        });
      if(response.Success){
        this.dataContextItems = response.Results;
        this.showLoader = false;
      } else {
        LogError(response.ErrorMessage);
        this.showLoader = false;
      }
    }
  }
 
}
