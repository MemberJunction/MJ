import { Component } from '@angular/core';
import { MJDuplicateRunDetailMatchEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Duplicate Run Detail Matches') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjduplicaterundetailmatch-form',
    templateUrl: './mjduplicaterundetailmatch.form.component.html'
})
export class MJDuplicateRunDetailMatchFormComponent extends BaseFormComponent {
    public record!: MJDuplicateRunDetailMatchEntity;

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

