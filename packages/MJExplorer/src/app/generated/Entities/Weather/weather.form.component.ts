import { Component } from '@angular/core';
import { WeatherEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Weathers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-weather-form',
    templateUrl: './weather.form.component.html'
})
export class WeatherFormComponent extends BaseFormComponent {
    public record!: WeatherEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadWeatherFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
