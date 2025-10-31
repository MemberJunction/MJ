import { Component } from '@angular/core';
import { GLAccountEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGLAccountDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'GL Accounts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-glaccount-form',
    templateUrl: './glaccount.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GLAccountFormComponent extends BaseFormComponent {
    public record!: GLAccountEntity;
} 

export function LoadGLAccountFormComponent() {
    LoadGLAccountDetailsComponent();
}
