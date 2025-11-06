import { Component } from '@angular/core';
import { UserFavoriteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'User Favorites') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userfavorite-form',
    templateUrl: './userfavorite.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserFavoriteFormComponent extends BaseFormComponent {
    public record!: UserFavoriteEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadUserFavoriteFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
