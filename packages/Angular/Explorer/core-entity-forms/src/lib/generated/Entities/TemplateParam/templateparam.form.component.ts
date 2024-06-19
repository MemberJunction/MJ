import { Component } from '@angular/core';
import { TemplateParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTemplateParamDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Template Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-templateparam-form',
    templateUrl: './templateparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TemplateParamFormComponent extends BaseFormComponent {
    public record!: TemplateParamEntity;
} 

export function LoadTemplateParamFormComponent() {
    LoadTemplateParamDetailsComponent();
}
