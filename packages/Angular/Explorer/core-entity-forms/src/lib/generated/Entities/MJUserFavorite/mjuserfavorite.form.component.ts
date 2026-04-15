import { Component } from '@angular/core';
import { MJUserFavoriteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Favorites') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserfavorite-form',
    templateUrl: './mjuserfavorite.form.component.html'
})
export class MJUserFavoriteFormComponent extends BaseFormComponent {
    public record!: MJUserFavoriteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'favoriteIdentification', sectionName: 'Favorite Identification', isExpanded: true },
            { sectionKey: 'entityMetadata', sectionName: 'Entity Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

