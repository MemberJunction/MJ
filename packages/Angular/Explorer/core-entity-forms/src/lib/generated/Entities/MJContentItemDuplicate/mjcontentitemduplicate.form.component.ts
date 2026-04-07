import { Component } from '@angular/core';
import { MJContentItemDuplicateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Item Duplicates') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentitemduplicate-form',
    templateUrl: './mjcontentitemduplicate.form.component.html'
})
export class MJContentItemDuplicateFormComponent extends BaseFormComponent {
    public record!: MJContentItemDuplicateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'comparisonDetails', sectionName: 'Comparison Details', isExpanded: true },
            { sectionKey: 'resolutionTracking', sectionName: 'Resolution Tracking', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

