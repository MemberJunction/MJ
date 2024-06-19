import { Component } from '@angular/core';
import { TemplateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTemplateDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Templates') // Tell MemberJunction about this class
@Component({
    selector: 'gen-template-form',
    templateUrl: './template.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TemplateFormComponent extends BaseFormComponent {
    public record!: TemplateEntity;
} 

export function LoadTemplateFormComponent() {
    LoadTemplateDetailsComponent();
}
