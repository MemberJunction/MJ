import { Component, Input } from '@angular/core';
import { Router } from "@angular/router";
import { SharedService } from "@memberjunction/ng-shared";
import { StubData } from '../../../generic/app-nav-view.types';

@Component({
    selector: 'expansion-panel-item-component',
    templateUrl: './expansion-panel-item-component.html',
    styleUrls: ['./expansion-panel-item-component.css']
  })
export class ExpansionPanelItemComponent {

    @Input() public items: StubData[] = [];

    constructor(public sharedService: SharedService, private router: Router) {}

    ngOnInit(): void {
        /*
        const md = new Metadata();
        this.items = md.Applications.map(app => 
            new StubData(app.Name, app.ApplicationEntities.map(entity => new StubData(entity.ApplicationName, []))));

        for(const application of md.Applications){
            this.items.push(new StubData(application.Name, []));
        }
        */
    }
}
