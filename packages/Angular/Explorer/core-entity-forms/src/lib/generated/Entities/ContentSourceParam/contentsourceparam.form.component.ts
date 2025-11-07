import { Component } from '@angular/core';
import { ContentSourceParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Source Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentsourceparam-form',
    templateUrl: './contentsourceparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentSourceParamFormComponent extends BaseFormComponent {
    public record!: ContentSourceParamEntity;

    // Collapsible section state
    public sectionsExpanded = {
        identifierKeys: true,
        parameterSettings: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadContentSourceParamFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
