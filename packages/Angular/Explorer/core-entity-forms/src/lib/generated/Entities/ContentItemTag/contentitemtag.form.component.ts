import { Component } from '@angular/core';
import { ContentItemTagEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContentItemTagDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Content Item Tags') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentitemtag-form',
    templateUrl: './contentitemtag.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentItemTagFormComponent extends BaseFormComponent {
    public record!: ContentItemTagEntity;
} 

export function LoadContentItemTagFormComponent() {
    LoadContentItemTagDetailsComponent();
}
