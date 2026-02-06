import { Component } from '@angular/core';
import { GeneratedCodeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Generated Codes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-generatedcode-form',
    templateUrl: './generatedcode.form.component.html'
})
export class GeneratedCodeFormComponent extends BaseFormComponent {
    public record!: GeneratedCodeEntity;

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

export function LoadGeneratedCodeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
