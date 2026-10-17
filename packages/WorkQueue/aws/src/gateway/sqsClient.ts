import { SQSClient, type SQSClientConfig } from '@aws-sdk/client-sqs';
import type { AwsTransportConfig } from '../config';

/** Static credentials or a credential provider. Undefined uses the SDK default chain (env, profile, role). */
export type AwsCredentialsOption = SQSClientConfig['credentials'];

export function CreateSqsClient(config: AwsTransportConfig, credentials?: AwsCredentialsOption): SQSClient {
    return new SQSClient({
        region: config.Region,
        ...(config.Endpoint ? { endpoint: config.Endpoint } : {}),
        ...(credentials ? { credentials } : {}),
    });
}
