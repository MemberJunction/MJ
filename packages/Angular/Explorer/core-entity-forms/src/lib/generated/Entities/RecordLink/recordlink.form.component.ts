import { Component } from '@angular/core';
import { RecordLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Record Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recordlink-form',
    templateUrl: './recordlink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecordLinkFormComponent extends BaseFormComponent {
    public record!: RecordLinkEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadRecordLinkFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
