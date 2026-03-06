import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import axios from "axios";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Action that sends messages to Slack via incoming webhooks
 * 
 * @example
 * ```typescript
 * // Simple text message
 * await runAction({
 *   ActionName: 'Slack Webhook',
 *   Params: [{
 *     Name: 'WebhookURL',
 *     Value: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
 *   }, {
 *     Name: 'Message',
 *     Value: 'Hello from MemberJunction!'
 *   }]
 * });
 * 
 * // Rich message with blocks
 * await runAction({
 *   ActionName: 'Slack Webhook',
 *   Params: [{
 *     Name: 'WebhookURL',
 *     Value: webhookUrl
 *   }, {
 *     Name: 'Blocks',
 *     Value: [
 *       {
 *         type: 'header',
 *         text: {
 *           type: 'plain_text',
 *           text: 'New Order Received'
 *         }
 *       },
 *       {
 *         type: 'section',
 *         text: {
 *           type: 'mrkdwn',
 *           text: `Order *#12345* from *John Doe*\nTotal: $99.99`
 *         }
 *       }
 *     ]
 *   }]
 * });
 * 
 * // With custom username and icon
 * await runAction({
 *   ActionName: 'Slack Webhook',
 *   Params: [{
 *     Name: 'WebhookURL',
 *     Value: webhookUrl
 *   }, {
 *     Name: 'Message',
 *     Value: 'Deployment completed successfully!'
 *   }, {
 *     Name: 'Username',
 *     Value: 'Deploy Bot'
 *   }, {
 *     Name: 'IconEmoji',
 *     Value: ':rocket:'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Slack Webhook")
export class SlackWebhookAction extends BaseAction {
    
    /**
     * Sends messages to Slack via webhook
     * 
     * @param params - The action parameters containing:
     *   - WebhookURL: Slack incoming webhook URL (required)
     *   - Message: Plain text message (required if no Blocks)
     *   - Blocks: Slack Block Kit blocks array (optional, overrides Message)
     *   - Username: Override webhook's default username (optional)
     *   - IconEmoji: Override webhook's default icon (optional, e.g., ':ghost:')
     *   - IconURL: Override webhook's default icon with URL (optional)
     *   - Channel: Override webhook's default channel (optional, may be disabled)
     *   - ThreadTS: Thread timestamp to reply to (optional)
     *   - Attachments: Legacy attachments array (optional)
     * 
     * @returns Success confirmation
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const webhookURL = this.getParamValue(params, 'webhookurl');
            const message = this.getParamValue(params, 'message');
            const blocks = JSONParamHelper.getJSONParam(params, 'blocks');
            const username = this.getParamValue(params, 'username');
            const iconEmoji = this.getParamValue(params, 'iconemoji');
            const iconURL = this.getParamValue(params, 'iconurl');
            const channel = this.getParamValue(params, 'channel');
            const threadTS = this.getParamValue(params, 'threadts');
            const attachments = JSONParamHelper.getJSONParam(params, 'attachments');

            // Validate webhook URL
            if (!webhookURL) {
                return {
                    Success: false,
                    Message: "WebhookURL parameter is required",
                    ResultCode: "MISSING_WEBHOOK_URL"
                };
            }

            if (!webhookURL.startsWith('https://hooks.slack.com/')) {
                return {
                    Success: false,
                    Message: "Invalid Slack webhook URL format",
                    ResultCode: "INVALID_WEBHOOK_URL"
                };
            }

            // Validate message content
            if (!message && !blocks) {
                return {
                    Success: false,
                    Message: "Either Message or Blocks parameter is required",
                    ResultCode: "MISSING_CONTENT"
                };
            }

            // Build payload
            const payload: any = {};

            if (blocks) {
                // Use blocks if provided
                payload.blocks = Array.isArray(blocks) ? blocks : [blocks];
                
                // Add text as fallback
                if (message) {
                    payload.text = message;
                } else {
                    // Generate fallback text from blocks
                    payload.text = this.generateFallbackText(payload.blocks);
                }
            } else {
                // Use simple text message
                payload.text = message;
            }

            // Add optional parameters
            if (username) {
                payload.username = username;
            }

            if (iconEmoji && !iconURL) {
                payload.icon_emoji = iconEmoji;
            }

            if (iconURL) {
                payload.icon_url = iconURL;
            }

            if (channel) {
                payload.channel = channel;
            }

            if (threadTS) {
                payload.thread_ts = threadTS;
            }

            if (attachments) {
                payload.attachments = Array.isArray(attachments) ? attachments : [attachments];
            }

            // Send to Slack
            const response = await axios.post(webhookURL, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                validateStatus: () => true // Handle all status codes
            });

            // Check response
            if (response.status === 200 && response.data === 'ok') {
                // Add output parameters
                params.Params.push({
                    Name: 'SlackResponse',
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
                        message: "Slack message sent successfully",
                        response: response.data,
                        payload: payload
                    }, null, 2)
                };
            } else {
                // Error response
                return {
                    Success: false,
                    Message: `Slack webhook failed: ${response.data || `HTTP ${response.status}`}`,
                    ResultCode: response.status === 404 ? "WEBHOOK_NOT_FOUND" : 
                               response.status === 400 ? "INVALID_PAYLOAD" : 
                               "WEBHOOK_ERROR"
                };
            }

        } catch (error) {
            return {
                Success: false,
                Message: `Slack webhook failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "REQUEST_FAILED"
            };
        }
    }

    /**
     * Generate fallback text from blocks
     */
    private generateFallbackText(blocks: any[]): string {
        const textParts: string[] = [];

        for (const block of blocks) {
            if (block.type === 'section' && block.text) {
                textParts.push(this.extractText(block.text));
            } else if (block.type === 'header' && block.text) {
                textParts.push(this.extractText(block.text));
            } else if (block.type === 'context' && block.elements) {
                const contextTexts = block.elements
                    .filter((el: any) => el.type === 'plain_text' || el.type === 'mrkdwn')
                    .map((el: any) => this.extractText(el));
                textParts.push(contextTexts.join(' '));
            }
        }

        return textParts.join('\n') || 'Slack message';
    }

    /**
     * Extract text from Slack text object
     */
    private extractText(textObj: any): string {
        if (typeof textObj === 'string') {
            return textObj;
        }
        if (textObj && textObj.text) {
            return textObj.text;
        }
        return '';
    }

    /**
     * Get parameter value by name (case-insensitive)
     */
    private getParamValue(params: RunActionParams, name: string): any {
        const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
        return param?.Value;
    }
}