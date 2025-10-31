import { Component } from '@angular/core';
import { SkillLevelEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSkillLevelDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Skill Levels') // Tell MemberJunction about this class
@Component({
    selector: 'gen-skilllevel-form',
    templateUrl: './skilllevel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SkillLevelFormComponent extends BaseFormComponent {
    public record!: SkillLevelEntity;
} 

export function LoadSkillLevelFormComponent() {
    LoadSkillLevelDetailsComponent();
}
