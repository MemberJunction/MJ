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
export class UserFormComponent extends BaseFormComponent {
    public record!: UserEntity;
    public timelineGroups: TimelineGroup[] = [];

    async ngOnInit() {
        const rv = new RunView();
        const users = await rv.RunView({ 
            EntityName: 'Users', 
            ResultType: 'entity_object' }
        );
        if (users && users.Success) {
            this.timelineGroups = [{
                EntityName: 'Users',
                EntityObjects: users.Results,
                DateFieldName: 'CreatedAt',
                TitleFieldName: "Created User",
                DisplayIconMode: "standard",
                DisplayColorMode: "auto",
                SummaryMode: "none"
            },
            {
                EntityName: 'Users',
                EntityObjects: users.Results,
                DateFieldName: 'UpdatedAt',
                TitleFieldName: "Updated User",
                DisplayIconMode: "standard",
                DisplayColorMode: "auto",
                SummaryMode: "none"
            }];
        ;
        }
    }
} 

export function LoadUserFormComponent() {
    LoadUserDetailsComponent();
}
