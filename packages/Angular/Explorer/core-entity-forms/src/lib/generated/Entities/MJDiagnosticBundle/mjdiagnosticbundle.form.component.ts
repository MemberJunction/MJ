import { Component } from '@angular/core';
import { MJDiagnosticBundleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Diagnostic Bundles')
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
            { sectionKey: 'general', sectionName: 'General', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}
