import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import axios from "axios";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Action that sends messages to Microsoft Teams via incoming webhooks
 * 
 * @example
 * ```typescript
 * // Simple text message
 * await runAction({
 *   ActionName: 'Teams Webhook',
 *   Params: [{
 *     Name: 'WebhookURL',
 *     Value: 'https://company.webhook.office.com/webhookb2/...'
 *   }, {
 *     Name: 'Message',
 *     Value: 'Build completed successfully!'
 *   }]
 * });
 * 
 * // Rich card with sections
 * await runAction({
 *   ActionName: 'Teams Webhook',
 *   Params: [{
 *     Name: 'WebhookURL',
 *     Value: webhookUrl
 *   }, {
 *     Name: 'Title',
 *     Value: 'Deployment Status'
 *   }, {
 *     Name: 'Message',
 *     Value: 'Production deployment completed'
 *   }, {
 *     Name: 'ThemeColor',
 *     Value: '00FF00'
 *   }, {
 *     Name: 'Sections',
 *     Value: [{
 *       activityTitle: 'Deployment Details',
 *       facts: [
 *         { name: 'Environment', value: 'Production' },
 *         { name: 'Version', value: 'v2.5.0' },
 *         { name: 'Duration', value: '5 minutes' }
 *       ]
 *     }]
 *   }]
 * });
 * 
 * // Adaptive Card
 * await runAction({
 *   ActionName: 'Teams Webhook',
 *   Params: [{
 *     Name: 'WebhookURL',
 *     Value: webhookUrl
 *   }, {
 *     Name: 'Card',
 *     Value: {
 *       type: 'AdaptiveCard',
 *       version: '1.2',
 *       body: [{
 *         type: 'TextBlock',
 *         text: 'Hello from MemberJunction!',
 *         size: 'Large',
 *         weight: 'Bolder'
 *       }]
 *     }
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Teams Webhook")
export class TeamsWebhookAction extends BaseAction {
    
    /**
     * Sends messages to Microsoft Teams via webhook
     * 
     * @param params - The action parameters containing:
     *   - WebhookURL: Teams incoming webhook URL (required)
     *   - Message: Plain text message (required if no Card)
     *   - Card: Adaptive Card JSON (optional, overrides other formatting)
     *   - Title: Card title (optional)
     *   - ThemeColor: Hex color for card accent (optional, e.g., '0076D7')
     *   - Summary: Card summary (optional)
     *   - Sections: Array of MessageCard sections (optional)
     *   - PotentialAction: Array of actions for the card (optional)
     * 
     * @returns Success confirmation
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const webhookURL = this.getParamValue(params, 'webhookurl');
            const message = this.getParamValue(params, 'message');
            const card = JSONParamHelper.getJSONParam(params, 'card');
            const title = this.getParamValue(params, 'title');
            const themeColor = this.getParamValue(params, 'themecolor');
            const summary = this.getParamValue(params, 'summary');
            const sections = JSONParamHelper.getJSONParam(params, 'sections');
            const potentialAction = JSONParamHelper.getJSONParam(params, 'potentialaction');

            // Validate webhook URL
            if (!webhookURL) {
                return {
                    Success: false,
                    Message: "WebhookURL parameter is required",
                    ResultCode: "MISSING_WEBHOOK_URL"
                };
            }

            if (!webhookURL.includes('webhook.office.com')) {
                return {
                    Success: false,
                    Message: "Invalid Teams webhook URL format",
                    ResultCode: "INVALID_WEBHOOK_URL"
                };
            }

            // Validate content
            if (!message && !card) {
                return {
                    Success: false,
                    Message: "Either Message or Card parameter is required",
                    ResultCode: "MISSING_CONTENT"
                };
            }

            // Build payload
            let payload: any;

            if (card) {
                // Use Adaptive Card
                payload = {
                    type: "message",
                    attachments: [{
                        contentType: "application/vnd.microsoft.card.adaptive",
                        content: card
                    }]
                };
            } else {
                // Use MessageCard format
                payload = {
                    "@type": "MessageCard",
                    "@context": "https://schema.org/extensions"
                };

                if (summary) {
                    payload.summary = summary;
                } else if (message) {
                    payload.summary = message.substring(0, 100);
                }

                if (title) {
                    payload.title = title;
                }

                if (message) {
                    payload.text = message;
                }

                if (themeColor) {
                    // Ensure color is in hex format without #
                    payload.themeColor = themeColor.replace('#', '');
                }

                if (sections && Array.isArray(sections)) {
                    payload.sections = sections;
                }

                if (potentialAction && Array.isArray(potentialAction)) {
                    payload.potentialAction = potentialAction;
                }
            }

            // Send to Teams
            const response = await axios.post(webhookURL, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                validateStatus: () => true // Handle all status codes
            });

            // Check response
            if (response.status === 200) {
                // Success response from Teams is "1"
                const isSuccess = response.data === 1 || response.data === "1";
                
                if (isSuccess) {
                    // Add output parameters
                    params.Params.push({
                        Name: 'TeamsResponse',
                        Type: 'Output',
                        Value: response.data
                    });

                    params.Params.push({
                        Name: 'MessageSent',
                        Type: 'Output',
                        Value: payload
                    });

                    return {
                        Success: true,
                        ResultCode: "MESSAGE_SENT",
                        Message: JSON.stringify({
                            message: "Teams message sent successfully",
                            response: response.data,
                            payload: payload
                        }, null, 2)
                    };
                } else {
                    return {
                        Success: false,
                        Message: `Teams webhook returned unexpected response: ${response.data}`,
                        ResultCode: "UNEXPECTED_RESPONSE"
                    };
                }
            } else if (response.status === 400) {
                // Bad request - usually malformed payload
                return {
                    Success: false,
                    Message: `Invalid payload: ${response.data || 'Bad Request'}`,
                    ResultCode: "INVALID_PAYLOAD"
                };
            } else if (response.status === 413) {
                // Payload too large
                return {
                    Success: false,
                    Message: "Payload too large. Teams webhooks have a size limit.",
                    ResultCode: "PAYLOAD_TOO_LARGE"
                };
            } else if (response.status === 429) {
                // Rate limited
                return {
                    Success: false,
                    Message: "Rate limited. Too many requests to Teams webhook.",
                    ResultCode: "RATE_LIMITED"
                };
            } else {
                // Other error
                return {
                    Success: false,
                    Message: `Teams webhook failed: HTTP ${response.status} - ${response.data}`,
                    ResultCode: `HTTP_${response.status}`
                };
            }

        } catch (error) {
            return {
                Success: false,
                Message: `Teams webhook failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "REQUEST_FAILED"
            };
        }
    }

    /**
     * Get parameter value by name (case-insensitive)
     */
    private getParamValue(params: RunActionParams, name: string): any {
        const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
        return param?.Value;
    }
}