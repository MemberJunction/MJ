import { Component } from '@angular/core';
import { AdvertisingFileTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingFileTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Advertising File Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingfiletype-form',
    templateUrl: './advertisingfiletype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingFileTypeFormComponent extends BaseFormComponent {
    public record!: AdvertisingFileTypeEntity;
} 

export function LoadAdvertisingFileTypeFormComponent() {
    LoadAdvertisingFileTypeDetailsComponent();
}
