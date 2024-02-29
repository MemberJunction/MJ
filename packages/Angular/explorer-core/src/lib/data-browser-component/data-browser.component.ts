import { Component } from '@angular/core';
import { Router } from '@angular/router'
import { ApplicationInfo, Metadata } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-data-browser',
  templateUrl: './data-browser.component.html',
  styleUrls: ['./data-browser.component.css', '../../shared/first-tab-styles.css']
})
export class DataBrowserComponent {
  public showLoader: boolean = true;
  public applications: ApplicationInfo[] = [];

  constructor(public sharedService: SharedService, private router: Router) {}

  ngOnInit(): void {
    this.LoadData();
  }
  async LoadData() {
    this.showLoader = true;
    const md = new Metadata()
    this.applications = md.Applications;
    this.showLoader = false;
  }
  public appItemClick(info: ApplicationInfo) {
    if (info) {
      this.router.navigate(['app', info.Name])
    }
  }
}
