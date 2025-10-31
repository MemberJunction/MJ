import { Component } from '@angular/core';
import { PledgeStageEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPledgeStageDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Pledge Stages') // Tell MemberJunction about this class
@Component({
    selector: 'gen-pledgestage-form',
    templateUrl: './pledgestage.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PledgeStageFormComponent extends BaseFormComponent {
    public record!: PledgeStageEntity;
} 

export function LoadPledgeStageFormComponent() {
    LoadPledgeStageDetailsComponent();
}
