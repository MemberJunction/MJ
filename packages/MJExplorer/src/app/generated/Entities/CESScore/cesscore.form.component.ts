import { Component } from '@angular/core';
import { CESScoreEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCESScoreDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'CES Scores') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cesscore-form',
    templateUrl: './cesscore.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CESScoreFormComponent extends BaseFormComponent {
    public record!: CESScoreEntity;
} 

export function LoadCESScoreFormComponent() {
    LoadCESScoreDetailsComponent();
}
