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
            { sectionKey: 'archiveContext', sectionName: 'Archive Context', isExpanded: true },
            { sectionKey: 'processingResults', sectionName: 'Processing Results', isExpanded: true },
            { sectionKey: 'timelineAndVersioning', sectionName: 'Timeline and Versioning', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

