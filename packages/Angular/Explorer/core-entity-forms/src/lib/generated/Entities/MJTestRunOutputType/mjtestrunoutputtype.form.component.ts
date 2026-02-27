import { Component } from '@angular/core';
import { MJTestRunOutputTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Test Run Output Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestrunoutputtype-form',
    templateUrl: './mjtestrunoutputtype.form.component.html'
})
export class MJTestRunOutputTypeFormComponent extends BaseFormComponent {
    public record!: MJTestRunOutputTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'outputTypeDetails', sectionName: 'Output Type Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTestRunOutputs', sectionName: 'MJ: Test Run Outputs', isExpanded: false }
        ]);
    }
}

