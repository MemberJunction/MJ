import { EntityInfo, LogError, LogStatus, Metadata, RunView } from "@memberjunction/core";
import { GetDataParams } from "../models/RelatedDataHandler.types";
import { RecommendationEntityType, RecommendationItemEntityType } from "@memberjunction/core-entities";

export class RelatedDatahandler {
    public async GetData(params: GetDataParams): Promise<Record<string, any>> {
        try{
            const md: Metadata = new Metadata();
        const rv: RunView = new RunView();

        let results: Record<string, any> = {};

        const sourceEntityInfo: EntityInfo | undefined = md.EntityByName(params.SourceRecordEntityName);
        if(!sourceEntityInfo){
            throw new Error(`Error: Could not find entity ${params.SourceRecordEntityName}`);
        }
        
        const recommendationRunIDs: string = params.RecommendationRunIDs.map((recommendationRunID: string) => `'${recommendationRunID}'`).join(",");
        const rvResults = await rv.RunViews([
            //First, get the source record 
            {
                EntityName: params.SourceRecordEntityName,
                ExtraFilter: `${sourceEntityInfo.FirstPrimaryKey.Name} = '${params.RecordID}'`,
            },
            //Next, get the recommendations tied to the source records
            {
                EntityName: 'Recommendations',
                ExtraFilter: `RecommendationRunID IN (${recommendationRunIDs}) AND SourceEntity = '${params.SourceRecordEntityName}' AND SourceEntityRecordID = '${params.RecordID}'`
            }
        ], params.CurrentUser);

        if(!rvResults[0].Success) {
            throw new Error(`Error getting ${params.SourceRecordEntityName} record with ID: ${params.RecordID}: ${rvResults[0].ErrorMessage}`);
        }

        const sourceRecord: Record<string, any> = rvResults[0].Results[0];
        results["SourceRecord"] = sourceRecord;

        if(!rvResults[1].Success) {
            throw new Error(`Error getting recommendations for ${params.SourceRecordEntityName} record with ID: ${params.RecordID}: ${rvResults[1].ErrorMessage}`);
        }

        if(rvResults[1].Results.length === 0){
            LogStatus(`No recommendations found for ${params.SourceRecordEntityName} record with ID: ${params.RecordID}`);
            return results;
        }

        const recommendations: RecommendationEntityType[] = rvResults[1].Results;
        const filterstirng: string = `RecommendationID IN (${recommendations.map(recommendation => `'${recommendation.ID}'`).join(", ")})`; 
        
        //Next, Get the recommended items
        const rvRecommendationItems = await rv.RunView<RecommendationItemEntityType>({
            EntityName: 'Recommendation Items',
            ExtraFilter: filterstirng,
        }, params.CurrentUser);


        if(!rvRecommendationItems.Success) {
            throw new Error(`Error getting recommendation items for ${params.SourceRecordEntityName} record with ID: ${params.RecordID}: ${rvRecommendationItems.ErrorMessage}`);
        }

        //Finally, get the record each recommendation item points to
        for(const recommendationItem of rvRecommendationItems.Results){
            const DestinationEntityInfo: EntityInfo | undefined = md.EntityByName(recommendationItem.DestinationEntity);
            if(!DestinationEntityInfo){
                LogError(`Error: Could not find entity ${recommendationItem.DestinationEntity}`);
                continue;
            }

            const needsQuotes: string = DestinationEntityInfo.FirstPrimaryKey.NeedsQuotes ? "'" : "";
            let filterString: string = "";

            if(recommendationItem.DestinationEntityRecordID.includes("||")){
                //PRODUCT_CODE|8636||PRODUCT_NAME|CHEST SEEK Pulmonary Medicine: 33rd Edition
                const keys: string[] = recommendationItem.DestinationEntityRecordID.split("||");
                const keyValues: Record<string, string> = {};
                keys.forEach((key: string) => {
                    const keyParts: string[] = key.split("|");
                    keyValues[keyParts[0]] = keyParts[1];
                });

                filterString = Object.keys(keyValues).map((key: string) => `${key} = ${needsQuotes}${keyValues[key]}${needsQuotes}`).join(" AND ");
            }
            else{
                filterString = `${DestinationEntityInfo.FirstPrimaryKey.Name} = ${needsQuotes}${recommendationItem.DestinationEntityRecordID}${needsQuotes}`;
            }

            const rvEntityResult = await rv.RunView({
                EntityName: recommendationItem.DestinationEntity,
                ExtraFilter: filterString
            }, params.CurrentUser);

            if(!rvEntityResult.Success) {
                LogError(`Error getting recommended ${recommendationItem.DestinationEntity} record with ID: ${recommendationItem.DestinationEntityRecordID}: ${rvEntityResult.ErrorMessage}`);
                continue;
            }

            if(recommendationItem.DestinationEntity){
                if(!results[DestinationEntityInfo.BaseTable] || !results[DestinationEntityInfo.BaseTable].length){
                    results[DestinationEntityInfo.BaseTable] = [];
                }
    
                results[DestinationEntityInfo.BaseTable].push(...rvEntityResult.Results);
            }
            else{
                LogError(`Recommendation Item ${recommendationItem.ID} has no DestinationEntity`);
            }
        }

        return results;
        }
        catch(ex){
            LogError(ex.message);
            return null;
        }
    }
}