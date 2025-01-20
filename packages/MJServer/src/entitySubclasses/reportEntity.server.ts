import { BaseEntity, Metadata } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { ReportEntity, ReportSnapshotEntity } from "@memberjunction/core-entities";

@RegisterClass(BaseEntity, 'Reports')
export class ReportEntity_Server extends ReportEntity  {
    /**
     * The server side Report Entity sub-class has a simple logic that will create a snapshot of the report when it is first created and each time it is modified, but only
     * if it is either newly created or if the Configuration field has changed.
     * @returns 
     */
    public async Save(): Promise<boolean> {
        const wasNewRecord: boolean = !this.IsSaved;
        const saveResult: boolean = await super.Save();
        if (saveResult && (wasNewRecord || this.GetFieldByName('Configuration')?.Dirty)) {
            // here we either have a new record or the configuration has changed, so we need to create a snapshot of the report
            const md = new Metadata();
            const snapshot = await md.GetEntityObject<ReportSnapshotEntity>('Report Snapshots', this.ContextCurrentUser);
            snapshot.ReportID = this.ID;
            snapshot.UserID = this.ContextCurrentUser.ID;
            // in the snapshot entity the ResultSet column is the Configuration column from the Report entity
            snapshot.ResultSet = JSON.stringify(this.Configuration);
            return await snapshot.Save();
        }        
        else
            return saveResult;
    }
}

export function LoadReportEntityServerSubClass() {}