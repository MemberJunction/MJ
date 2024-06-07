import { Component, OnInit, Input, ViewChild, ChangeDetectorRef } from '@angular/core';

import { Metadata, RunViewParams } from '@memberjunction/core';
import { UserEntity } from '@memberjunction/core-entities';
import { EntityFormDialogComponent } from '@memberjunction/ng-entity-form-dialog';

 
@Component({
  selector: 'mj-single-user',
  templateUrl: './single-user.component.html',
  styleUrls: ['./single-user.component.css']
})
export class SingleUserComponent implements OnInit {
  @Input() UserID!: number;

  @ViewChild('entityForm') entityFormComponent!: EntityFormDialogComponent;

  public gridHeight: number = 750;
  public isLoading: boolean = false;
  public UserRecord: UserEntity | null = null;
  public UserViewsParams: RunViewParams | undefined;
  public showEntityEditingForm: boolean = false;

  constructor(private cdRef: ChangeDetectorRef) { 
  } 
      
  ngOnInit(): void {
    this.Refresh();
  }

  protected async Refresh() {
    if (this.UserID > 0) {
        const md = new Metadata();
        this.UserRecord = await md.GetEntityObject<UserEntity>('Users');
        await this.UserRecord.Load(this.UserID);      
        this.UserViewsParams = {
            EntityName: 'User Views',
            ExtraFilter: `UserID = ${this.UserID}`,
        };
    }
  }
 

  public async EditRecord() {
    // show the dialog
    this.showEntityEditingForm = true;
  }

  public async onEntityFormClosed(result: 'Save' | 'Cancel') {
    this.showEntityEditingForm = false;
  }    
}
