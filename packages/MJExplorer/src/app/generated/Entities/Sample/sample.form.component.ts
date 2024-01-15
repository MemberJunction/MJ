import { Component } from '@angular/core';
import { SampleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadSampleDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Samples') // Tell MemberJunction about this class
@Component({
    selector: 'gen-sample-form',
    templateUrl: './sample.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SampleFormComponent extends BaseFormComponent {
    public record!: SampleEntity;
} 

export function LoadSampleFormComponent() {
    LoadSampleDetailsComponent();
}
