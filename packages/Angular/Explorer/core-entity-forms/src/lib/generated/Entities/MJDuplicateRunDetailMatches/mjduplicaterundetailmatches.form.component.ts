import { Component } from '@angular/core';
import { MJDuplicateRunDetailMatchesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Duplicate Run Detail Matches') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjduplicaterundetailmatches-form',
    templateUrl: './mjduplicaterundetailmatches.form.component.html'
})
export class MJDuplicateRunDetailMatchesFormComponent extends BaseFormComponent {
    public record!: MJDuplicateRunDetailMatchesEntity;

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

