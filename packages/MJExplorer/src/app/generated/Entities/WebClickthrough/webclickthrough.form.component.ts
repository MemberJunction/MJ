import { Component } from '@angular/core';
import { WebClickthroughEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadWebClickthroughDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Web Clickthroughs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-webclickthrough-form',
    templateUrl: './webclickthrough.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WebClickthroughFormComponent extends BaseFormComponent {
    public record!: WebClickthroughEntity;
} 

export function LoadWebClickthroughFormComponent() {
    LoadWebClickthroughDetailsComponent();
}
