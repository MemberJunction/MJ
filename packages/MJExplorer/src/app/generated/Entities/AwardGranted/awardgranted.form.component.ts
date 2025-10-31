import { Component } from '@angular/core';
import { AwardGrantedEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAwardGrantedDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Award Granteds') // Tell MemberJunction about this class
@Component({
    selector: 'gen-awardgranted-form',
    templateUrl: './awardgranted.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AwardGrantedFormComponent extends BaseFormComponent {
    public record!: AwardGrantedEntity;
} 

export function LoadAwardGrantedFormComponent() {
    LoadAwardGrantedDetailsComponent();
}
