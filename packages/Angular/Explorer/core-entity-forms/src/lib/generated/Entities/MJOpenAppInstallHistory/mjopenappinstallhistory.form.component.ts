import { Component } from '@angular/core';
import { MJOpenAppInstallHistoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Open App Install Histories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjopenappinstallhistory-form',
    templateUrl: './mjopenappinstallhistory.form.component.html'
})
export class MJOpenAppInstallHistoryFormComponent extends BaseFormComponent {
    public record!: MJOpenAppInstallHistoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

