import { Component } from '@angular/core';
import { ContentSourceParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContentSourceParamDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Content Source Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentsourceparam-form',
    templateUrl: './contentsourceparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentSourceParamFormComponent extends BaseFormComponent {
    public record!: ContentSourceParamEntity;
} 

export function LoadContentSourceParamFormComponent() {
    LoadContentSourceParamDetailsComponent();
}
