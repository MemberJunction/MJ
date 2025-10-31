import { Component } from '@angular/core';
import { CaseSatisfactionLevelEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseSatisfactionLevelDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Case Satisfaction Levels') // Tell MemberJunction about this class
@Component({
    selector: 'gen-casesatisfactionlevel-form',
    templateUrl: './casesatisfactionlevel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseSatisfactionLevelFormComponent extends BaseFormComponent {
    public record!: CaseSatisfactionLevelEntity;
} 

export function LoadCaseSatisfactionLevelFormComponent() {
    LoadCaseSatisfactionLevelDetailsComponent();
}
