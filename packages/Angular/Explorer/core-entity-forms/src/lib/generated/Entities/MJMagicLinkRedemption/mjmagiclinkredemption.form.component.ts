import { Component } from '@angular/core';
import { MJMagicLinkRedemptionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Magic Link Redemptions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmagiclinkredemption-form',
    templateUrl: './mjmagiclinkredemption.form.component.html'
})
export class MJMagicLinkRedemptionFormComponent extends BaseFormComponent {
    public record!: MJMagicLinkRedemptionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

