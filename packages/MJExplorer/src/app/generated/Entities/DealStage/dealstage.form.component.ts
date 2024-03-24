import { Component } from '@angular/core';
import { DealStageEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDealStageDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Deal Stages') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dealstage-form',
    templateUrl: './dealstage.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DealStageFormComponent extends BaseFormComponent {
    public record!: DealStageEntity;
} 

export function LoadDealStageFormComponent() {
    LoadDealStageDetailsComponent();
}
