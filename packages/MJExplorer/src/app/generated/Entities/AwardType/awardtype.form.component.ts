import { Component } from '@angular/core';
import { AwardTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAwardTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Award Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-awardtype-form',
    templateUrl: './awardtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AwardTypeFormComponent extends BaseFormComponent {
    public record!: AwardTypeEntity;
} 

export function LoadAwardTypeFormComponent() {
    LoadAwardTypeDetailsComponent();
}
