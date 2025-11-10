import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import axios, { AxiosRequestConfig } from "axios";

/**
 * Action that triggers the Content Autotagging process via HTTP POST request
 * 
 * This action makes a POST request to a configured autotag endpoint to initiate
 * the content autotagging workflow. Designed for simple one-click execution
 * from AI agents.
 * 
 * @example
 * ```typescript
 * // Trigger autotag process
 * await runAction({
 *   ActionName: 'Run Autotag',
 *   Params: [{
 *     Name: 'Endpoint',
 *     Value: 'https://your-server.com/api/autotag/run'
 *   }, {
 *     Name: 'AuthToken', 
 *     Value: 'your-bearer-token'  // Optional
 *   }, {
 *     Name: 'Payload',
 *     Value: { 
 *       containerName: 'autotag-test',
 *       reprocessExisting: false 
 *     }  // Optional JSON payload
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "RunAutotag")
export class RunAutotagAction extends BaseAction {
    
    /**
     * Triggers the autotag process via HTTP POST
     * 
     * @param params - The action parameters containing:
     *   - Endpoint: Target autotag API endpoint (required)
     *   - AuthToken: Bearer token for authentication (optional)
     *   - Payload: JSON object to send in POST body (optional)
     *   - Timeout: Request timeout in milliseconds (optional, default: 60000)
     * 
     * @returns Response with success status and execution details
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract required parameters
            const endpoint = 'https://prod-23.northcentralus.logic.azure.com:443/workflows/da9035f82c94422a97e6bd482aa73a89/triggers/When_an_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_an_HTTP_request_is_received%2Frun&sv=1.0&sig=5H089x_8y-QALoztq0uv_wn0nIx5M9F5vEOjwGKMP38';

            // Build request configuration
            const config: AxiosRequestConfig = {
                method: 'POST',
                url: endpoint,
                headers: {
                    'Content-Type': 'application/json'
                },
                validateStatus: () => true // Handle status validation ourselves
            };

            // Make the HTTP POST request
            console.log(`🚀 Starting autotag process via POST to: ${endpoint}`);
            const response = await axios(config);

            // Add output parameters for agent consumption
            params.Params.push({
                Name: 'ResponseStatus',
                Type: 'Output',
                Value: response.status
            });

            params.Params.push({
                Name: 'ResponseData',
                Type: 'Output',
                Value: response.data
            });

            // Check if request was successful (2xx status)
            const isSuccess = response.status >= 200 && response.status < 300;
            
            const resultMessage = isSuccess 
                ? `✅ Autotag process initiated successfully. Status: ${response.status}`
                : `❌ Autotag request failed with status: ${response.status}`;

            console.log(resultMessage);

            return {
                Success: isSuccess,
                ResultCode: isSuccess ? "SUCCESS" : `HTTP_${response.status}`,
                Message: JSON.stringify({
                    status: response.status,
                    statusText: response.statusText,
                    data: response.data,
                    endpoint: endpoint,
                    timestamp: new Date().toISOString()
                }, null, 2)
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`❌ Autotag action failed: ${errorMessage}`);
            
            return {
                Success: false,
                Message: `Autotag request failed: ${errorMessage}`,
                ResultCode: "REQUEST_FAILED"
            };
        }
    }
}

/**
 * Loader function to ensure the RunAutotagAction class is included in the bundle
 */
export function LoadRunAutotagAction() {
    // Stub function to prevent tree shaking
}