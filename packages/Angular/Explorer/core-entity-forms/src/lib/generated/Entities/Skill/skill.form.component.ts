import { Component } from '@angular/core';
import { SkillEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSkillDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Skills') // Tell MemberJunction about this class
@Component({
    selector: 'gen-skill-form',
    templateUrl: './skill.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SkillFormComponent extends BaseFormComponent {
    public record!: SkillEntity;
} 

export function LoadSkillFormComponent() {
    LoadSkillDetailsComponent();
}
