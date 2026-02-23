import { Component } from '@angular/core';
import { MJOpenAppInstallHistoriesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Open App Install Histories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjopenappinstallhistories-form',
    templateUrl: './mjopenappinstallhistories.form.component.html'
})
export class MJOpenAppInstallHistoriesFormComponent extends BaseFormComponent {
    public record!: MJOpenAppInstallHistoriesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

