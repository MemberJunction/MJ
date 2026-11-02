import { Component } from '@angular/core';
import { MJDiagnosticSessionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Diagnostic Sessions')
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
            { sectionKey: 'general', sectionName: 'General', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}
