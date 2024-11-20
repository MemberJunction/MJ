import { RegisterClass } from "@memberjunction/global";
import { VectorRelatedDataHandlerBase } from "@memberjunction/ai-vector-sync";
import { LogError, Metadata, RunView, UserInfo } from "@memberjunction/core";

@RegisterClass(VectorRelatedDataHandlerBase, "VectorRelatedDataHandlerBase")
export class CHESTVectorRelatedDataHandler extends VectorRelatedDataHandlerBase {

    public async GetRelatedData(sourceRecord: Record<string, any>, contextData: Record<string, any>, currentUser: UserInfo): Promise<Record<string, any>> {
        const md: Metadata = new Metadata();
        const rv: RunView = new RunView();

        let data = {
            Courses: [],
            Products: []
        };

        const email: string = sourceRecord.EMAIL;
        const rvCourses = await rv.RunView({
            EntityName: 'Courses',
            ExtraFilter: `COURSE_ID IN (
select COURSE_ID from HUBSPOT_SYNC.vwVW_DEALSs
where EMAIL = '${email}'
and COURSE_ID IS NOT NULL`
        }, currentUser);

        if(rvCourses.Success){
            data.Courses = rvCourses.Results;
        }
        else{
            LogError(`Error getting courses for email ${email}`, undefined, rvCourses.ErrorMessage);
        }

        const rvProducts = await rv.RunView({
            EntityName: 'VW_DEALSs',
            ExtraFilter: `EMAIL = '${email}' and PRODUCT_CODE IS NOT NULL`,
            Fields: ['DEAL_NAME', 'PRODUCT_CODE'],
        }, currentUser)

        if(rvProducts.Success){
            for(const product of rvProducts.Results){
                const filter: string = `select * from HUBSPOT_SYNC.vwPRODUCT_ATTRIBUTEs where PRODUCT_CODE = '${product.PRODUCT_CODE}' and ATTRIBUTE_NAME = '${product.DEAL_NAME}'`;
                console.log(filter); 
                const rvProduct = await rv.RunView({
                    EntityName: 'PRODUCT_ATTRIBUTEs',
                    ExtraFilter: `PRODUCT_CODE = '${product.PRODUCT_CODE}' AND ATTRIBUTE_NAME = '${product.DEAL_NAME}'`,
                }, currentUser);

                if(rvProduct.Success){
                    product['Attributes'] = rvProduct.Results.map((r: Record<string, any>) => `${r.ATTRIBUTE_NAME}: ${r.ATTRIBUTE_VALUE}`).join('\n');
                }
                else{
                    LogError(`Error getting product attributes for product ${product.PRODUCT_CODE}`, undefined, rvProduct.ErrorMessage);
                }
            }
        }
        else{
            LogError(`Error getting product attributes for email ${email}`, undefined, rvProducts.ErrorMessage);
        }

        console.log(email, ":", data.Courses.length, data.Products.length);

        return data;
    }
}

export function LoadCHESTVectorRelatedDataHandler(): void {
}