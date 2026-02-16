import { RecommendationProviderBase, RecommendationRequest, RecommendationResult } from "@memberjunction/ai-recommendations";
import { EntityInfo, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo } from "@memberjunction/core";
import { MJEntityRecordDocumentEntityType, MJListDetailEntity, MJListEntity, MJRecommendationEntity, MJRecommendationItemEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, isAxiosError } from "axios";
import { GetRecommendationParams, RasaResponse, RasaTokenResponse, RecommendationResponse, RecommendContextData } from "./generic/models";
import * as Config from "./config";

/**
 * This class implements the API calls to the rasa.io Rex Recommendation engine and will save results into the MJ Recommendations/Recommendation Items tables.
 */
@RegisterClass(RecommendationProviderBase, "rasa.io Rex")
export class RexRecommendationsProvider extends RecommendationProviderBase {

    MinProbability: number = 0;
    MaxProbability: number = 1;

    public async Recommend(request: RecommendationRequest<RecommendContextData>): Promise<RecommendationResult> {

        // Rex handles each request one record at a time:
        const result = new RecommendationResult(request);
        result.Success = true; // start off true and set to false if any errors occur

        const options: RecommendContextData = request.Options;
        if(!options || !options.EntityDocumentID){
            LogError("EntityDocumentID is a required options paramter {request.Options.EntityDocumentID}");
            result.AppendError("EntityDocumentID is a required options paramter {request.Options.EntityDocumentID}");
            return result;
        }

        const entityDocumentID: string = options.EntityDocumentID;
        const token: string = await this.GetAccessToken();

        if(!token){
            LogError("Error getting Rex access token");
            result.AppendError("Error getting Rex access token");
            return result;
        }

        if(!request.Options){
            LogError("Options are required for Rex recommendations");
            result.AppendError("Options are required for Rex recommendations")
            return result;
        }

        const typeMap: Record<string, string> = options.TypeMap || {};

        const recommendationList = request.Recommendations;
        let batchCount: number = 0;
        for(let i = 0; i < recommendationList.length; i += Config.REX_BATCH_SIZE){
            const batch = recommendationList.slice(i, i + Config.REX_BATCH_SIZE);
            LogStatus(`Processing batch ${batchCount + 1} of ${Math.ceil(recommendationList.length / Config.REX_BATCH_SIZE)}`);

            const recordDocuments: MJEntityRecordDocumentEntityType[] | null = await this.GetEntityRecordDocuments(batch, entityDocumentID, request.CurrentUser);
            if(!recordDocuments){
                LogError(`Error getting entity record documents for batch ${batchCount + 1}`);
                result.AppendError(`Error getting entity record documents for batch ${batchCount + 1}`);
                continue;
            }

            await Promise.all(batch.map(async (recommendation: MJRecommendationEntity, index: number) => {
                const recordDocument: MJEntityRecordDocumentEntityType | undefined = recordDocuments.find(rd => rd.RecordID == recommendation.SourceEntityRecordID);
                if(!recordDocument){
                    LogError(`No record document found for recommendation. Source Entity: ${recommendation.SourceEntityID}, Source Entity Record ID: ${recommendation.SourceEntityRecordID}`);
                    result.AppendWarning(`No record document found for recommendation. Source Entity: ${recommendation.SourceEntityID}, Source Entity Record ID: ${recommendation.SourceEntityRecordID}`);
                    return;
                }

                const vectorID: string = recordDocument.VectorID;
                if(!vectorID){
                    LogError(`No vector ID found for recommendation. Source Entity: ${recommendation.SourceEntityID}, Source Entity Record ID: ${recommendation.SourceEntityRecordID}`);
                    result.AppendWarning(`No vector ID found for recommendation. Source Entity ID: ${recommendation.SourceEntityID}, Source Entity Record ID: ${recommendation.SourceEntityRecordID}`);
                    return;
                }
    
                const GetRecommendationParams: GetRecommendationParams = {
                    AccessToken: token,
                    VectorID: vectorID,
                    Options: options,
                    ErrorListID: request.ErrorListID,
                    CurrentUser: request.CurrentUser
                };
    
                const recommendations: RecommendationResponse[] | null = await this.GetRecommendations(GetRecommendationParams);
                if(!recommendations){
                    LogError(`Error getting recommendations for recommendation: Source Entity: ${recommendation.SourceEntityID}, Source Entity Record ID: ${recommendation.SourceEntityRecordID}`);
                    result.AppendWarning(`Error getting recommendations for recommendation: Source Entity: ${recommendation.SourceEntityID}, Source Entity Record ID: ${recommendation.SourceEntityRecordID}`);
                    return;
                }
    
                LogStatus(`Creating ${recommendations.length} recommendation items for recommendation ${index + 1}/${batch.length} of batch ${batchCount + 1}`);
                const recommendationItemEntities: MJRecommendationItemEntity[] = await this.ConvertRecommendationsToItemEntities(recommendation, recommendations, request.CurrentUser, typeMap);
    
                // Save the results
                const saveResult = await this.SaveRecommendation(recommendation, request.RunID, recommendationItemEntities);
                if(!saveResult){
                    LogError("Not all recommendation items were successfully saved");
                    result.AppendError("Not all recommendation items were successfully saved");
                }
            }));

            batchCount++;
            LogStatus(`Batch ${batchCount + 1} of ${Math.ceil(recommendationList.length / Config.REX_BATCH_SIZE)} completed`);
        }

        return result;
    }

    private async GetEntityRecordDocuments(recommendations: MJRecommendationEntity[], entityDocumentID: string, currentUser?: UserInfo): Promise<MJEntityRecordDocumentEntityType[] | null> {
        const rv: RunView = new RunView();

        //assuming all recommendations have the same source entity ID
        const entityID: string = recommendations[0].SourceEntityID;
        const recordIDs: string = recommendations.map(r => `'${r.SourceEntityRecordID}'`).join(",");

        const rvVectorResult: RunViewResult<MJEntityRecordDocumentEntityType> = await rv.RunView<MJEntityRecordDocumentEntityType>({
            EntityName: "MJ: Entity Record Documents",
            ExtraFilter: `EntityDocumentID = '${entityDocumentID}'
                AND EntityID = '${entityID}'
                AND RecordID IN (${recordIDs})`,
            MaxRows: Config.REX_BATCH_SIZE
        }, currentUser);

        if(!rvVectorResult.Success) {
            LogError(`Error getting vector IDs for recommendation batch: ${rvVectorResult.ErrorMessage}`);
            return null;
        }

        return rvVectorResult.Results;
    }

    private async GetAccessToken(): Promise<string | null> {
        try{
            LogStatus("Getting Rex access token");

            const config: AxiosRequestConfig = {
                auth: {
                    username: Config.REX_USERNAME,
                    password: Config.REX_PASSWORD
                },
                headers: {
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json'
                }
            };

            const body = {
                key: Config.REX_API_KEY
            }
    
            const response: AxiosResponse<RasaResponse<RasaTokenResponse>> = await axios.post<RasaResponse<RasaTokenResponse>>(`${Config.REX_API_HOST}/tokens`, body, config);
            let data: RasaResponse<RasaTokenResponse> = response.data;
            if(!response || data.results.length == 0){
                LogError("No token returned from Rex API");
                return null;
            }

            return data.results[0]["rasa-token"];
        }
        catch(ex){
            if(isAxiosError(ex)){
                const axiosError: AxiosError = ex;
                LogError("Error getting Rex access token:", undefined, axiosError);
                return null;
            }
            else{
                LogError(`Error getting Rex access token: ${ex}`);
                return null;
            }
        }
    }

    protected async GetRecommendations(params: GetRecommendationParams): Promise<RecommendationResponse[] | null> {
        try{
            const config: AxiosRequestConfig = {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json',
                    'rasa-token': params.AccessToken
                }
            };

            const body = {
                type: params.Options.type,
                source: "mj.pinecone",
                id: params.VectorID,
                filters: params.Options.filters
            };
    
            const response: AxiosResponse<RasaResponse<RecommendationResponse>> = await axios.post<RasaResponse<RecommendationResponse>>(`${Config.REX_RECOMMEND_HOST}/suggest?entity=0&id_response=0`, body, config);
            if(!response){
                return null;
            }

            const data: RasaResponse<RecommendationResponse> = response.data;
            return data.results;
        }
        catch(ex){
            if(isAxiosError(ex)){
                const axiosError: AxiosError<RasaResponse> = ex;
                const rasaError = axiosError.response.data;
                LogError("Error getting Rex recommendation, rasaError:", undefined, rasaError);
                if(params.ErrorListID){
                    const errorMessage: string = JSON.stringify(rasaError);
                    await this.AddRecordToErrorsList(params.ErrorListID, params.VectorID, errorMessage, params.CurrentUser);
                }
            }
            else{
                LogError(`Error getting Rex recommendation:`, undefined, ex);
            }
        }
    }

    protected async ConvertRecommendationsToItemEntities(recommendationEntity: MJRecommendationEntity, recommendations: RecommendationResponse[], currentUser: UserInfo, typeMap: Record<string, string>): Promise<MJRecommendationItemEntity[]> {
        const md = new Metadata();        

        const entities: MJRecommendationItemEntity[] =  await Promise.all(recommendations.map(async (recommendation: RecommendationResponse) => {
            const entity: MJRecommendationItemEntity = await md.GetEntityObject<MJRecommendationItemEntity>("MJ: Recommendation Items", currentUser);
            let data: Record<'entityID' | 'recordID', string> = this.GetEntityIDAndRecordID(recommendation, typeMap);

            entity.NewRecord();
            entity.RecommendationID = recommendationEntity.ID;
            entity.DestinationEntityID = data.entityID;
            entity.DestinationEntityRecordID = recommendation.id;
            entity.MatchProbability = this.ClampScore(recommendation.score, this.MinProbability, this.MaxProbability);

            return entity;
        }));

        return entities;
    }

    private GetEntityIDAndRecordID(data: RecommendationResponse, typeMap: Record<string, string>): Record<'entityID' | 'recordID', string> {
        let entityName: string = "";
        let entityID: string = "";
        let recordID: string = "";

        entityName = typeMap[data.type] || entityName;
        if(!entityName){
            LogStatus(`Type ${data.type} not found in type map, using base values`);

            switch(data.type){
                case "course":
                    entityName = "Contents";
                    break;
                case "course_part":
                    entityName = "Course Parts";
                    break;
                case "person":
                    entityName = "Contributors";
                    break;
                default:
                    LogError(`Unknown entity type: ${data.type}`);
                    break;
            };
        }

        const md: Metadata = new Metadata();
        const entity: EntityInfo | undefined = md.EntityByName(entityName);
        
        if(!entity){
            LogError(`Error getting entity info for entity ${entityName}`);
            return { entityID, recordID };
        }

        entityID = entity.ID;
        
        //IDs of external records arent helpful,
        //as they dont exist in MJ and we have no way
        //of fetching them
        if(data.source == "mj.pinecone"){
            //Taking a shortcut here, the above entities
            //all have a single primary key named "ID",
            //so a simple split call grabbing the second
            //element will get the ID.
            const IDSplit = data.id.split("-");
            if(IDSplit.length > 1){
                recordID = IDSplit[1];
            }
        }

        return { entityID, recordID };
    }

    /**
     * Ensures that the probability param is within the min and max params.
     * @param probability The probability to clamp
     * @param minValue The minimum value the probability can be
     * @param maxValue The maximum value the probability can be
     * @returns The clamped probability
     */
    protected ClampScore(probability: number, minValue: number, maxValue: number): number {
        if(probability < minValue){
            return minValue;
        }

        if(probability > maxValue){
            return maxValue;
        }

        return probability;
    }

    private async AddRecordToErrorsList(listID: string, recordID: string, errorMessage: string, currentUser?: UserInfo): Promise<void> {
        const md: Metadata = new Metadata();
        const listDetail: MJListDetailEntity = await md.GetEntityObject<MJListDetailEntity>("MJ: List Details", currentUser);
        
        listDetail.NewRecord();
        listDetail.ListID = listID;
        listDetail.RecordID = recordID;
        listDetail.AdditionalData = errorMessage;

        const saveResult: boolean = await listDetail.Save();
        if(!saveResult){
            LogError(`Error saving error list detail for record ${recordID}`, undefined, listDetail.LatestResult);
        }
        else{
            LogStatus(`Error logged to list detail record ${recordID}`);
        }
    }
}