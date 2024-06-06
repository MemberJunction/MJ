import { Component, OnInit } from '@angular/core';
import { UserEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadUserDetailsComponent } from "./sections/details.component"
import { TimelineGroup } from '@memberjunction/ng-timeline';
import { RunView } from '@memberjunction/core';

@RegisterClass(BaseFormComponent, 'Users') // Tell MemberJunction about this class
@Component({
    selector: 'gen-user-form',
    templateUrl: './user.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserFormComponent extends BaseFormComponent implements OnInit {
    public record!: UserEntity;

    public TestGroups: TimelineGroup[] = [
         
    ]

    async ngOnInit() {
        const rv = new RunView();
        const deals = await rv.RunView(
            {
                EntityName: "Deals",
                ExtraFilter: "CloseDate IS NOT NULL AND CloseDate > '2021-01-01'",
                ResultType: "entity_object"
            }
        )
        if (deals && deals.Success)
            this.TestGroups = [
                {
                    EntityName: "Deals",
                    EntityObjects: deals.Results,
                    DateFieldName: 'CloseDate',
                    TitleFieldName: "Title",
                    DisplayIconMode: "standard",
                    DisplayColorMode: "auto",
                    SummaryMode: "none"
                }
            
            ];
    }
} 

export function LoadUserFormComponent() {
    LoadUserDetailsComponent();
}
