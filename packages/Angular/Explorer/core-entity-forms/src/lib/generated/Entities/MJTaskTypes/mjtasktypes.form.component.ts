import { Component } from '@angular/core';
import { MJTaskTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Task Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtasktypes-form',
    templateUrl: './mjtasktypes.form.component.html'
})
export class MJTaskTypesFormComponent extends BaseFormComponent {
    public record!: MJTaskTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taskTypeDetails', sectionName: 'Task Type Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'MJ: Tasks', isExpanded: false }
        ]);
    }
}

