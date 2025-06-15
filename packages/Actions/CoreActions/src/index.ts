export * from './generated/action_subclasses';

// Communication Actions
export * from './custom/communication/send-single-message.action';

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

// Import Load functions to prevent tree shaking of @RegisterClass decorators
import { LoadSendSingleMessageAction } from './custom/communication/send-single-message.action';
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

// Call all Load functions to ensure @RegisterClass decorators execute
// This prevents tree shaking from removing the action classes
LoadSendSingleMessageAction();
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