import { Component } from '@angular/core';
import { ContentTypeAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContentTypeAttributeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Content Type Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contenttypeattribute-form',
    templateUrl: './contenttypeattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentTypeAttributeFormComponent extends BaseFormComponent {
    public record!: ContentTypeAttributeEntity;
} 

export function LoadContentTypeAttributeFormComponent() {
    LoadContentTypeAttributeDetailsComponent();
}
