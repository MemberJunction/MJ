import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from "@angular/router";
import { ApplicationInfo, Metadata } from "@memberjunction/core";
import { SharedService } from "@memberjunction/ng-shared";
import { StubData } from '../../generic/app-nav-view.types';

@Component({
    selector: 'expansion-panel-component',
    templateUrl: './expansion-panel-component.html',
    styleUrls: ['./expansion-panel-component.css']
  })
export class ExpansionPanelComponent {

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


//this may work better
// https://www.telerik.com/kendo-angular-ui/components/layout/panelbar/
// https://www.telerik.com/forums/adding-buttons-to-dynamically-generated-panelbaritem
