import { Component } from '@angular/core';
import { Router } from '@angular/router'
import { Metadata, RunView } from '@memberjunction/core';
import { QueryEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'app-query-browser',
  templateUrl: './query-browser.component.html',
  styleUrls: ['./query-browser.component.css', '../../shared/first-tab-styles.css']
})
export class QueryBrowserComponent {
  public queries: QueryEntity[] = [];
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
      EntityName: 'Queries',
//      ExtraFilter: `UserID=${md.CurrentUser.ID}`
    })
    if (result && result.Success)
      this.queries = result.Results;

    this.showLoader = false;
  }
  public itemClick(item: QueryEntity) {
    if (item) {
      this.router.navigate(['resource', 'query', item.ID])
    }
  }
}
