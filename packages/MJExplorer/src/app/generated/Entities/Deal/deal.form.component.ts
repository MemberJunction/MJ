import { Component, OnInit } from '@angular/core';
import { DealEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDealDetailsComponent } from "./sections/details.component"
import { TimelineGroup } from '@memberjunction/ng-timeline';
import { RunView } from '@memberjunction/core';
@RegisterClass(BaseFormComponent, 'Deals') // Tell MemberJunction about this class
@Component({
    selector: 'gen-deal-form',
    templateUrl: './deal.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DealFormComponent extends BaseFormComponent {
    public record!: DealEntity;
    public timelineGroups: TimelineGroup[] = [];

    override async ngOnInit() {
        const rv = new RunView();
        const users = await rv.RunView({ 
            EntityName: 'Deals', 
            ResultType: 'entity_object' }
        );
        if (users && users.Success) {
            this.timelineGroups = [{
                EntityName: 'Deals',
                EntityObjects: users.Results,
                DateFieldName: 'CloseDate',
                TitleFieldName: "Deal Close Date",
                DisplayIconMode: "standard",
                DisplayColorMode: "auto",
                DisplayOrientation: "vertical",
                SummaryMode: "custom", 
                SummaryFunction: this.SummaryFunction
            },];
        ;
        }
    }
    public SummaryFunction(record: DealEntity): string {
        let title = record.Get('Title');
        let description = record.Get('Description');

        //If the description is null, just return the title. Else, return the title and description.
        if (!description) {
            return title;
        }
        else {
        return `${title}: ${description}`;
        }
    }
} 

export function LoadDealFormComponent() {
    LoadDealDetailsComponent();
}
