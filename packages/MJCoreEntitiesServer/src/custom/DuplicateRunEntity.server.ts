import { BaseEntity, PotentialDuplicateRequest } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { DuplicateRunEntity } from "@memberjunction/core-entities";
import { DuplicateRecordDetector } from "@memberjunction/ai-vector-dupe";

@RegisterClass(BaseEntity, 'Duplicate Runs')
export class DuplicateRunEntity_Server extends DuplicateRunEntity  {
    public async Save(): Promise<boolean> {
        const saveResult: boolean = await super.Save();
        if (saveResult && this.EndedAt === null) {
            // do something
            const duplicateRecordDetector: DuplicateRecordDetector = new DuplicateRecordDetector();
            let request: PotentialDuplicateRequest = new PotentialDuplicateRequest();
            request.EntityID = this.EntityID;
            request.ListID = this.SourceListID;
            request.Options = {
                DuplicateRunID: this.ID,
            };
            
            const response = await duplicateRecordDetector.getDuplicateRecords(request, this.ContextCurrentUser);
        }

        return saveResult;
    }
}