import { Component, OnInit  } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { SharedService } from '../services/shared-service';
import { IRunViewProvider, RunView } from '@memberjunction/core';
import { ReportEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'app-report-list',
  templateUrl: './report-list.component.html',
  styleUrl: './report-list.component.css'
})
export class ReportListComponent implements OnInit   {
  constructor(public auth: AuthService, private sharedService: SharedService) {}

  public reports: ReportEntity[] = [];
  public async ngOnInit() {
    const p = this.sharedService.InstanceProvider;
    const rv = new RunView(<IRunViewProvider><any>p);
    const result = await rv.RunView<ReportEntity>({
      EntityName: "Reports",
      ExtraFilter: "UserID='" + p.CurrentUser.ID + "'",
      OrderBy: "__mj_CreatedAt desc",
    }, p.CurrentUser);
    this.reports = result.Results;
  }
}
