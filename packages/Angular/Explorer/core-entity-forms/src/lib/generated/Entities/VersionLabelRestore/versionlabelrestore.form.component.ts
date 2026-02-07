import { Component } from '@angular/core';
import { VersionLabelRestoreEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Version Label Restores') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-versionlabelrestore-form',
    templateUrl: './versionlabelrestore.form.component.html'
})
export class VersionLabelRestoreFormComponent extends BaseFormComponent {
    public record!: VersionLabelRestoreEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'restoreOverview', sectionName: 'Restore Overview', isExpanded: true },
            { sectionKey: 'progressMetrics', sectionName: 'Progress Metrics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadVersionLabelRestoreFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
