import { BaseLLM, ChatParams, ChatResult, ChatMessageRole, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, ModelUsage, ErrorAnalyzer, type VendorCallParameters } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { HttpPost, HttpRequestConfig, IsHttpError, IsCancellationError as IsHttpCancellation } from '@memberjunction/network-utils';
import * as Config from '../config';
import { BettyResponse, SettingsResponse } from '../generic/BettyBot.types';

@RegisterClass(BaseLLM, "BettyBotLLM")
export class BettyBotLLM extends BaseLLM {

    private aPIKey: string;
    private JWTToken: string;  // case-violation-ok-legacy-back-compat: reached by bracket access outside the declaring class, where a same-named key on an unrelated object is indistinguishable
    private TokenExpiration: Date;  // case-violation-ok-legacy-back-compat: reached by bracket access outside the declaring class, where a same-named key on an unrelated object is indistinguishable

    constructor(apiKey: string) {
        super(apiKey);
        this.aPIKey = apiKey;
        this.JWTToken = '';
        this.TokenExpiration = new Date();
    }

    /**
     * The Betty Bot request carries no temperature, output cap or seed, so the description says none of them is sent; a strict call that configures one is refused rather
     * than recorded as sent.
     */
    public override DescribeSentParameters(params: ChatParams): VendorCallParameters {
        return { VendorModelName: params.model, Temperature: null, MaxTokens: null, Seed: null };
    }

    /**
     * Betty Bot doesn't support streaming
     */
    public override get SupportsStreaming(): boolean {
        return false;
    }

    /**
     * `HttpPost` wraps an aborted request in an `HttpError` flagged `IsCancelled`; a timeout is
     * flagged `IsTimeout` instead and is not a cancellation, so it stays retriable.
     */
    protected override IsProviderAbortError(error: unknown): boolean {
        return IsHttpCancellation(error);
    }

    /**
     * Implementation of non-streaming chat completion for Betty Bot
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const cancellationToken = params.cancellationToken;
        const startTime = new Date();
        try{
            //ensure the jwt token is up to date
            const jwtResponse = await this.GetJWTToken(false, cancellationToken);
            if(!jwtResponse || jwtResponse.status !== 'SUCCESS'){
                // Create an error result
                const errorResult = new ChatResult(false, startTime, startTime);
                errorResult.statusText = 'error';
                errorResult.errorMessage = jwtResponse?.errorMessage || 'Error getting JWT token';
                return errorResult;
            }

            const endpoint: string = Config.BETTY_BOT_BASE_URL + 'response';
            // Forward the cancellation token to fetch so an abort tears down the underlying HTTP socket
            // rather than merely abandoning this promise.
            const config: Omit<HttpRequestConfig, 'Url' | 'Method' | 'Body'> = {
                Headers: {
                    Authorization: `Bearer ${this.JWTToken}`
                },
                Signal: cancellationToken
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

            const bettyResponse = await HttpPost<BettyResponse>(endpoint, data, config);
            if(!bettyResponse || !bettyResponse.Data){
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
                            content: bettyResponse.Data.response
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
            if(bettyResponse.Data.references && bettyResponse.Data.references.length > 0){
                const references = bettyResponse.Data.references;

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
            // A caller-initiated abort (or AIPromptRunner timeout) is not a Betty failure — report it
            // as a cancellation so no layer retries a request the caller gave up on.
            if(this.IsCancellationError(ex, cancellationToken)){
                return this.BuildCancelledChatResult(startTime, { error: ex, signal: cancellationToken });
            }

            if(IsHttpError(ex)){
                const httpError = ex;
                if(httpError.Status){
                    console.log(`Error calling api: ${httpError.Status} - ${httpError.StatusText}`);
                }
                else{
                    console.log(`Error calling api: ${httpError.message}`);
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

    /**
     * Retrieves (and caches) the Betty Bot JWT used to authorize chat requests.
     * @param forceRefresh when true, bypasses the cached token
     * @param cancellationToken optional signal that aborts the underlying HTTP request
     */
    public async GetJWTToken(forceRefresh?: boolean, cancellationToken?: AbortSignal): Promise<SettingsResponse | null> {
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
                token: this.aPIKey
            };

            const endpoint: string = Config.BETTY_BOT_BASE_URL + 'settings';
            const response = await HttpPost<SettingsResponse>(endpoint, data, { Signal: cancellationToken });

            if(response.Data){
                this.JWTToken = response.Data.token;
            }

            return response.Data;
        } 
        catch (error) {
            // Don't swallow a cancellation as a generic token failure — let the caller report it as one
            if(this.IsCancellationError(error, cancellationToken)){
                throw error;
            }

            if(IsHttpError(error)){
                const httpError = error;
                if(httpError.Status){
                    console.log(`Error calling api: ${httpError.Status} - ${httpError.StatusText}`);
                }
                else{
                    console.log(`Error calling api: ${httpError.message}`);
                }
            }
            else{
                console.log(`Error calling api`);
            }
            
            return null;
        }
    }
}