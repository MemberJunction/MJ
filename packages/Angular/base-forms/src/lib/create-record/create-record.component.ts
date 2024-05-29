import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router'
import { SharedService } from '@memberjunction/ng-shared';
import { BaseEntity, LogError, Metadata } from '@memberjunction/core';


@Component({
  selector: 'create-record-dialog',
  templateUrl: './create-record.component.html',
  styleUrls: ['./create-record.component.css']
})
export class CreateRecordComponent implements OnInit {
    @Input() EntityObjectName: string = "";

    public showDialog: boolean = false;
    public showLoader: boolean = false;
    public record!: BaseEntity;
    public createNewDialogTitle: string = 'Create New Record';

    constructor(private router: Router){}

    async ngOnInit(): Promise<void> {
    }

    public toggleCreateDialog(show: boolean): void {
        this.showDialog = show;
        if(show){
            this.createNewRecord();
        }
    }

    private async createNewRecord(): Promise<void> {
        if(!this.EntityObjectName){
            LogError('createNewRecord: EntityObjectName is not set');
            return;
        }

        if(!this.record){
            const md: Metadata = new Metadata();
            this.record = await md.GetEntityObject(this.EntityObjectName);
        }

        this.record.NewRecord();
    }
    
    public async saveNewRecord(): Promise<void> {
        if(!this.record){
            LogError('saveNewRecord: record is not set');
            return;
        }

        this.showLoader = true;

        try{
            let saveResult: boolean = await this.record.Save();
            if(saveResult){
                this.toggleCreateDialog(false);
                SharedService.Instance.CreateSimpleNotification(`Successfully created new ${this.EntityObjectName} record`, 'success', 1000);
                this.router.navigate(['resource', 'record', this.record.CompositeKey.ToURLSegment()], { queryParams: { Entity: this.EntityObjectName } });
            }
            else{
                SharedService.Instance.CreateSimpleNotification(`Failed to create new ${this.EntityObjectName} record`, 'error', 1000);
            }
        }
        catch(ex: any){
            let error:  {Success: boolean, Errors: {Message: string, Source: string, Type: string, Value: any}[]} = ex;
            SharedService.Instance.CreateSimpleNotification(error?.Errors[0]?.Message, 'error', 1000);
            LogError('saveNewRecord: failed to save record');
            LogError(ex);
        }

        this.showLoader = false;
    }
}