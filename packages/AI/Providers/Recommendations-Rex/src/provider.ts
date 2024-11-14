import { RecommendationProviderBase, RecommendationRequest, RecommendationResult } from "@memberjunction/ai-recommendations";
import { EntityInfo, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo } from "@memberjunction/core";
import { EntityRecordDocumentEntityType, ListDetailEntity, ListEntity, RecommendationEntity, RecommendationItemEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, isAxiosError } from "axios";
import * as Config from "./config";
import { GetEmbeddingParams, GetRecommendationParams, RasaResponse, RasaTokenResponse, RecommendationResponse } from "./generic/models";

/**
 * This class implements the API calls to the rasa.io Rex Recommendation engine and will save results into the MJ Recommendations/Recommendation Items tables.
 */
@RegisterClass(RecommendationProviderBase, "rasa.io Rex")
export class RexRecommendationsProvider extends RecommendationProviderBase {

    MinProbability: number = 0;
    MaxProbability: number = 1;

    PeronsEntityID: string = "";
    CoursesEntityID: string = "";
    CoursePartsEntityID: string = "";

    public async Recommend(request: RecommendationRequest): Promise<RecommendationResult> {

        // Rex handles each request one record at a time:
        const result = new RecommendationResult(request);
        result.Success = true; // start off true and set to false if any errors occur

        if(!request.Options || !request.Options.EntityDocumentID){
            LogError("EntityDocumentID is a required options paramter {request.Options.EntityDocumentID}");
            result.AppendError("EntityDocumentID is a required options paramter {request.Options.EntityDocumentID}");
            return result;
        }

        const entityDocumentID: string = request.Options.EntityDocumentID;
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

        for (const [index, recommendation] of request.Recommendations.entries()) {
            const vectorID: string = await this.GetVectorID(recommendation, entityDocumentID, request.CurrentUser);
            if(!vectorID){
                LogError(`No vector ID found for recommendation. Source Entity: ${recommendation.SourceEntityID}, Source Entity Record ID: ${recommendation.SourceEntityRecordID}`);
                result.AppendWarning(`No vector ID found for recommendation. Source Entity ID: ${recommendation.SourceEntityID}, Source Entity Record ID: ${recommendation.SourceEntityRecordID}`);
                continue;
            }

            const GetRecommendationParams: GetRecommendationParams = {
                AccessToken: token,
                VectorID: vectorID,
                Options: request.Options,
                ErrorListID: request.ErrorListID,
                CurrentUser: request.CurrentUser
            };
            const recommendations: RecommendationResponse[] | null = await this.GetRecommendations(GetRecommendationParams);
            if(!recommendations){
                LogError(`Error getting recommendations for recommendation: Source Entity: ${recommendation.SourceEntityID}, Source Entity Record ID: ${recommendation.SourceEntityRecordID}`);
                result.AppendWarning(`Error getting recommendations for recommendation: Source Entity: ${recommendation.SourceEntityID}, Source Entity Record ID: ${recommendation.SourceEntityRecordID}`);
                continue;
            }

            LogStatus(`Creating ${recommendations.length} recommendation items for recommendation ${index + 1}/${request.Recommendations.length}`);
            const recommendationItemEntities: RecommendationItemEntity[] = await this.ConvertRecommendationsToItemEntities(recommendation, recommendations, request.CurrentUser);

            // Save the results
            const saveResult = await this.SaveRecommendation(recommendation, request.RunID, recommendationItemEntities);
            if(!saveResult){
                LogError("Not all recommendation items were successfully saved");
                result.AppendError("Not all recommendation items were successfully saved");
            }
        }

        return result;
    }

    /**
     * This method actually calls the Rex API for each individual recommendation and gets a list of items back.
     * @param recommendation 
     */
    protected async CallRexAPI(recommendation: RecommendationEntity): Promise<RecommendationItemEntity[]> {
        const items: RecommendationItemEntity[] = [];
        try {
            const apiResult = await fetch(`https://rexapi.rasa.io/recommendations/${recommendation.ID}`);
            const apiItems = await apiResult.json();
            const md = new Metadata();
            
            for (const apiItem of apiItems) {
                const item = await md.GetEntityObject<RecommendationItemEntity>("Recommendation Items");
                item.RecommendationID = recommendation.ID;
                item.DestinationEntityID = apiItem.DestinationEntityId;
                item.DestinationEntityRecordID = apiItem.DestinationEntityRecordID;
                item.MatchProbability = this.ClampScore(apiItem.MatchProbability, this.MinProbability, this.MaxProbability);
                items.push(item);
            }
            return items;
        }
        catch (e) {
            LogError(e);
        }
    }

    private async GetVectorID(recommendation: RecommendationEntity, entityDocumentID: string, currentUser?: UserInfo): Promise<string | null> {
        const rv: RunView = new RunView();

        const rvVectorResult: RunViewResult<EntityRecordDocumentEntityType> = await rv.RunView<EntityRecordDocumentEntityType>({
            EntityName: "Entity Record Documents",
            ExtraFilter: `EntityDocumentID = '${entityDocumentID}'
                AND EntityID = '${recommendation.SourceEntityID}'
                AND RecordID = '${recommendation.SourceEntityRecordID}'`
        }, currentUser);

        if(!rvVectorResult.Success) {
            LogError(`Error getting vector ID for recommendation: ${recommendation.ID}: ${rvVectorResult.ErrorMessage}`);
            return null;
        }

        if(rvVectorResult.Results.length == 0) {
            return null;
        }

        return rvVectorResult.Results[0].VectorID;
    }

    private async GetAccessToken(): Promise<string | null> {
        try{
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
                console.log("No token returned from Rex API");
                return null;
            }

            return data.results[0]["rasa-token"];
        }
        catch(ex){
            if(isAxiosError(ex)){
                const axiosError: AxiosError = ex;
                console.log("Error getting Rex access token:", axiosError);
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
                filters: params.Options
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
                console.log("Error getting Rex recommendation:", rasaError);
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

    protected async ConvertRecommendationsToItemEntities(recommendationEntity: RecommendationEntity, recommendations: RecommendationResponse[], currentUser: UserInfo): Promise<RecommendationItemEntity[]> {
        const md = new Metadata();
        const entities: RecommendationItemEntity[] = [];

        for (const recommendation of recommendations) {
            const entity: RecommendationItemEntity = await md.GetEntityObject<RecommendationItemEntity>("Recommendation Items", currentUser);
            let data: Record<'entityID' | 'recordID', string> = this.GetEntityIDAndRecordID(recommendation);

            entity.NewRecord();
            entity.RecommendationID = recommendationEntity.ID;
            entity.DestinationEntityID = data.entityID;
            entity.DestinationEntityRecordID = recommendation.id;
            entity.MatchProbability = this.ClampScore(recommendation.score, this.MinProbability, this.MaxProbability);
            
            entities.push(entity);
        }

        return entities;
    }

    private GetEntityIDAndRecordID(data: RecommendationResponse): Record<'entityID' | 'recordID', string> {
        let entityName: string = "";
        let entityID: string = "";
        let recordID: string = "";

        switch(data.type){
            case "course":
                entityName = "Courses";
                break;
            case "course_part":
                entityName = "Course Parts";
                break;
            case "person":
                entityName = "Persons";
                break;
            default:
                LogError(`Unknown entity type: ${data.type}`);
                break;
        };

        const md: Metadata = new Metadata();
        const entity: EntityInfo = md.Entities.find(e => e.Name == entityName);
        entityID = entity.ID;
        
        //IDs of external records arent helpful,
        //as they dont exist in MJ and we have no way
        //of fetching them
        if(data.source == "mj.pinecone"){
            //Taking a shortcut here, the above entities
            //all have a single primary key named "ID",
            //so a simple split call grabbing the second
            //element will get the ID.
            const IDSplit = data.id.split("|");
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
        const listDetail: ListDetailEntity = await md.GetEntityObject<ListDetailEntity>("List Details", currentUser);
        
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

export function LoadRexRecommendationsProvider() {

}