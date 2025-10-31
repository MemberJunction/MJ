import { Component } from '@angular/core';
import { AdInsertionOrderOptionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdInsertionOrderOptionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Ad Insertion Order Options') // Tell MemberJunction about this class
@Component({
    selector: 'gen-adinsertionorderoption-form',
    templateUrl: './adinsertionorderoption.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdInsertionOrderOptionFormComponent extends BaseFormComponent {
    public record!: AdInsertionOrderOptionEntity;
} 

export function LoadAdInsertionOrderOptionFormComponent() {
    LoadAdInsertionOrderOptionDetailsComponent();
}
