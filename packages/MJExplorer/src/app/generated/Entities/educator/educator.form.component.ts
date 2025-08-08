import { Component } from '@angular/core';
import { educatorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadeducatorDetailsComponent } from "./sections/details.component"
import { LoadeducatorTopComponent } from "./sections/top.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Educators') // Tell MemberJunction about this class
@Component({
    selector: 'gen-educator-form',
    templateUrl: './educator.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class educatorFormComponent extends BaseFormComponent {
    public record!: educatorEntity;
} 

export function LoadeducatorFormComponent() {
    LoadeducatorDetailsComponent();
    LoadeducatorTopComponent();
}
