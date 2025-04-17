import { Component } from '@angular/core';
import { JobTitleSeedEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadJobTitleSeedDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Job Title Seeds') // Tell MemberJunction about this class
@Component({
    selector: 'gen-jobtitleseed-form',
    templateUrl: './jobtitleseed.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class JobTitleSeedFormComponent extends BaseFormComponent {
    public record!: JobTitleSeedEntity;
} 

export function LoadJobTitleSeedFormComponent() {
    LoadJobTitleSeedDetailsComponent();
}
