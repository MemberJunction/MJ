import { Component } from '@angular/core';
import { GiftsInKindEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGiftsInKindDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Gifts In Kinds') // Tell MemberJunction about this class
@Component({
    selector: 'gen-giftsinkind-form',
    templateUrl: './giftsinkind.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GiftsInKindFormComponent extends BaseFormComponent {
    public record!: GiftsInKindEntity;
} 

export function LoadGiftsInKindFormComponent() {
    LoadGiftsInKindDetailsComponent();
}
