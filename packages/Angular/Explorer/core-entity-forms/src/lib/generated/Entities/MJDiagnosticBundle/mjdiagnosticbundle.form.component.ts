import { Component } from '@angular/core';
import { MJDiagnosticBundleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Diagnostic Bundles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdiagnosticbundle-form',
    templateUrl: './mjdiagnosticbundle.form.component.html'
})
export class MJDiagnosticBundleFormComponent extends BaseFormComponent {
    public record!: MJDiagnosticBundleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'bundleDetails', sectionName: 'Bundle Details', isExpanded: true },
            { sectionKey: 'securityAndScrubbing', sectionName: 'Security and Scrubbing', isExpanded: true },
            { sectionKey: 'timelineAndScope', sectionName: 'Timeline and Scope', isExpanded: true },
            { sectionKey: 'storageAndArchive', sectionName: 'Storage and Archive', isExpanded: true },
            { sectionKey: 'analysisAndFindings', sectionName: 'Analysis and Findings', isExpanded: true },
            { sectionKey: 'statusAndErrorTracking', sectionName: 'Status and Error Tracking', isExpanded: true },
            { sectionKey: 'ownershipAndApproval', sectionName: 'Ownership and Approval', isExpanded: true },
            { sectionKey: 'transmissionDetails', sectionName: 'Transmission Details', isExpanded: true },
            { sectionKey: 'senderInformation', sectionName: 'Sender Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

