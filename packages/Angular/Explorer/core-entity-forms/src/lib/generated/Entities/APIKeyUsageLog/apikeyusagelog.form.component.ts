import { Component } from '@angular/core';
import { APIKeyUsageLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: API Key Usage Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-apikeyusagelog-form',
    templateUrl: './apikeyusagelog.form.component.html'
})
export class APIKeyUsageLogFormComponent extends BaseFormComponent {
    public record!: APIKeyUsageLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadAPIKeyUsageLogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
