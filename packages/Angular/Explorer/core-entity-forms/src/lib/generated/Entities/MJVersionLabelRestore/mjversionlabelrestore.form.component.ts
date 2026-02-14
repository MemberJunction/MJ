import { Component } from '@angular/core';
import { MJVersionLabelRestoreEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Version Label Restores') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjversionlabelrestore-form',
    templateUrl: './mjversionlabelrestore.form.component.html'
})
export class MJVersionLabelRestoreFormComponent extends BaseFormComponent {
    public record!: MJVersionLabelRestoreEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'restoreOverview', sectionName: 'Restore Overview', isExpanded: true },
            { sectionKey: 'progressMetrics', sectionName: 'Progress Metrics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

