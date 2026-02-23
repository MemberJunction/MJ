import { Component } from '@angular/core';
import { MJEmployeeSkillsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Employee Skills') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjemployeeskills-form',
    templateUrl: './mjemployeeskills.form.component.html'
})
export class MJEmployeeSkillsFormComponent extends BaseFormComponent {
    public record!: MJEmployeeSkillsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'skillAssignment', sectionName: 'Skill Assignment', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

