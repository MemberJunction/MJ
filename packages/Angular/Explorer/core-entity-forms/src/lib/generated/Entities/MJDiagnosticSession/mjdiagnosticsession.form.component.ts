import { Component } from '@angular/core';
import { MJDiagnosticSessionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Diagnostic Sessions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdiagnosticsession-form',
    templateUrl: './mjdiagnosticsession.form.component.html'
})
export class MJDiagnosticSessionFormComponent extends BaseFormComponent {
    public record!: MJDiagnosticSessionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJDiagnosticSessionChunks', sectionName: 'Diagnostic Session Chunks', isExpanded: false },
            { sectionKey: 'mJDiagnosticBundles', sectionName: 'Diagnostic Bundles', isExpanded: false }
        ]);
    }
}

