import { Component } from '@angular/core';
import { ContentSourceTypeParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContentSourceTypeParamDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Content Source Type Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentsourcetypeparam-form',
    templateUrl: './contentsourcetypeparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentSourceTypeParamFormComponent extends BaseFormComponent {
    public record!: ContentSourceTypeParamEntity;
} 

export function LoadContentSourceTypeParamFormComponent() {
    LoadContentSourceTypeParamDetailsComponent();
}
