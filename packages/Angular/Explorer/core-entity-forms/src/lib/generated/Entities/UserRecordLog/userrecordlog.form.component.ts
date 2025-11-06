import { Component } from '@angular/core';
import { UserRecordLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'User Record Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userrecordlog-form',
    templateUrl: './userrecordlog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserRecordLogFormComponent extends BaseFormComponent {
    public record!: UserRecordLogEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadUserRecordLogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
