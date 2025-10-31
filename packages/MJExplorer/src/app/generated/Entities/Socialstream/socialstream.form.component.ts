import { Component } from '@angular/core';
import { SocialstreamEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSocialstreamDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Socialstreams') // Tell MemberJunction about this class
@Component({
    selector: 'gen-socialstream-form',
    templateUrl: './socialstream.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SocialstreamFormComponent extends BaseFormComponent {
    public record!: SocialstreamEntity;
} 

export function LoadSocialstreamFormComponent() {
    LoadSocialstreamDetailsComponent();
}
