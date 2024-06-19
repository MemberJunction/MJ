import { Component } from '@angular/core';
import { TemplateContentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTemplateContentTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Template Content Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-templatecontenttype-form',
    templateUrl: './templatecontenttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TemplateContentTypeFormComponent extends BaseFormComponent {
    public record!: TemplateContentTypeEntity;
} 

export function LoadTemplateContentTypeFormComponent() {
    LoadTemplateContentTypeDetailsComponent();
}
