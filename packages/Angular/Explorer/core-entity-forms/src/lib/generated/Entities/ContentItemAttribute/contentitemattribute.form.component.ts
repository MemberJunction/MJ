import { Component } from '@angular/core';
import { ContentItemAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContentItemAttributeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Content Item Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentitemattribute-form',
    templateUrl: './contentitemattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentItemAttributeFormComponent extends BaseFormComponent {
    public record!: ContentItemAttributeEntity;
} 

export function LoadContentItemAttributeFormComponent() {
    LoadContentItemAttributeDetailsComponent();
}
