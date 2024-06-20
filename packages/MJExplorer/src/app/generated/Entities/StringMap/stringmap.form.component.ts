import { Component } from '@angular/core';
import { StringMapEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadStringMapDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'String Maps') // Tell MemberJunction about this class
@Component({
    selector: 'gen-stringmap-form',
    templateUrl: './stringmap.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class StringMapFormComponent extends BaseFormComponent {
    public record!: StringMapEntity;
} 

export function LoadStringMapFormComponent() {
    LoadStringMapDetailsComponent();
}
