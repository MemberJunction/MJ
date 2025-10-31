import { Component } from '@angular/core';
import { WebUserActivityEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadWebUserActivityDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Web User Activities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-webuseractivity-form',
    templateUrl: './webuseractivity.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WebUserActivityFormComponent extends BaseFormComponent {
    public record!: WebUserActivityEntity;
} 

export function LoadWebUserActivityFormComponent() {
    LoadWebUserActivityDetailsComponent();
}
