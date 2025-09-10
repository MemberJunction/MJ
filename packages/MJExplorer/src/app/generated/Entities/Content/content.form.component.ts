import { Component } from '@angular/core';
import { ContentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContentDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Contents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-content-form',
    templateUrl: './content.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentFormComponent extends BaseFormComponent {
    public record!: ContentEntity;
} 

export function LoadContentFormComponent() {
    LoadContentDetailsComponent();
}
