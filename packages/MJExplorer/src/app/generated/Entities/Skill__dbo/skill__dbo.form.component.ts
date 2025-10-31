import { Component } from '@angular/core';
import { Skill__dboEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSkill__dboDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Skills__dbo') // Tell MemberJunction about this class
@Component({
    selector: 'gen-skill__dbo-form',
    templateUrl: './skill__dbo.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Skill__dboFormComponent extends BaseFormComponent {
    public record!: Skill__dboEntity;
} 

export function LoadSkill__dboFormComponent() {
    LoadSkill__dboDetailsComponent();
}
