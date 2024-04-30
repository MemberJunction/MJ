import { Component } from '@angular/core';
import { EntityDocumentSettingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityDocumentSettingDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Document Settings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitydocumentsetting-form',
    templateUrl: './entitydocumentsetting.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityDocumentSettingFormComponent extends BaseFormComponent {
    public record!: EntityDocumentSettingEntity;
} 

export function LoadEntityDocumentSettingFormComponent() {
    LoadEntityDocumentSettingDetailsComponent();
}
