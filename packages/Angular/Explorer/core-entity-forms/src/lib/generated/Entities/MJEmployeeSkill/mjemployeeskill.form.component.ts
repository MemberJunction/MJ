import { Component } from '@angular/core';
import { MJEmployeeSkillEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Employee Skills') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjemployeeskill-form',
    templateUrl: './mjemployeeskill.form.component.html'
})
export class MJEmployeeSkillFormComponent extends BaseFormComponent {
    public record!: MJEmployeeSkillEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'skillAssignment', sectionName: 'Skill Assignment', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

