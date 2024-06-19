import { Component } from '@angular/core';
import { TemplateContentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTemplateContentDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Template Contents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-templatecontent-form',
    templateUrl: './templatecontent.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TemplateContentFormComponent extends BaseFormComponent {
    public record!: TemplateContentEntity;
} 

export function LoadTemplateContentFormComponent() {
    LoadTemplateContentDetailsComponent();
}
