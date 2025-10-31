import { Component } from '@angular/core';
import { RatedItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRatedItemDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Rated Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-rateditem-form',
    templateUrl: './rateditem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RatedItemFormComponent extends BaseFormComponent {
    public record!: RatedItemEntity;
} 

export function LoadRatedItemFormComponent() {
    LoadRatedItemDetailsComponent();
}
