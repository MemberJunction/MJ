import { Component } from '@angular/core';
import { Router } from '@angular/router'
import { Metadata, RunView } from '@memberjunction/core';
import { ReportEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'app-report-browser',
  templateUrl: './report-browser.component.html',
  styleUrls: ['./report-browser.component.css', '../shared/first-tab-styles.css']
})
export class ReportBrowserComponent {
  public reports: ReportEntity[] = [];
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
      EntityName: 'Reports',
      ExtraFilter: `UserID=${md.CurrentUser.ID}`
    })
    if (result && result.Success)
      this.reports = result.Results;

    this.showLoader = false;
  }
  public itemClick(item: ReportEntity) {
    if (item) {
      this.router.navigate(['resource', 'report', item.ID])
    }
  }
}
