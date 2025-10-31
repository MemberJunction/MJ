import { Component } from '@angular/core';
import { AdvertisingOptionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingOptionsDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Advertising Options') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingoptions-form',
    templateUrl: './advertisingoptions.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingOptionsFormComponent extends BaseFormComponent {
    public record!: AdvertisingOptionsEntity;
} 

export function LoadAdvertisingOptionsFormComponent() {
    LoadAdvertisingOptionsDetailsComponent();
}
