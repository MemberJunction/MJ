import { Component } from '@angular/core';
import { MJUserFavoritesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Favorites') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserfavorites-form',
    templateUrl: './mjuserfavorites.form.component.html'
})
export class MJUserFavoritesFormComponent extends BaseFormComponent {
    public record!: MJUserFavoritesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'favoriteIdentification', sectionName: 'Favorite Identification', isExpanded: true },
            { sectionKey: 'entityMetadata', sectionName: 'Entity Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

