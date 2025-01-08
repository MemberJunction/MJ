import { BaseLLM, ChatParams, ChatResult, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult } from '@memberjunction/ai';
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

    public async ChatCompletion(params: ChatParams): Promise<ChatResult>{
        try{
            const startTime = new Date();
            
            //ensure the jwt token is up to date
            const jwtResponse = await this.GetJWTToken();
            if(!jwtResponse || jwtResponse.status !== 'SUCCESS'){
                return {
                    success: false,
                    errorMessage: jwtResponse?.errorMessage || 'Error getting JWT token',
                } as any;
            }

            const endpoint: string = Config.BETTY_BOT_BASE_URL + 'response';
            const config: AxiosRequestConfig = {
                headers: {
                    Authorization: `Bearer ${this.JWTToken}`
                }
            };

            const userMessage = params.messages.find(m => m.role === 'user');
            if(!userMessage){
                return {
                    success: false,
                    errorMessage: 'No user message found in params',
                } as any;
            }

            const data = {
                input: userMessage.content,
            };

            const bettyResponse = await axios.post<BettyResponse>(endpoint, data, config);
            if(!bettyResponse || !bettyResponse.data){
                return {
                    success: false,
                    errorMessage: 'Error getting response from Betty',
                } as any;
            }

            const endTime = new Date();
            const response: ChatResult = {
                success: true,
                statusText: "OK",
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                data: {
                    choices: [
                        {
                            message: {
                                role: 'assistant',
                                content: bettyResponse.data.response
                            },
                            finish_reason: "",
                            index: 0
                        }
                    ],
                    usage: {
                        totalTokens: 0,
                        promptTokens: 0,
                        completionTokens: 0,
                    }
                },
                errorMessage: "",
                exception: null
            }

            /**
             * If Betty gave us any references, add them to the response
             * as an additional choice
             */
            if(bettyResponse.data.references && bettyResponse.data.references.length > 0){
                let text: string = "Here are some additional resources that may help you: \n";
                const references = bettyResponse.data.references;
                for(const reference of references){
                    text += `${reference.title}: ${reference.link} \n`;
                }

                response.data.choices.push({
                    message: {
                        role: 'assistant',
                        content: text
                    },
                    finish_reason: "",
                    index: 1
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
            
            return {
                success: false,
                errorMessage: 'Error getting response from Betty',
            } as any;
        }
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

export function LoadBettyBotLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}