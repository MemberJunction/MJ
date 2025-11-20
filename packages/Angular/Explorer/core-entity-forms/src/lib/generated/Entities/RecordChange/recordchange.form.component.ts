import { Component } from '@angular/core';
import { RecordChangeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Record Changes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recordchange-form',
    templateUrl: './recordchange.form.component.html'
})
export class RecordChangeFormComponent extends BaseFormComponent {
    public record!: RecordChangeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recordContext', sectionName: 'Record Context', isExpanded: true },
            { sectionKey: 'changeSummary', sectionName: 'Change Summary', isExpanded: true },
            { sectionKey: 'changeContent', sectionName: 'Change Content', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadRecordChangeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
