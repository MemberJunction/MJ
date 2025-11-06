import { Component } from '@angular/core';
import { ReportVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Report Versions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-reportversion-form',
    templateUrl: './reportversion.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReportVersionFormComponent extends BaseFormComponent {
    public record!: ReportVersionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadReportVersionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
