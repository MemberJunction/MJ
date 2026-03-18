import { Component } from '@angular/core';
import { YourMembershipMemberFavoriteEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Member Favorites') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipmemberfavorite-form',
    templateUrl: './yourmembershipmemberfavorite.form.component.html'
})
export class YourMembershipMemberFavoriteFormComponent extends BaseFormComponent {
    public record!: YourMembershipMemberFavoriteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'favoriteDetails', sectionName: 'Favorite Details', isExpanded: true },
            { sectionKey: 'timelineAndSynchronization', sectionName: 'Timeline and Synchronization', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

