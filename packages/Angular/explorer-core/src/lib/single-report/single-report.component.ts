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

  public ReportEntity: ReportEntity | undefined;

  public reportData!: any[];

  public Configuration: SkipAPIAnalysisCompleteResponse | undefined;

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

 
  async ngOnInit() {
    await this.doLoad();
  }
  async doLoad(): Promise<void> {
    try {
      // get info on the report we are loading
      this.loadStarted.emit();
      const md = new Metadata();
      this.ReportEntity = <ReportEntity>await md.GetEntityObject('Reports');
      await this.ReportEntity.Load(this.reportId);
      this.Configuration = JSON.parse(this.ReportEntity.Configuration);

      this.loadComplete.emit();
    }
    catch (err) {
      LogError(err);
    }
  }


}
