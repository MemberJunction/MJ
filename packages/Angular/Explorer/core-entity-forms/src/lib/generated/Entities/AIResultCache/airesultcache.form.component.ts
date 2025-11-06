import { Component } from '@angular/core';
import { AIResultCacheEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Result Cache') // Tell MemberJunction about this class
@Component({
    selector: 'gen-airesultcache-form',
    templateUrl: './airesultcache.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIResultCacheFormComponent extends BaseFormComponent {
    public record!: AIResultCacheEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIResultCacheFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
