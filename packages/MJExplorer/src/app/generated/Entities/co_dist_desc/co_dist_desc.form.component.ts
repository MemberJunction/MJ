import { Component } from '@angular/core';
import { co_dist_descEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { Loadco_dist_descDetailsComponent } from "./sections/details.component"
import { Loadco_dist_descTopComponent } from "./sections/top.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'County District Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-co_dist_desc-form',
    templateUrl: './co_dist_desc.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class co_dist_descFormComponent extends BaseFormComponent {
    public record!: co_dist_descEntity;
} 

export function Loadco_dist_descFormComponent() {
    Loadco_dist_descDetailsComponent();
    Loadco_dist_descTopComponent();
}
