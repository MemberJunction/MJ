import { Component } from '@angular/core';
import { MJGeneratedCodesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Generated Codes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgeneratedcodes-form',
    templateUrl: './mjgeneratedcodes.form.component.html'
})
export class MJGeneratedCodesFormComponent extends BaseFormComponent {
    public record!: MJGeneratedCodesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'codeMetadata', sectionName: 'Code Metadata', isExpanded: false },
            { sectionKey: 'timelineAudit', sectionName: 'Timeline & Audit', isExpanded: true },
            { sectionKey: 'contentDetails', sectionName: 'Content Details', isExpanded: false },
            { sectionKey: 'sourceRelationships', sectionName: 'Source & Relationships', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

