import { Component } from '@angular/core';
import { DemoKeyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDemoKeyDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Demo Keys') // Tell MemberJunction about this class
@Component({
    selector: 'gen-demokey-form',
    templateUrl: './demokey.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DemoKeyFormComponent extends BaseFormComponent {
    public record!: DemoKeyEntity;
} 

export function LoadDemoKeyFormComponent() {
    LoadDemoKeyDetailsComponent();
}
