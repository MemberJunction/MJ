import { Component } from '@angular/core';
import { MJProcessRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Process Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjprocessrun-form',
    templateUrl: './mjprocessrun.form.component.html'
})
export class MJProcessRunFormComponent extends BaseFormComponent {
    public record!: MJProcessRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJProcessRunDetails', sectionName: 'Process Run Details', isExpanded: false }
        ]);
    }
}

