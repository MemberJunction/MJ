import { Component } from '@angular/core';
import { MJTourPrerequisiteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tour Prerequisites') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtourprerequisite-form',
    templateUrl: './mjtourprerequisite.form.component.html'
})
export class MJTourPrerequisiteFormComponent extends BaseFormComponent {
    public record!: MJTourPrerequisiteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'prerequisiteConfiguration', sectionName: 'Prerequisite Configuration', isExpanded: true },
            { sectionKey: 'ruleLogic', sectionName: 'Rule Logic', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

