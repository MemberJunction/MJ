import { Component, OnInit } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { TimelineGroup } from '@memberjunction/ng-timeline';
import { RunView } from '@memberjunction/core';
import { AccountFormComponent } from 'src/app/generated/Entities/Account/account.form.component';
import { DealEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormComponent, 'Accounts') // Tell MemberJunction about this class
@Component({
    selector: 'demo-account-form',
    templateUrl: './account.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AccountFormComponent_Demo extends AccountFormComponent implements OnInit {

    public timelineGroups: TimelineGroup[] = [];

    override async ngOnInit() {
        const rv = new RunView();
        const deals = await rv.RunView<DealEntity>({ 
            EntityName: "Deals", 
            ExtraFilter: `AccountID = ${this.record.ID}`,
            ResultType: 'entity_object' 
        });

        if (deals && deals.Success) {
            this.timelineGroups =[
                {
                    EntityName: "Deals",
                    DateFieldName: "CreatedAt",
                    TitleFieldName: "Title",
                    DisplayColorMode: "auto",
                    DisplayIconMode: "standard",
                    EntityObjects: deals.Results,
                    SummaryMode: "field"
                }
            ];
        }
        else    
            alert('oh crap')
    }
} 

export function LoadAccountFormComponent() {
}
