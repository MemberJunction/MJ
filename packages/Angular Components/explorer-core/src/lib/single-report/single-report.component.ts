import { AfterViewInit, Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { LogError, Metadata, RunReport } from '@memberjunction/core';
import { ReportEntity } from '@memberjunction/core-entities';
import { DynamicReportComponent } from '@memberjunction/ng-ask-skip';
import { SkipColumnInfo, SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types'; 
@Component({
  selector: 'app-single-report',
  templateUrl: './single-report.component.html',
  styleUrls: ['./single-report.component.css']
})
export class SingleReportComponent implements OnInit {
  @Input() reportId!: number;  
  @Output() public loadComplete: EventEmitter<any> = new EventEmitter<any>();
  @Output() public loadStarted: EventEmitter<any> = new EventEmitter<any>();

  @ViewChild('theReport', { static: true }) theReport!: DynamicReportComponent;

  public ReportEntity!: ReportEntity;

  public reportData!: any[];

  public ReportConfiguration: SkipAPIAnalysisCompleteResponse | undefined;

  public get IsChart(): boolean {
    return this.theReport.IsChart
  }
  public get IsTable(): boolean {
    return this.theReport.IsTable
  }
  public get Columns(): SkipColumnInfo[] {
    return this.theReport.Columns;
  }
  public get Report(): DynamicReportComponent {
    return this.theReport;
  }

 
  ngOnInit(): void {
    this.doLoad();
  }
  async doLoad(): Promise<void> {
    try {
      // get info on the report we are loading
      this.loadStarted.emit();
      const md = new Metadata();
      this.ReportEntity = <ReportEntity>await md.GetEntityObject('Reports');
      await this.ReportEntity.Load(this.reportId);
      this.ReportConfiguration = JSON.parse(this.ReportEntity.ReportConfiguration);

      const runReport = new RunReport();
      const result = await runReport.RunReport({ReportID: this.reportId});
      if (result && result.Success && result.Results.length > 0) {
        this.reportData = result.Results;
      if (this.ReportConfiguration?.executionResults)
          this.ReportConfiguration.executionResults.tableData = this.reportData // put the report data into the right spot so the dynamic report knows where to get it
      }
      else {
        // report has an invalid configuration
        throw new Error('Error running report: invalid value from ReportConfiguration field ');
      }

      this.loadComplete.emit();
    }
    catch (err) {
      LogError(err);
    }
  }


}
