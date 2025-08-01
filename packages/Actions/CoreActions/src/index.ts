export * from './generated/action_subclasses';

// Communication Actions
export * from './custom/communication/send-single-message.action';
export * from './custom/communication/slack-webhook.action';
export * from './custom/communication/teams-webhook.action';

// CRUD Actions
export * from './custom/crud/create-record.action';
export * from './custom/crud/get-record.action';
export * from './custom/crud/update-record.action';
export * from './custom/crud/delete-record.action';

// Demo Actions
export * from './custom/demo/get-weather.action';
export * from './custom/demo/get-stock-price.action';
export * from './custom/demo/calculate-expression.action';
export * from './custom/demo/color-converter.action';
export * from './custom/demo/text-analyzer.action';
export * from './custom/demo/unit-converter.action';

// Utility Actions
export * from './custom/utilities/vectorize-entity.action';
export * from './custom/utilities/business-days-calculator.action';
export * from './custom/utilities/ip-geolocation.action';
export * from './custom/utilities/census-data-lookup.action';
export * from './custom/utilities/external-change-detection.action';
export * from './custom/utilities/qr-code.action';

// Web Actions
export * from './custom/web/web-search.action';
export * from './custom/web/web-page-content.action';
export * from './custom/web/url-link-validator.action';
export * from './custom/web/url-metadata-extractor.action';

// Data Transformation Actions
export * from './custom/data/csv-parser.action';
export * from './custom/data/json-transform.action';
export * from './custom/data/xml-parser.action';
export * from './custom/data/aggregate-data.action';
export * from './custom/data/data-mapper.action';

// File Operation Actions
export * from './custom/files/pdf-generator.action';
export * from './custom/files/pdf-extractor.action';
export * from './custom/files/excel-reader.action';
export * from './custom/files/excel-writer.action';
export * from './custom/files/file-compress.action';

// Integration Actions
export * from './custom/integration/http-request.action';
export * from './custom/integration/graphql-query.action';
export * from './custom/integration/oauth-flow.action';
export * from './custom/integration/api-rate-limiter.action';

// Security Actions
export * from './custom/security/password-strength.action';

// Workflow Control Actions
export * from './custom/workflow/conditional.action';
export * from './custom/workflow/loop.action';
export * from './custom/workflow/parallel-execute.action';
export * from './custom/workflow/retry.action';
export * from './custom/workflow/delay.action';

// AI Actions
export * from './custom/ai/execute-ai-prompt.action';

// Import Load functions to prevent tree shaking of @RegisterClass decorators
import { LoadSendSingleMessageAction } from './custom/communication/send-single-message.action';
import { LoadSlackWebhookAction } from './custom/communication/slack-webhook.action';
import { LoadTeamsWebhookAction } from './custom/communication/teams-webhook.action';
import { LoadCreateRecordAction } from './custom/crud/create-record.action';
import { LoadGetRecordAction } from './custom/crud/get-record.action';
import { LoadUpdateRecordAction } from './custom/crud/update-record.action';
import { LoadDeleteRecordAction } from './custom/crud/delete-record.action';
import { LoadGetWeatherAction } from './custom/demo/get-weather.action';
import { LoadGetStockPriceAction } from './custom/demo/get-stock-price.action';
import { LoadCalculateExpressionAction } from './custom/demo/calculate-expression.action';
import { LoadColorConverterAction } from './custom/demo/color-converter.action';
import { LoadTextAnalyzerAction } from './custom/demo/text-analyzer.action';
import { LoadUnitConverterAction } from './custom/demo/unit-converter.action';
import { LoadVectorizeEntityAction } from './custom/utilities/vectorize-entity.action';
import { LoadBusinessDaysCalculatorAction } from './custom/utilities/business-days-calculator.action';
import { LoadIPGeolocationAction } from './custom/utilities/ip-geolocation.action';
import { LoadCensusDataLookupAction } from './custom/utilities/census-data-lookup.action';
import { LoadExternalChangeDetectionAction } from './custom/utilities/external-change-detection.action';
import { LoadQRCodeAction } from './custom/utilities/qr-code.action';
import { LoadWebSearchAction } from './custom/web/web-search.action';
import { LoadWebPageContentAction } from './custom/web/web-page-content.action';
import { LoadURLLinkValidatorAction } from './custom/web/url-link-validator.action';
import { LoadURLMetadataExtractorAction } from './custom/web/url-metadata-extractor.action';
import { LoadCSVParserAction } from './custom/data/csv-parser.action';
import { LoadJSONTransformAction } from './custom/data/json-transform.action';
import { LoadXMLParserAction } from './custom/data/xml-parser.action';
import { LoadAggregateDataAction } from './custom/data/aggregate-data.action';
import { LoadDataMapperAction } from './custom/data/data-mapper.action';
import { LoadPDFGeneratorAction } from './custom/files/pdf-generator.action';
import { LoadPDFExtractorAction } from './custom/files/pdf-extractor.action';
import { LoadExcelReaderAction } from './custom/files/excel-reader.action';
import { LoadExcelWriterAction } from './custom/files/excel-writer.action';
import { LoadFileCompressAction } from './custom/files/file-compress.action';
import { LoadHTTPRequestAction } from './custom/integration/http-request.action';
import { LoadGraphQLQueryAction } from './custom/integration/graphql-query.action';
import { LoadOAuthFlowAction } from './custom/integration/oauth-flow.action';
import { LoadAPIRateLimiterAction } from './custom/integration/api-rate-limiter.action';
import { LoadPasswordStrengthAction } from './custom/security/password-strength.action';
import { LoadConditionalAction } from './custom/workflow/conditional.action';
import { LoadLoopAction } from './custom/workflow/loop.action';
import { LoadParallelExecuteAction } from './custom/workflow/parallel-execute.action';
import { LoadRetryAction } from './custom/workflow/retry.action';
import { LoadDelayAction } from './custom/workflow/delay.action';
import { LoadExecuteAIPromptAction } from './custom/ai/execute-ai-prompt.action';
import { LoadGeneratedActions } from './generated/action_subclasses';
import { LoadCoreEntitiesServerSubClasses } from '@memberjunction/core-entities-server';

export function LoadAllCoreActions() {
    LoadGeneratedActions()
    // Call all Load functions to ensure @RegisterClass decorators execute
    // This prevents tree shaking from removing the action classes
    LoadSendSingleMessageAction();
    LoadSlackWebhookAction();
    LoadTeamsWebhookAction();
    LoadCreateRecordAction();
    LoadGetRecordAction();
    LoadUpdateRecordAction();
    LoadDeleteRecordAction();
    LoadGetWeatherAction();
    LoadGetStockPriceAction();
    LoadCalculateExpressionAction();
    LoadColorConverterAction();
    LoadTextAnalyzerAction();
    LoadUnitConverterAction();
    LoadVectorizeEntityAction();
    LoadBusinessDaysCalculatorAction();
    LoadIPGeolocationAction();
    LoadCensusDataLookupAction();
    LoadExternalChangeDetectionAction();
    LoadQRCodeAction();
    LoadWebSearchAction();
    LoadWebPageContentAction();
    LoadURLLinkValidatorAction();
    LoadURLMetadataExtractorAction();
    LoadCSVParserAction();
    LoadJSONTransformAction();
    LoadXMLParserAction();
    LoadAggregateDataAction();
    LoadDataMapperAction();
    LoadPDFGeneratorAction();
    LoadPDFExtractorAction();
    LoadExcelReaderAction();
    LoadExcelWriterAction();
    LoadFileCompressAction();
    LoadHTTPRequestAction();
    LoadGraphQLQueryAction();
    LoadOAuthFlowAction();
    LoadAPIRateLimiterAction();
    LoadPasswordStrengthAction();
    LoadConditionalAction();
    LoadLoopAction();
    LoadParallelExecuteAction();
    LoadRetryAction();
    LoadDelayAction();
    LoadExecuteAIPromptAction();
}

// ensure that the core entities server sub-classes are loaded and not tree-shaken out
LoadCoreEntitiesServerSubClasses();