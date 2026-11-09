import { BaseEntity, EntitySaveOptions } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { ComputeDashboardFingerprintAsync, MJDashboardEntityExtended } from "@memberjunction/core-entities";
import { ApplyApprovalRulesAsync, ApprovalRefusalResult } from "./approvalStamp";

/**
 * Server-side `MJ: Dashboards` entity.
 *
 * Approval (`ApprovalStatus`) is a server act: a save that moves it to Approved records the context
 * user, the time and the fingerprint of the dashboard's definition (type, configuration, code and
 * driver class); values a client sends for those columns are ignored (`ApplyApprovalRulesAsync`).
 * Who may approve is whoever may edit the dashboard.
 */
@RegisterClass(BaseEntity, 'MJ: Dashboards')
export class MJDashboardEntityServer extends MJDashboardEntityExtended {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            // Nothing in this save derives the definition, so the fingerprint is stamped now and written with the row.
            if (!options?.ReplayOnly && await ApplyApprovalRulesAsync(this, 'ApprovalStatus', this.ApprovalStatus)) {
                this.ApprovedFingerprint = await ComputeDashboardFingerprintAsync(this);
            }
        } catch (e) {
            this.RegisterResultHistoryEntry(ApprovalRefusalResult(this, e));
            return false;
        }
        return super.Save(options);
    }
}
