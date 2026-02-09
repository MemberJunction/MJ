import { Component } from '@angular/core';
import { EmployeeSkillEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Employee Skills') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-employeeskill-form',
    templateUrl: './employeeskill.form.component.html'
})
export class EmployeeSkillFormComponent extends BaseFormComponent {
    public record!: EmployeeSkillEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'skillAssignment', sectionName: 'Skill Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

