import { BaseLLM, ChatParams, ChatResult, ChatMessageRole, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, ModelUsage, ErrorAnalyzer } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import * as Config from '../config';
import { BettyResponse, SettingsResponse } from '../generic/BettyBot.types';

@RegisterClass(BaseLLM, "BettyBotLLM")
export class BettyBotLLM extends BaseLLM {

    private APIKey: string;
    private JWTToken: string;
    private TokenExpiration: Date;

    constructor(apiKey: string) {
        super(apiKey);
        this.APIKey = apiKey;
        this.JWTToken = '';
        this.TokenExpiration = new Date();
    }

    /**
     * Betty Bot doesn't support streaming
     */
    public override get SupportsStreaming(): boolean {
        return false;
    }

    /**
     * Implementation of non-streaming chat completion for Betty Bot
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        try{
            const startTime = new Date();
            
            //ensure the jwt token is up to date
            const jwtResponse = await this.GetJWTToken();
            if(!jwtResponse || jwtResponse.status !== 'SUCCESS'){
                // Create an error result
                const errorResult = new ChatResult(false, startTime, startTime);
                errorResult.statusText = 'error';
                errorResult.errorMessage = jwtResponse?.errorMessage || 'Error getting JWT token';
                return errorResult;
            }

            const endpoint: string = Config.BETTY_BOT_BASE_URL + 'response';
            const config: AxiosRequestConfig = {
                headers: {
                    Authorization: `Bearer ${this.JWTToken}`
                }
            };

            const userMessage = params.messages.find(m => m.role === ChatMessageRole.user);
            if(!userMessage){
                // Create an error result
                const errorResult = new ChatResult(false, startTime, startTime);
                errorResult.statusText = 'error';
                errorResult.errorMessage = 'No user message found in params';
                return errorResult;
            }

            const data = {
                input: userMessage.content,
            };

            const bettyResponse = await axios.post<BettyResponse>(endpoint, data, config);
            if(!bettyResponse || !bettyResponse.data){
                // Create an error result
                const errorResult = new ChatResult(false, startTime, startTime);
                errorResult.statusText = 'error';
                errorResult.errorMessage = 'Error getting response from Betty';
                return errorResult;
            }

            const endTime = new Date();
            
            // Create a proper ChatResult instance with constructor params
            const response = new ChatResult(true, startTime, endTime);
            
            // Set properties
            response.statusText = "OK";
            response.data = {
                choices: [
                    {
                        message: {
                            role: ChatMessageRole.assistant,
                            content: bettyResponse.data.response
                        },
                        finish_reason: "",
                        index: 0
                    }
                ],
                usage: new ModelUsage(0, 0)
            };
            response.errorMessage = "";
            response.exception = null;

            /**
             * If Betty gave us any references, add them to the response
             * as additional choices:
             * - choice[1]: Formatted text version (for display/backwards compatibility)
             * - choice[2]: Raw JSON structure (for programmatic access)
             */
            if(bettyResponse.data.references && bettyResponse.data.references.length > 0){
                const references = bettyResponse.data.references;

                // Choice 1: Formatted text version
                let text: string = "Here are some additional resources that may help you: \n";
                for(const reference of references){
                    text += `${reference.title}: ${reference.link} \n`;
                }

                response.data.choices.push({
                    message: {
                        role: ChatMessageRole.assistant,
                        content: text
                    },
                    finish_reason: "",
                    index: 1
                });

                // Choice 2: Raw structured JSON
                response.data.choices.push({
                    message: {
                        role: ChatMessageRole.assistant,
                        content: JSON.stringify(references)
                    },
                    finish_reason: "references_json",
                    index: 2
                });
            }

            return response;
        }
        catch(ex){
            if(axios.isAxiosError(ex)){
                const axiosError: AxiosError = ex;
                if(axiosError.response){
                    console.log(`Error calling api: ${axiosError.response.status} - ${axiosError.response.statusText}`);
                }
                else{
                    console.log(`Error calling api: ${axiosError.message}`);
                }
            }
            else{
                console.log(`Error calling api`);
            }
            
            // Create a proper error result
            const now = new Date();
            const errorResult = new ChatResult(false, now, now);
            errorResult.statusText = 'error';
            errorResult.errorMessage = 'Error getting response from Betty';
            errorResult.data = {
                choices: [],
                usage: new ModelUsage(0, 0)
            };
            errorResult.errorInfo = ErrorAnalyzer.analyzeError(ex, 'BettyBot');
            
            return errorResult;
        }
    }
    
    /**
     * Since BettyBot doesn't support streaming, we don't implement these methods.
     * They should never be called because SupportsStreaming returns false.
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        throw new Error("BettyBot does not support streaming");
    }
    
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string | undefined;
        usage?: any | null;
    } {
        throw new Error("BettyBot does not support streaming");
    }
    
    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: any | null | undefined,
        usage: any | null | undefined
    ): ChatResult {
        throw new Error("BettyBot does not support streaming");
    }
 
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error("Method not implemented.");
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }

    public async GetJWTToken(forceRefresh?: boolean): Promise<SettingsResponse | null> {
        try {

            if(this.JWTToken && !forceRefresh){
                const now = new Date();
                //only return the cached token if its younger than 30 minutes
                if(this.TokenExpiration.getTime() - now.getTime() < 30 * 60 * 1000){
                    return {
                        status: 'SUCCESS',
                        errorMessage: '',
                        enabledFeatures: [],
                        token: this.JWTToken
                    };
                }
            }

            const data = {
                token: this.APIKey
            };

            const endpoint: string = Config.BETTY_BOT_BASE_URL + 'settings';
            const response = await axios.post<SettingsResponse>(endpoint, data);

            if(response.data){
                this.JWTToken = response.data.token;
            }

            return response.data;
        } 
        catch (error) {
            if(axios.isAxiosError(error)){
                const axiosError = error as AxiosError;
                if(axiosError.response){
                    console.log(`Error calling api: ${axiosError.response.status} - ${axiosError.response.statusText}`);
                }
                else{
                    console.log(`Error calling api: ${axiosError.message}`);
                }
            }
            else{
                console.log(`Error calling api`);
            }
            
            return null;
        }
    }
}