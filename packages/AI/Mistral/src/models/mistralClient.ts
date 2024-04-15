import axios from 'axios';
import axiosRetry from 'axios-retry';
import { ListModelsResponse, ChatCompletetionRequest, ChatCompletionResponse, EmbeddingResponse } from '../generic/mistral.types';

//This is a 1:1 copy of the mistralAI client library
//but modified to work with MJ
//see https://github.com/mistralai/client-js 

/**
 * A simple and lightweight client for the Mistral API
 * @param {*} apiKey can be set as an environment variable MISTRAL_API_KEY,
 * or provided in this parameter
 * @param {*} endpoint defaults to https://api.mistral.ai
 */
export class MistralClient {

    private RETRY_STATUS_CODES = [429, 500, 502, 503, 504];
    private ENDPOINT = 'https://api.mistral.ai';

    endpoint: string;
    apiKey: string;
    textDecoder: TextDecoder;

    constructor(config: {apiKey?: string, endpoint?: string}) {
        this.endpoint = config.endpoint || this.ENDPOINT;
        this.apiKey = config.apiKey;

        this.textDecoder = new TextDecoder();

        axiosRetry(axios, {
        retries: 3,
        retryCondition: (error) => {
            return this.RETRY_STATUS_CODES.includes(error.response.status);
        },

        retryDelay: (retryCount, error) => {
            console.debug(`retry attempt: ${retryCount}`, error);
            return retryCount * 500;
        },
        });
    }

  /**
   *
   * @param {*} method
   * @param {*} path
   * @param {*} request
   * @return {Promise<T>}
   */
  private async request<T>(method: string, path: string, request?: any): Promise<T> 
  {
    const response = await axios({
        method: method,
        url: `${this.endpoint}/${path}`,
        data: request || {},
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        responseType: request?.stream ? 'stream' : 'json',
      }).catch((error) => {
        console.error(error);
        return error.response;
      });
      return response.data;
  }

  /**
   * Creates a chat completion request
   * @param {*} model
   * @param {*} messages
   * @param {*} temperature
   * @param {*} maxTokens
   * @param {*} topP
   * @param {*} randomSeed
   * @param {*} stream
   * @param {*} safeMode
   * @return {Promise<Object>}
   */
  _makeChatCompletionRequest = function(
    model,
    messages,
    temperature,
    maxTokens,
    topP,
    randomSeed,
    stream,
    safeMode,
  ) {
    return {
      model: model,
      messages: messages,
      temperature: temperature ?? undefined,
      max_tokens: maxTokens ?? undefined,
      top_p: topP ?? undefined,
      random_seed: randomSeed ?? undefined,
      stream: stream ?? undefined,
      safe_prompt: safeMode ?? undefined,
    };
  };


  /**
   * Returns a list of the available models
   * @return {Promise<ListModelsResponse>}
   */
  public async listModels(): Promise<ListModelsResponse> {
    const response: ListModelsResponse = await this.request('get', 'v1/models');
    return response;
  }

  /**
   * A chat endpoint without streaming
   * @param {*} model the name of the model to chat with, e.g. mistral-tiny
   * @param {*} messages an array of messages to chat with, e.g.
   * [{role: 'user', content: 'What is the best French cheese?'}]
   * @param {*} temperature the temperature to use for sampling, e.g. 0.5
   * @param {*} maxTokens the maximum number of tokens to generate, e.g. 100
   * @param {*} topP the cumulative probability of tokens to generate, e.g. 0.9
   * @param {*} randomSeed the random seed to use for sampling, e.g. 42
   * @param {*} safeMode whether to use safe mode, e.g. true
   * @return {Promise<Object>}
   */
  public async chat(params: ChatCompletetionRequest): Promise<ChatCompletionResponse> {
    const response: ChatCompletionResponse = await this.request(
      'post', 'v1/chat/completions', params,
    );

    return response;
  }

  /**
   * A chat endpoint that streams responses.
   * @param {*} model the name of the model to chat with, e.g. mistral-tiny
   * @param {*} messages an array of messages to chat with, e.g.
   * [{role: 'user', content: 'What is the best French cheese?'}]
   * @param {*} temperature the temperature to use for sampling, e.g. 0.5
   * @param {*} maxTokens the maximum number of tokens to generate, e.g. 100
   * @param {*} topP the cumulative probability of tokens to generate, e.g. 0.9
   * @param {*} randomSeed the random seed to use for sampling, e.g. 42
   * @param {*} safeMode whether to use safe mode, e.g. true
   * @return {Promise<Object>}
   */
  chatStream = async function* ({
    model,
    messages,
    temperature,
    maxTokens,
    topP,
    randomSeed,
    safeMode}) {
    const request = this._makeChatCompletionRequest(
      model,
      messages,
      temperature,
      maxTokens,
      topP,
      randomSeed,
      true,
      safeMode,
    );
    const response = await this._request(
      'post', 'v1/chat/completions', request,
    );

    for await (const chunk of response) {
      const chunkString = this.textDecoder.decode(chunk);
      // split the chunks by new line
      const chunkLines = chunkString.split('\n');
      // Iterate through the lines
      for (const chunkLine of chunkLines) {
        // If the line starts with data: then it is a chunk
        if (chunkLine.startsWith('data:')) {
          const chunkData = chunkLine.substring(6).trim();
          if (chunkData !== '[DONE]') {
            yield JSON.parse(chunkData);
          }
        }
      }
    }
  };

  /**
   * An embedddings endpoint that returns embeddings for a single,
   * or batch of inputs
   * @param {*} model The embedding model to use, e.g. mistral-embed
   * @param {*} input The input to embed,
   * e.g. ['What is the best French cheese?']
   * @return {Promise<Object>}
   */
  public async embeddings(model: string, input: string[]): Promise<EmbeddingResponse> {
    const request = {
        model: model,
        input: input, 
      };
      const response: EmbeddingResponse = await this.request(
        'post', 'v1/embeddings', request,
      );
      return response;
  }
}