import { Component } from '@angular/core';
import { crsassgnEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadcrsassgnTopComponent } from "./sections/top.component"
import { LoadcrsassgnDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Course Descriptions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-crsassgn-form',
    templateUrl: './crsassgn.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class crsassgnFormComponent extends BaseFormComponent {
    public record!: crsassgnEntity;
} 

export function LoadcrsassgnFormComponent() {
    LoadcrsassgnTopComponent();
    LoadcrsassgnDetailsComponent();
}
