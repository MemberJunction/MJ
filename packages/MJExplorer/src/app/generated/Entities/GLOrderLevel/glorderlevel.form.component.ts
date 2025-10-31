import { Component } from '@angular/core';
import { GLOrderLevelEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGLOrderLevelDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'GL Order Levels') // Tell MemberJunction about this class
@Component({
    selector: 'gen-glorderlevel-form',
    templateUrl: './glorderlevel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GLOrderLevelFormComponent extends BaseFormComponent {
    public record!: GLOrderLevelEntity;
} 

export function LoadGLOrderLevelFormComponent() {
    LoadGLOrderLevelDetailsComponent();
}
