import { LogError, LogStatus, Metadata, RunView } from "@memberjunction/core";
import { GetDataParams } from "../models/RelatedDataHandler.types";
import { RecommendationEntityType, RecommendationItemEntity, RecommendationItemEntityType } from "@memberjunction/core-entities";

export class RelatedDatahandler {
    public async GetData(params: GetDataParams): Promise<Record<string, any>> {
        const md: Metadata = new Metadata();
        const rv: RunView = new RunView();

        let results: Record<string, any> = {};
        
        const rvResults = await rv.RunViews([
            //First, get the source record 
            {
                EntityName: params.SourceRecordEntityName,
                ExtraFilter: `ID = '${params.RecordID}'`,
            },
            //Next, get the recommendations tied to the source records
            {
                EntityName: 'Recommendations',
                ExtraFilter: `RecommendationRunID = '${params.RecommendationRunID}' AND SourceEntity = '${params.SourceRecordEntityName}' AND SourceEntityRecordID = '${params.RecordID}'`
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

        //Next, Get the recommended items
        const rvRecommendationItems = await rv.RunView<RecommendationItemEntityType>({
            EntityName: 'Recommendation Items',
            ExtraFilter: `RecommendationID IN ('${recommendations.map(recommendation => recommendation.ID).join(",")}')`,
        }, params.CurrentUser);


        if(!rvRecommendationItems.Success) {
            throw new Error(`Error getting recommendation items for ${params.SourceRecordEntityName} record with ID: ${params.RecordID}: ${rvRecommendationItems.ErrorMessage}`);
        }

        console.log(`Found ${rvRecommendationItems.Results.length} recommendation items`);
        console.log(rvRecommendationItems.Results);

        //Finally, get the record each recommendation item points to
        for(const recommendationItem of rvRecommendationItems.Results){
            const rvEntityResult = await rv.RunView({
                EntityName: recommendationItem.DestinationEntity,
                ExtraFilter: `ID = '${recommendationItem.DestinationEntityRecordID}'`
            }, params.CurrentUser);

            if(!rvEntityResult.Success) {
                LogError(`Error getting recommended ${recommendationItem.DestinationEntity} record with ID: ${recommendationItem.DestinationEntityRecordID}: ${rvEntityResult.ErrorMessage}`);
                continue;
            }

            if(recommendationItem.DestinationEntity){
                if(!results[recommendationItem.DestinationEntity] || !results[recommendationItem.DestinationEntity].length){
                    results[recommendationItem.DestinationEntity] = [];
                }
    
                results[recommendationItem.DestinationEntity].push(...rvEntityResult.Results);
            }
            else{
                LogError(`Recommendation Item ${recommendationItem.ID} has no DestinationEntity`);
            }
        }

        return results;
    }
}