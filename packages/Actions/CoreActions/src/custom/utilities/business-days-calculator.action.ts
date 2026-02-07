import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";

/**
 * Action that calculates business days between two dates, accounting for weekends
 * and optionally holidays. Can also add/subtract business days from a date.
 * 
 * @example
 * ```typescript
 * // Calculate business days between dates
 * await runAction({
 *   ActionName: 'Business Days Calculator',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'DaysBetween'
 *   }, {
 *     Name: 'StartDate',
 *     Value: '2024-01-01'
 *   }, {
 *     Name: 'EndDate',
 *     Value: '2024-01-31'
 *   }]
 * });
 * 
 * // Add business days to a date
 * await runAction({
 *   ActionName: 'Business Days Calculator',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'AddDays'
 *   }, {
 *     Name: 'StartDate',
 *     Value: '2024-01-01'
 *   }, {
 *     Name: 'Days',
 *     Value: 10
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__BusinessDaysCalculator")
export class BusinessDaysCalculatorAction extends BaseAction {
    // US Federal holidays (fixed dates - actual dates may vary)
    private defaultHolidays: Record<string, string[]> = {
        'US': [
            '01-01', // New Year's Day
            '07-04', // Independence Day
            '12-25', // Christmas Day
            '12-24', // Christmas Eve (many businesses closed)
            '11-11', // Veterans Day
            // Note: Some holidays like Memorial Day, Labor Day, Thanksgiving are calculated
        ]
    };

    /**
     * Executes the business days calculation
     * 
     * @param params - The action parameters containing:
     *   - Operation: 'DaysBetween', 'AddDays', or 'SubtractDays'
     *   - StartDate: Starting date (YYYY-MM-DD format)
     *   - EndDate: Ending date (for DaysBetween operation)
     *   - Days: Number of business days to add/subtract
     *   - ExcludeHolidays: Boolean to exclude holidays (default: true)
     *   - Country: Country code for holiday calendar (default: 'US')
     * 
     * @returns Business days calculation results
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const operationParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'operation');
            const startDateParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'startdate');
            const endDateParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'enddate');
            const daysParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'days');
            const excludeHolidaysParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'excludeholidays');
            const countryParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'country');

            if (!operationParam || !operationParam.Value) {
                return {
                    Success: false,
                    Message: "Operation parameter is required (DaysBetween, AddDays, SubtractDays)",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            if (!startDateParam || !startDateParam.Value) {
                return {
                    Success: false,
                    Message: "StartDate parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const operation = operationParam.Value;
            const startDate = new Date(startDateParam.Value);
            const excludeHolidays = excludeHolidaysParam?.Value !== false && excludeHolidaysParam?.Value !== 'false';
            const country = countryParam?.Value || 'US';

            if (isNaN(startDate.getTime())) {
                return {
                    Success: false,
                    Message: "Invalid StartDate format. Use YYYY-MM-DD",
                    ResultCode: "INVALID_DATE"
                };
            }

            let result: any;

            switch (operation) {
                case 'DaysBetween':
                    if (!endDateParam || !endDateParam.Value) {
                        return {
                            Success: false,
                            Message: "EndDate parameter is required for DaysBetween operation",
                            ResultCode: "MISSING_PARAMETERS"
                        };
                    }
                    const endDate = new Date(endDateParam.Value);
                    if (isNaN(endDate.getTime())) {
                        return {
                            Success: false,
                            Message: "Invalid EndDate format. Use YYYY-MM-DD",
                            ResultCode: "INVALID_DATE"
                        };
                    }
                    result = this.calculateDaysBetween(startDate, endDate, excludeHolidays, country);
                    break;

                case 'AddDays':
                case 'SubtractDays':
                    if (!daysParam || daysParam.Value === undefined) {
                        return {
                            Success: false,
                            Message: "Days parameter is required for Add/Subtract operations",
                            ResultCode: "MISSING_PARAMETERS"
                        };
                    }
                    const days = parseInt(daysParam.Value.toString());
                    if (isNaN(days)) {
                        return {
                            Success: false,
                            Message: "Days must be a valid number",
                            ResultCode: "INVALID_VALUE"
                        };
                    }
                    const daysToAdd = operation === 'AddDays' ? days : -days;
                    result = this.addBusinessDays(startDate, daysToAdd, excludeHolidays, country);
                    break;

                default:
                    return {
                        Success: false,
                        Message: "Invalid operation. Use: DaysBetween, AddDays, or SubtractDays",
                        ResultCode: "INVALID_OPERATION"
                    };
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(result, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to calculate business days: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    private calculateDaysBetween(startDate: Date, endDate: Date, excludeHolidays: boolean, country: string): any {
        let start = new Date(startDate);
        let end = new Date(endDate);
        const isReverse = start > end;
        
        if (isReverse) {
            [start, end] = [end, start];
        }

        let businessDays = 0;
        let totalDays = 0;
        let weekends = 0;
        let holidays = 0;
        const holidayDates: string[] = [];
        const current = new Date(start);

        while (current <= end) {
            totalDays++;
            const dayOfWeek = current.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isHoliday = excludeHolidays && this.isHoliday(current, country);

            if (isWeekend) {
                weekends++;
            } else if (isHoliday) {
                holidays++;
                holidayDates.push(this.formatDate(current));
            } else {
                businessDays++;
            }

            current.setDate(current.getDate() + 1);
        }

        if (isReverse) {
            businessDays = -businessDays;
        }

        return {
            businessDays,
            totalDays: totalDays - 1, // Exclusive of start date
            weekends,
            holidays,
            holidayDates,
            startDate: this.formatDate(startDate),
            endDate: this.formatDate(endDate),
            includesPartialDays: false
        };
    }

    private addBusinessDays(startDate: Date, days: number, excludeHolidays: boolean, country: string): any {
        const result = new Date(startDate);
        const direction = days >= 0 ? 1 : -1;
        let remainingDays = Math.abs(days);
        const skippedDates: { date: string; reason: string }[] = [];

        while (remainingDays > 0) {
            result.setDate(result.getDate() + direction);
            const dayOfWeek = result.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isHoliday = excludeHolidays && this.isHoliday(result, country);

            if (isWeekend) {
                skippedDates.push({
                    date: this.formatDate(result),
                    reason: dayOfWeek === 0 ? 'Sunday' : 'Saturday'
                });
            } else if (isHoliday) {
                skippedDates.push({
                    date: this.formatDate(result),
                    reason: 'Holiday'
                });
            } else {
                remainingDays--;
            }
        }

        return {
            startDate: this.formatDate(startDate),
            businessDaysAdded: days,
            resultDate: this.formatDate(result),
            dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][result.getDay()],
            skippedDates: skippedDates.slice(-10), // Last 10 skipped dates
            totalDaysElapsed: Math.abs(Math.ceil((result.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
        };
    }

    private isHoliday(date: Date, country: string): boolean {
        const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const year = date.getFullYear();
        
        // Check fixed holidays
        const holidays = this.defaultHolidays[country] || [];
        if (holidays.includes(monthDay)) {
            return true;
        }

        // Check calculated US holidays
        if (country === 'US') {
            // Memorial Day (last Monday in May)
            if (date.getMonth() === 4 && date.getDay() === 1 && date.getDate() > 24) {
                return true;
            }
            // Labor Day (first Monday in September)
            if (date.getMonth() === 8 && date.getDay() === 1 && date.getDate() <= 7) {
                return true;
            }
            // Thanksgiving (fourth Thursday in November)
            if (date.getMonth() === 10 && date.getDay() === 4 && date.getDate() >= 22 && date.getDate() <= 28) {
                return true;
            }
            // Black Friday (day after Thanksgiving)
            if (date.getMonth() === 10 && date.getDay() === 5 && date.getDate() >= 23 && date.getDate() <= 29) {
                return true;
            }
            // Martin Luther King Jr. Day (third Monday in January)
            if (date.getMonth() === 0 && date.getDay() === 1 && date.getDate() >= 15 && date.getDate() <= 21) {
                return true;
            }
            // Presidents Day (third Monday in February)
            if (date.getMonth() === 1 && date.getDay() === 1 && date.getDate() >= 15 && date.getDate() <= 21) {
                return true;
            }
        }

        return false;
    }

    private formatDate(date: Date): string {
        return date.toISOString().split('T')[0];
    }
}