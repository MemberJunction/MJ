import { Component } from '@angular/core';
import { PublicLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Public Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-publiclink-form',
    templateUrl: './publiclink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PublicLinkFormComponent extends BaseFormComponent {
    public record!: PublicLinkEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadPublicLinkFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
