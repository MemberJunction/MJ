import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { EntityInfo } from '@memberjunction/core';
import { ReportEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { SkipChatComponent } from '@memberjunction/ng-skip-chat';
import { SharedService } from '../services/shared-service';
import { SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';

@Component({
  selector: 'app-single-report',
  templateUrl: './single-report.component.html',
  styleUrl: './single-report.component.css'
})
export class SingleReportComponent implements OnInit {
  constructor(private auth: AuthService, private route: ActivatedRoute, private sharedService: SharedService) {}
 
  public theReport: ReportEntity;
  public skipData: SkipAPIAnalysisCompleteResponse;

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = params['id'];
      this.loadReport(id);
    });
  }

  protected async loadReport(id: string) {
    const p = this.sharedService.InstanceProvider;
    const reportEntity = await p.GetEntityObject<ReportEntity>("Reports", p.CurrentUser);
    await reportEntity.Load(id);
    this.skipData = JSON.parse(reportEntity.Configuration!);
    this.theReport = reportEntity;
  }
}
