import { Component } from '@angular/core';
import { MJDuplicateRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Duplicate Run Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjduplicaterundetail-form',
    templateUrl: './mjduplicaterundetail.form.component.html'
})
export class MJDuplicateRunDetailFormComponent extends BaseFormComponent {
    public record!: MJDuplicateRunDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runIdentification', sectionName: 'Run Identification', isExpanded: true },
            { sectionKey: 'processingOutcomes', sectionName: 'Processing Outcomes', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJDuplicateRunDetailMatches', sectionName: 'Duplicate Run Detail Matches', isExpanded: false }
        ]);
    }
}

