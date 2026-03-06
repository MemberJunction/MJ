import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import axios from "axios";

/**
 * Action that retrieves current stock price and related information for a specified ticker symbol
 * using the Yahoo Finance API through a public proxy that doesn't require an API key.
 * 
 * @example
 * ```typescript
 * // Get stock price for Apple
 * await runAction({
 *   ActionName: 'Get Stock Price',
 *   Params: [{
 *     Name: 'Ticker',
 *     Value: 'AAPL'
 *   }]
 * });
 * 
 * // Get stock price for Microsoft
 * await runAction({
 *   ActionName: 'Get Stock Price',
 *   Params: [{
 *     Name: 'Ticker',
 *     Value: 'MSFT'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__GetStockPrice")
export class GetStockPriceAction extends BaseAction {
    /**
     * Executes the stock price retrieval action
     * 
     * @param params - The action parameters containing:
     *   - Ticker: The stock ticker symbol (e.g., AAPL, MSFT, GOOGL)
     * 
     * @returns A promise resolving to an ActionResultSimple with:
     *   - Success: true if stock data was retrieved
     *   - ResultCode: "SUCCESS", "INVALID_TICKER", or "FAILED"
     *   - ResultData: Object containing stock information
     *   - Message: Error message if failed
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const tickerParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'ticker');

            if (!tickerParam || !tickerParam.Value) {
                return {
                    Success: false,
                    Message: "Ticker parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const ticker = tickerParam.Value.toUpperCase();

            // Using Yahoo Finance API v8 through query1.finance.yahoo.com
            // This endpoint provides real-time stock data without requiring authentication
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (!response.data.chart || !response.data.chart.result || response.data.chart.result.length === 0) {
                return {
                    Success: false,
                    Message: `Invalid ticker symbol: ${ticker}`,
                    ResultCode: "INVALID_TICKER"
                };
            }

            const result = response.data.chart.result[0];
            const quote = result.indicators.quote[0];
            const meta = result.meta;

            // Get the latest values
            const lastIndex = quote.close.length - 1;
            const currentPrice = meta.regularMarketPrice || quote.close[lastIndex];
            const previousClose = meta.previousClose || meta.chartPreviousClose;
            const change = currentPrice - previousClose;
            const changePercent = (change / previousClose) * 100;

            const stockData = {
                ticker: ticker,
                companyName: meta.longName || meta.shortName || ticker,
                exchange: meta.exchangeName,
                currency: meta.currency,
                marketState: meta.marketState,
                pricing: {
                    currentPrice: parseFloat(currentPrice.toFixed(2)),
                    previousClose: parseFloat(previousClose.toFixed(2)),
                    change: parseFloat(change.toFixed(2)),
                    changePercent: parseFloat(changePercent.toFixed(2)),
                    dayHigh: meta.regularMarketDayHigh || Math.max(...quote.high.filter(h => h !== null)),
                    dayLow: meta.regularMarketDayLow || Math.min(...quote.low.filter(l => l !== null)),
                    volume: meta.regularMarketVolume || quote.volume[lastIndex],
                    marketCap: meta.marketCap || null
                },
                tradingInfo: {
                    timezone: meta.timezone,
                    exchangeTimezoneName: meta.exchangeTimezoneName,
                    regularMarketTime: new Date(meta.regularMarketTime * 1000).toISOString(),
                    preMarketPrice: meta.preMarketPrice || null,
                    postMarketPrice: meta.postMarketPrice || null
                },
                ranges: {
                    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || null,
                    fiftyTwoWeekLow: meta.fiftyTwoWeekLow || null,
                    fiftyDayAverage: meta.fiftyDayAverage || null,
                    twoHundredDayAverage: meta.twoHundredDayAverage || null
                }
            };

            // add the stock data as an output parameter too
            params.Params.push({
                Name: "StockData",
                Value: stockData,
                Type: "Output"
            });
            // and the price itself is the most common thing people want so add that as well
            params.Params.push({
                Name: "CurrentPrice",
                Value: currentPrice,
                Type: "Output"
            });

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(stockData, null, 2)
            };

        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return {
                    Success: false,
                    Message: `Invalid ticker symbol: ${params.Params.find(p => p.Name === 'Ticker')?.Value}`,
                    ResultCode: "INVALID_TICKER"
                };
            }

            return {
                Success: false,
                Message: `Failed to retrieve stock data: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }
}