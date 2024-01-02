import { Component } from '@angular/core';
import { Router } from '@angular/router'
import { Metadata, RunView } from '@memberjunction/core';
import { DashboardEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'app-dashboard-browser',
  templateUrl: './dashboard-browser.component.html',
  styleUrls: ['./dashboard-browser.component.css', '../shared/first-tab-styles.css']
})
export class DashboardBrowserComponent {
  public dashboards: DashboardEntity[] = [];
  public showLoader: boolean = false;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.LoadData();
  }
  async LoadData() {
    this.showLoader = true;

    const md = new Metadata()
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Dashboards',
      ExtraFilter: `UserID=${md.CurrentUser.ID}`
    })
    if (result && result.Success)
      this.dashboards = result.Results;

    this.showLoader = false;
  }
  public itemClick(item: DashboardEntity) {
    if (item) {
      this.router.navigate(['resource', 'dashboard', item.ID])
    }
  }
}
