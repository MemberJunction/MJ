import { BaseEntity, LogError, LogStatus, PotentialDuplicateRequest } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { MJDuplicateRunEntity } from "@memberjunction/core-entities";
import { DuplicateRecordDetector } from "@memberjunction/ai-vector-dupe";

@RegisterClass(BaseEntity, 'MJ: Duplicate Runs')
export class MJDuplicateRunEntityServer extends MJDuplicateRunEntity {
    public async Save(): Promise<boolean> {
        const saveResult: boolean = await super.Save();

        if (saveResult && this.EndedAt === null) {
            // Fire-and-forget: run detection asynchronously so the save returns immediately
            this.runDetectionAsync().catch((error) => {
                LogError(`Async duplicate detection failed for run ${this.ID}`, undefined, error);
            });
        }

        return saveResult;
    }

    /**
     * Run duplicate detection asynchronously. On failure, updates the run's
     * ProcessingStatus to 'Error' so the UI can surface the problem.
     */
    private async runDetectionAsync(): Promise<void> {
        try {
            const detector = new DuplicateRecordDetector();
            const request = new PotentialDuplicateRequest();
            request.EntityID = this.EntityID;
            request.ListID = this.SourceListID;
            request.Options = { DuplicateRunID: this.ID };

            await detector.GetDuplicateRecords(request, this.ContextCurrentUser);
            LogStatus(`Duplicate detection completed for run ${this.ID}`);
        } catch (error) {
            LogError(`Duplicate detection error for run ${this.ID}`, undefined, error);

            // Update the run record to reflect the error
            try {
                this.ProcessingStatus = 'Error';
                this.EndedAt = new Date();
                await super.Save();
            } catch (updateError) {
                LogError(`Failed to update run ${this.ID} after detection error`, undefined, updateError);
            }
        }
    }
}
