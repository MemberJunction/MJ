import { Component } from '@angular/core';
import { PublicLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPublicLinkDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Public Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-publiclink-form',
    templateUrl: './publiclink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PublicLinkFormComponent extends BaseFormComponent {
    public record!: PublicLinkEntity;
} 

export function LoadPublicLinkFormComponent() {
    LoadPublicLinkDetailsComponent();
}
