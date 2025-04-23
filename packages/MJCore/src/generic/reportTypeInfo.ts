import { BaseInfo } from "./baseInfo";

export class ReportTypeInfo extends BaseInfo {
    public ID: string = null;
    public Name: string = null;
    public Description: string = null;
    public Configuration: string = null;
    __mj_CreatedAt: Date = null;
    __mj_UpdatedAt: Date = null;

    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }
}