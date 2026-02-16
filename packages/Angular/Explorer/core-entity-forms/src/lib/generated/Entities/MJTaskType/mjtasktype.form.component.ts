import { Component } from '@angular/core';
import { MJTaskTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Task Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtasktype-form',
    templateUrl: './mjtasktype.form.component.html'
})
export class MJTaskTypeFormComponent extends BaseFormComponent {
    public record!: MJTaskTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taskTypeDetails', sectionName: 'Task Type Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'MJ: Tasks', isExpanded: false }
        ]);
    }
}

