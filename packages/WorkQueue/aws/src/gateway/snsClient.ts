import { SNSClient } from '@aws-sdk/client-sns';
import type { AwsTransportConfig } from '../config';
import type { AwsCredentialsOption } from './sqsClient';

export function CreateSnsClient(config: AwsTransportConfig, credentials?: AwsCredentialsOption): SNSClient {
    return new SNSClient({
        region: config.Region,
        ...(config.Endpoint ? { endpoint: config.Endpoint } : {}),
        ...(credentials ? { credentials } : {}),
    });
}
