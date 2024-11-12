import { RecommendationProviderBase, RecommendationRequest, RecommendationResult } from "@memberjunction/ai-recommendations";
import { EntityInfo, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo } from "@memberjunction/core";
import { EntityRecordDocumentEntityType, RecommendationEntity, RecommendationItemEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, isAxiosError } from "axios";
import * as Config from "./config";
import { GetEmbeddingParams, RasaResponse, RasaTokenResponse, RecommendationResponse } from "./generic/models";

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

        for (const [index, recommendation] of request.Recommendations.entries()) {
            const vectorID: string = await this.GetVectorID(recommendation, entityDocumentID, request.CurrentUser);
            if(!vectorID){
                LogError(`No vector ID found for recommendation. Source Entity: ${recommendation.SourceEntityID}, Source Entity Record ID: ${recommendation.SourceEntityRecordID}`);
                result.AppendWarning(`No vector ID found for recommendation. Source Entity ID: ${recommendation.SourceEntityID}, Source Entity Record ID: ${recommendation.SourceEntityRecordID}`);
                continue;
            }

            const recommendations: RecommendationResponse[] | null = await this.GetRecommendations(token, vectorID);
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

    private async GetEmbedding(params: GetEmbeddingParams): Promise<any> {
        try{
            const config: AxiosRequestConfig = {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json',
                    'rasa-token': params.AccessToken
                },
                data: {
                    type: params.EntityType,
                    source: params.Source,
                    id: params.EntityID
                }
            };

            const excludeEmbeddings: number = params.ExcludeEmbeddings ? 1 : 0;
    
            const response: AxiosResponse<RasaResponse<any>> = await axios.get<RasaResponse<any>>(`${Config.REX_RECOMMEND_HOST}/embed?embeddings=${excludeEmbeddings}`, config);
            let data: RasaResponse<any> = response.data;
            console.log("Rex embedding data:", data);
            return null;
        }
        catch(ex){
            if(isAxiosError(ex)){
                const axiosError: AxiosError = ex;
                console.log("Error getting Rex embedding:", axiosError);
                return null;
            }
            else{
                LogError(`Error getting Rex embedding: ${ex}`);
                return null;
            }
        }
    }

    protected async GetRecommendations(accessToken: string, vectorID: string): Promise<RecommendationResponse[] | null> {
        try{
            const config: AxiosRequestConfig = {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json',
                    'rasa-token': accessToken
                }
            };

            const body = {
                source: "mj.pinecone",
                filters: [
                    {
                        type: "course",
                        max_results: 10
                    },
                    {
                        type: "course_part",
                        max_results: 10
                    },
                    {
                        type: "person",
                        max_results: 5
                    }
                ]
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
                const axiosError: AxiosError = ex;
                console.log("Error getting Rex recommendation:", axiosError);
                return null;
            }
            else{
                const rasaError: RasaResponse<any> = ex.request.data;
                LogError(`Error getting Rex recommendation: ${rasaError.metadata.errors}`);
                return null;
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
            entity.DestinationEntityRecordID = data.recordID;
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
}

export function LoadRexRecommendationsProvider() {

}