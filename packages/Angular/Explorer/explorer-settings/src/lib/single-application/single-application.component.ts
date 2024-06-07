import { Component, OnInit, Input, ViewChild, ChangeDetectorRef } from '@angular/core';

import { Metadata } from '@memberjunction/core';
import { ApplicationEntity } from '@memberjunction/core-entities';
import { EntityFormDialogComponent } from '@memberjunction/ng-entity-form-dialog';

 
@Component({
  selector: 'mj-single-application',
  templateUrl: './single-application.component.html',
  styleUrls: ['./single-application.component.css']
})
export class SingleApplicationComponent implements OnInit {
  @Input() ApplicationName!: string;

  @ViewChild('entityForm') entityFormComponent!: EntityFormDialogComponent;

  public gridHeight: number = 750;
  public isLoading: boolean = false;
  public Record: ApplicationEntity | null = null;

  public showEntityEditingForm: boolean = false;

  constructor(private cdRef: ChangeDetectorRef) { 
  } 
      
  ngOnInit(): void {
    this.Refresh();
  }

  protected async Refresh() {
    if (this.ApplicationName && this.ApplicationName.length > 0) {
      this.isLoading = true;
      const md = new Metadata();
      let a = md.Applications.find(a => a.Name === this.ApplicationName);
      if (!a) {
        // sometime we are creating a new role, so attempt to refresh our metadata
        await md.Refresh();
        a = md.Applications.find(aa => aa.Name === this.ApplicationName);
        if (!a)
          throw new Error(`Application ${this.ApplicationName} not found`);
      }
      this.Record = await md.GetEntityObject<ApplicationEntity>('Applications');
      await this.Record.Load(a.ID);      
    }
    this.isLoading = false;
  }
 

  public async EditRecord() {
    // show the dialog
    this.showEntityEditingForm = true;
  }

  public async onEntityFormClosed(result: 'Save' | 'Cancel') {
    this.showEntityEditingForm = false;
  }    
}
