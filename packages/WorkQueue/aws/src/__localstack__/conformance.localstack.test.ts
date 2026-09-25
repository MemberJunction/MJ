import { RunTransportConformanceSuite } from '@memberjunction/work-queue-core/testing/vitest';
import { LocalStackHarness } from './LocalStackHarness';

RunTransportConformanceSuite('AwsTransportDriver on LocalStack', new LocalStackHarness());
