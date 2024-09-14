import { RecommendationProviderBase, RecommendationRequest, RecommendationResult } from "@memberjunction/ai-recommendations";
import { LogError, Metadata } from "@memberjunction/core";
import { RecommendationEntity, RecommendationItemEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, isAxiosError } from "axios";
import * as Config from "./config";

/**
 * This class implements the API calls to the rasa.io Rex Recommendation engine and will save results into the MJ Recommendations/Recommendation Items tables.
 */
@RegisterClass(RecommendationProviderBase, "rasa.io Rex")
export class RexRecommendationsProvider extends RecommendationProviderBase {

    public async Recommend(request: RecommendationRequest): Promise<RecommendationResult> {
        // Rex handles each request one record at a time:
        const result = new RecommendationResult(request);
        result.Success = true; // start off true and set to false if any errors occur

        const token: string = await this.GetAccessToken();
        console.log("token:", token);

        for (const recommendation of request.Recommendations) {
            // Call the Rex API
            const items = await this.CallRexAPI(recommendation);
            // Save the results
            if(!await this.SaveRecommendation(recommendation, request.RunID, items)) {
                result.Success = false;
                result.ErrorMessage += `Error saving recommendation for ${recommendation.ID}\n`;
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
            // Call the Rex API here and populate the items array
            // THIS IS A PLACHOLDER, switch to using axios probably
            const apiResult = await fetch(`https://rexapi.rasa.io/recommendations/${recommendation.ID}`);
            // now process the api result and populate the items array
            const apiItems = await apiResult.json();
            const md = new Metadata();
            for (const apiItem of apiItems) {
                const item = await md.GetEntityObject<RecommendationItemEntity>("Recommendation Items");
                // THE BELOW MAPPING IS MADE UP, MAP actual rasa.io Rex fields here with any required transformations
                item.RecommendationID = recommendation.ID;
                item.DestinationEntityID = apiItem.DestinationEntityId;
                item.DestinationEntityRecordID = apiItem.DestinationEntityRecordID;
                item.MatchProbability = apiItem.MatchProbability;
                items.push(item);
            }
            return items;
        }
        catch (e) {
            LogError(e);
        }
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
    
            const response: AxiosResponse<string> = await axios.post<string>(`${Config.API_HOST}/tokens`, body, config);
            let token: string = response.data; 
            return token;
        }
        catch(ex){
            if(isAxiosError(ex)){
                const axiosError: AxiosError = ex;
                console.log("Error calling Rex API:", axiosError);
                return null;
            }
            else{
                LogError(`Error calling Rex API: ${ex}`);
                return null;
            }
        }
    }
}

export function LoadRexRecommendationsProvider() {

}