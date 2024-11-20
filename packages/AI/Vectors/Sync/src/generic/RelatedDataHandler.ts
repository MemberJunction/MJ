import { UserInfo } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(VectorRelatedDataHandlerBase, "VectorRelatedDataHandlerBase")
export class VectorRelatedDataHandlerBase {

    public async GetRelatedData(sourceRecord: Record<string, any>, contextData: Record<string, any>, currentUser: UserInfo): Promise<Record<string, any>> {
        return {};
    }
}