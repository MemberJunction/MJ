import { Component } from '@angular/core';
import { WebGroupEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadWebGroupDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Web Groups') // Tell MemberJunction about this class
@Component({
    selector: 'gen-webgroup-form',
    templateUrl: './webgroup.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WebGroupFormComponent extends BaseFormComponent {
    public record!: WebGroupEntity;
} 

export function LoadWebGroupFormComponent() {
    LoadWebGroupDetailsComponent();
}
