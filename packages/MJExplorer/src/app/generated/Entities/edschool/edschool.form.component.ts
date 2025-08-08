import { Component } from '@angular/core';
import { edschoolEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadedschoolDetailsComponent } from "./sections/details.component"
import { LoadedschoolTopComponent } from "./sections/top.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Schools') // Tell MemberJunction about this class
@Component({
    selector: 'gen-edschool-form',
    templateUrl: './edschool.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class edschoolFormComponent extends BaseFormComponent {
    public record!: edschoolEntity;
} 

export function LoadedschoolFormComponent() {
    LoadedschoolDetailsComponent();
    LoadedschoolTopComponent();
}
