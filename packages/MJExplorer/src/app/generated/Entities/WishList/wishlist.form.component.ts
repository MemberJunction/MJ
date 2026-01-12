import { Component } from '@angular/core';
import { WishListEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Wish Lists') // Tell MemberJunction about this class
@Component({
    selector: 'gen-wishlist-form',
    templateUrl: './wishlist.form.component.html'
})
export class WishListFormComponent extends BaseFormComponent {
    public record!: WishListEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associations', sectionName: 'Associations', isExpanded: true },
            { sectionKey: 'wishlistDetails', sectionName: 'Wishlist Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadWishListFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
