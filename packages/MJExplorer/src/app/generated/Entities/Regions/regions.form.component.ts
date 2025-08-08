import { Component } from '@angular/core';
import { RegionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRegionsDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Regions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-regions-form',
    templateUrl: './regions.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RegionsFormComponent extends BaseFormComponent {
    public record!: RegionsEntity;
} 

export function LoadRegionsFormComponent() {
    LoadRegionsDetailsComponent();
}
