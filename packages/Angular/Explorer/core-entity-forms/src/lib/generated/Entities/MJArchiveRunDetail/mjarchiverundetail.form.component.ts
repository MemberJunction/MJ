import { Component } from '@angular/core';
import { MJArchiveRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Archive Run Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjarchiverundetail-form',
    templateUrl: './mjarchiverundetail.form.component.html'
})
export class MJArchiveRunDetailFormComponent extends BaseFormComponent {
    public record!: MJArchiveRunDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recordContext', sectionName: 'Record Context', isExpanded: true },
            { sectionKey: 'archivalOutcome', sectionName: 'Archival Outcome', isExpanded: true },
            { sectionKey: 'storageDetails', sectionName: 'Storage Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

