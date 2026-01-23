import { Component } from '@angular/core';
import { DuplicateRunDetailMatchEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Duplicate Run Detail Matches') // Tell MemberJunction about this class
@Component({
    selector: 'gen-duplicaterundetailmatch-form',
    templateUrl: './duplicaterundetailmatch.form.component.html'
})
export class DuplicateRunDetailMatchFormComponent extends BaseFormComponent {
    public record!: DuplicateRunDetailMatchEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'matchResults', sectionName: 'Match Results', isExpanded: true },
            { sectionKey: 'resolutionManagement', sectionName: 'Resolution Management', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadDuplicateRunDetailMatchFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
