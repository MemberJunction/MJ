import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router'
import { SharedService } from '@memberjunction/ng-shared';
import { BaseEntity, LogError, Metadata,  } from '@memberjunction/core';


@Component({
  selector: 'create-record-dialog',
  templateUrl: './create-record-component.html',
  styleUrls: ['./create-record-component.css']
})
export class CreateRecordComponent implements OnInit {
    @Input() EntityObjectName: string = "";

    public showDialog: boolean = false;
    public showLoader: boolean = false;
    public record!: BaseEntity;
    public createNewDialogTitle: string = 'Create New Record';

    constructor(private router: Router, private sharedService: SharedService) {}

    async ngOnInit(): Promise<void> {
        if(this.EntityObjectName){
            const md: Metadata = new Metadata();
            this.createNewDialogTitle = `Create New ${this.EntityObjectName} Record`;
            this.record = await md.GetEntityObject(this.EntityObjectName);
            if(this.record){
                this.record.NewRecord();
            }
        }
        else{
            LogError('CreateRecordComponent: EntityObjectName is not set');
        }
    }

    public toggleCreateDialog(show: boolean): void {
        this.showLoader = show;
    }

    public async createNewRecord(): Promise<void> {
        if(!this.record){
            return;
        }

        const md: Metadata = new Metadata();
        this.record = await md.GetEntityObject(this.EntityObjectName);
        this.record.NewRecord();
    }
    
    public async saveNewRecord(): Promise<void> {
        this.showLoader = true;
        let saveResult: boolean = await this.record.Save();
        if(saveResult){
            this.toggleCreateDialog(false);
            SharedService.Instance.CreateSimpleNotification(`Successfully created new ${this.EntityObjectName} record`, 'success', 1000);
            this.router.navigate(['resource', 'record', this.record.CompositeKey.ToURLSegment()], { queryParams: { Entity: this.EntityObjectName } });
        }
        else{
            SharedService.Instance.CreateSimpleNotification(`Failed to create new ${this.EntityObjectName} record`, 'error', 1000);
        }

        this.showLoader = false;
    }
}