import { Component } from '@angular/core';
import { ContentSourceTypeParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Source Type Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentsourcetypeparam-form',
    templateUrl: './contentsourcetypeparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentSourceTypeParamFormComponent extends BaseFormComponent {
    public record!: ContentSourceTypeParamEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadContentSourceTypeParamFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
