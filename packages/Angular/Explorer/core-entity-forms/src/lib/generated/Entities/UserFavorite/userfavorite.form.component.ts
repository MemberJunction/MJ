import { Component } from '@angular/core';
import { UserFavoriteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'User Favorites') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-userfavorite-form',
    templateUrl: './userfavorite.form.component.html'
})
export class UserFavoriteFormComponent extends BaseFormComponent {
    public record!: UserFavoriteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'favoriteIdentification', sectionName: 'Favorite Identification', isExpanded: true },
            { sectionKey: 'entityMetadata', sectionName: 'Entity Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

