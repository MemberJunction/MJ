import { Component } from '@angular/core';
import { BaseEntity } from '@memberjunction/core';
// CAELEB FIX THIS import { MJTestRunOutputTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Test Run Output Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-testrunoutputtype-form',
    templateUrl: './testrunoutputtype.form.component.html'
})
export class TestRunOutputTypeFormComponent extends BaseFormComponent {
    public record!: BaseEntity;// @Caeleb - FIX THIS AFTER RUNNING CODE GEN AGAIN MJTestRunOutputTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'outputTypeDetails', sectionName: 'Output Type Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTestRunOutputs', sectionName: 'MJ: Test Run Outputs', isExpanded: false }
        ]);
    }
}

