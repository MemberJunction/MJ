import { Component } from '@angular/core';
import { DuplicateRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Duplicate Run Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-duplicaterundetail-form',
    templateUrl: './duplicaterundetail.form.component.html'
})
export class DuplicateRunDetailFormComponent extends BaseFormComponent {
    public record!: DuplicateRunDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runIdentification', sectionName: 'Run Identification', isExpanded: true },
            { sectionKey: 'processingOutcomes', sectionName: 'Processing Outcomes', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'duplicateRunDetailMatches', sectionName: 'Duplicate Run Detail Matches', isExpanded: false }
        ]);
    }
}

