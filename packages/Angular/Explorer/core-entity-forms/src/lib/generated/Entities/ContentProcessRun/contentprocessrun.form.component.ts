import { Component } from '@angular/core';
import { ContentProcessRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Process Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentprocessrun-form',
    templateUrl: './contentprocessrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentProcessRunFormComponent extends BaseFormComponent {
    public record!: ContentProcessRunEntity;

    // Collapsible section state
    public sectionsExpanded = {
        runMetadata: false,
        executionMetrics: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadContentProcessRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
