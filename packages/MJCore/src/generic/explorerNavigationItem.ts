import { BaseInfo } from "./baseInfo"

/**
 * Metadata about a single item in the explorer navigation options
 */
export class ExplorerNavigationItem extends BaseInfo {
    public ID: string = null;
    public Sequence: number = null;
    public Name: string = null;
    public Route: string = null;
    public IsActive: boolean = null;
    public ShowInHomeScreen: boolean = null;
    public ShowInNavigationDrawer: boolean = null;
    public IconCSSClass: string = null;
    public Description: string = null;
    public Comments: string = null;
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }
}
