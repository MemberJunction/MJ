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
            { sectionKey: 'bundleInformation', sectionName: 'Bundle Information', isExpanded: true },
            { sectionKey: 'sourceAndReferences', sectionName: 'Source and References', isExpanded: true },
            { sectionKey: 'lifecycleAndStatus', sectionName: 'Lifecycle and Status', isExpanded: true },
            { sectionKey: 'contentAndFindings', sectionName: 'Content and Findings', isExpanded: true },
            { sectionKey: 'storageAndFileDetails', sectionName: 'Storage and File Details', isExpanded: true },
            { sectionKey: 'ownershipAndApproval', sectionName: 'Ownership and Approval', isExpanded: true },
            { sectionKey: 'transmissionDetails', sectionName: 'Transmission Details', isExpanded: true },
            { sectionKey: 'intakeAndSourceContext', sectionName: 'Intake and Source Context', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

