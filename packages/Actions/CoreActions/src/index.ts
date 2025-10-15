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
export * from './custom/web/perplexity-search.action';
export * from './custom/web/google-custom-search.action';

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

// File Storage Actions - Granular operations for cloud storage
export * from './custom/files';

// Integration Actions
export * from './custom/integration/http-request.action';
export * from './custom/integration/graphql-query.action';
export * from './custom/integration/oauth-flow.action';
export * from './custom/integration/api-rate-limiter.action';
export * from './custom/integration/gamma-generate-presentation.action';

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

// User Management Actions
export * from './custom/user-management/check-user-permission.action';
export * from './custom/user-management/create-user.action';
export * from './custom/user-management/create-employee.action';
export * from './custom/user-management/assign-user-roles.action';
export * from './custom/user-management/validate-email-unique.action';

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
import { LoadPerplexitySearchAction } from './custom/web/perplexity-search.action';
import { LoadGoogleCustomSearchAction } from './custom/web/google-custom-search.action';
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
import { LoadListObjectsAction } from './custom/files/list-objects.action';
import { LoadGetMetadataAction } from './custom/files/get-metadata.action';
import { LoadGetObjectAction } from './custom/files/get-object.action';
import { LoadGetDownloadUrlAction } from './custom/files/get-download-url.action';
import { LoadGetUploadUrlAction } from './custom/files/get-upload-url.action';
import { LoadObjectExistsAction } from './custom/files/object-exists.action';
import { LoadDirectoryExistsAction } from './custom/files/directory-exists.action';
import { LoadCopyObjectAction } from './custom/files/copy-object.action';
import { LoadMoveObjectAction } from './custom/files/move-object.action';
import { LoadDeleteObjectAction } from './custom/files/delete-object.action';
import { LoadCreateDirectoryAction } from './custom/files/create-directory.action';
import { LoadDeleteDirectoryAction } from './custom/files/delete-directory.action';
import { LoadSearchStorageFilesAction } from './custom/files/search-storage-files.action';
import { LoadHTTPRequestAction } from './custom/integration/http-request.action';
import { LoadGraphQLQueryAction } from './custom/integration/graphql-query.action';
import { LoadOAuthFlowAction } from './custom/integration/oauth-flow.action';
import { LoadAPIRateLimiterAction } from './custom/integration/api-rate-limiter.action';
import { LoadGammaGeneratePresentationAction } from './custom/integration/gamma-generate-presentation.action';
import { LoadPasswordStrengthAction } from './custom/security/password-strength.action';
import { LoadConditionalAction } from './custom/workflow/conditional.action';
import { LoadLoopAction } from './custom/workflow/loop.action';
import { LoadParallelExecuteAction } from './custom/workflow/parallel-execute.action';
import { LoadRetryAction } from './custom/workflow/retry.action';
import { LoadDelayAction } from './custom/workflow/delay.action';
import { LoadExecuteAIPromptAction } from './custom/ai/execute-ai-prompt.action';
import { LoadCheckUserPermissionAction } from './custom/user-management/check-user-permission.action';
import { LoadCreateUserAction } from './custom/user-management/create-user.action';
import { LoadCreateEmployeeAction } from './custom/user-management/create-employee.action';
import { LoadAssignUserRolesAction } from './custom/user-management/assign-user-roles.action';
import { LoadValidateEmailUniqueAction } from './custom/user-management/validate-email-unique.action';
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
    LoadPerplexitySearchAction();
    LoadGoogleCustomSearchAction();
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
    LoadListObjectsAction();
    LoadGetMetadataAction();
    LoadGetObjectAction();
    LoadGetDownloadUrlAction();
    LoadGetUploadUrlAction();
    LoadObjectExistsAction();
    LoadDirectoryExistsAction();
    LoadCopyObjectAction();
    LoadMoveObjectAction();
    LoadDeleteObjectAction();
    LoadCreateDirectoryAction();
    LoadDeleteDirectoryAction();
    LoadSearchStorageFilesAction();
    LoadHTTPRequestAction();
    LoadGraphQLQueryAction();
    LoadOAuthFlowAction();
    LoadAPIRateLimiterAction();
    LoadGammaGeneratePresentationAction();
    LoadPasswordStrengthAction();
    LoadConditionalAction();
    LoadLoopAction();
    LoadParallelExecuteAction();
    LoadRetryAction();
    LoadDelayAction();
    LoadExecuteAIPromptAction();
    LoadCheckUserPermissionAction();
    LoadCreateUserAction();
    LoadCreateEmployeeAction();
    LoadAssignUserRolesAction();
    LoadValidateEmailUniqueAction();
}

// ensure that the core entities server sub-classes are loaded and not tree-shaken out
LoadCoreEntitiesServerSubClasses();