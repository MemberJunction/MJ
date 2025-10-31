import { Component } from '@angular/core';
import { RatedItemTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRatedItemTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Rated Item Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-rateditemtype-form',
    templateUrl: './rateditemtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RatedItemTypeFormComponent extends BaseFormComponent {
    public record!: RatedItemTypeEntity;
} 

export function LoadRatedItemTypeFormComponent() {
    LoadRatedItemTypeDetailsComponent();
}
