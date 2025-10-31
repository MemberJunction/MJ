import { Component } from '@angular/core';
import { PledgeGuestListEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPledgeGuestListDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Pledge Guest Lists') // Tell MemberJunction about this class
@Component({
    selector: 'gen-pledgeguestlist-form',
    templateUrl: './pledgeguestlist.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PledgeGuestListFormComponent extends BaseFormComponent {
    public record!: PledgeGuestListEntity;
} 

export function LoadPledgeGuestListFormComponent() {
    LoadPledgeGuestListDetailsComponent();
}
