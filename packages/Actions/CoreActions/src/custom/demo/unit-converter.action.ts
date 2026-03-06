import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";

/**
 * Action that converts values between different units of measurement.
 * Supports length, weight, temperature, volume, area, speed, and time conversions.
 * 
 * @example
 * ```typescript
 * // Convert miles to kilometers
 * await runAction({
 *   ActionName: 'Unit Converter',
 *   Params: [{
 *     Name: 'Value',
 *     Value: 5
 *   }, {
 *     Name: 'FromUnit',
 *     Value: 'miles'
 *   }, {
 *     Name: 'ToUnit',
 *     Value: 'kilometers'
 *   }]
 * });
 * 
 * // Convert temperature
 * await runAction({
 *   ActionName: 'Unit Converter',
 *   Params: [{
 *     Name: 'Value',
 *     Value: 32
 *   }, {
 *     Name: 'FromUnit',
 *     Value: 'fahrenheit'
 *   }, {
 *     Name: 'ToUnit',
 *     Value: 'celsius'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__UnitConverter")
export class UnitConverterAction extends BaseAction {
    private conversions: Record<string, Record<string, number>> = {
        // Length conversions (base: meters)
        length: {
            meter: 1, meters: 1, m: 1,
            kilometer: 0.001, kilometers: 0.001, km: 0.001,
            centimeter: 100, centimeters: 100, cm: 100,
            millimeter: 1000, millimeters: 1000, mm: 1000,
            mile: 0.000621371, miles: 0.000621371, mi: 0.000621371,
            yard: 1.09361, yards: 1.09361, yd: 1.09361,
            foot: 3.28084, feet: 3.28084, ft: 3.28084,
            inch: 39.3701, inches: 39.3701, in: 39.3701,
            nautical_mile: 0.000539957, nautical_miles: 0.000539957, nmi: 0.000539957
        },
        // Weight conversions (base: grams)
        weight: {
            gram: 1, grams: 1, g: 1,
            kilogram: 0.001, kilograms: 0.001, kg: 0.001,
            milligram: 1000, milligrams: 1000, mg: 1000,
            pound: 0.00220462, pounds: 0.00220462, lb: 0.00220462, lbs: 0.00220462,
            ounce: 0.035274, ounces: 0.035274, oz: 0.035274,
            ton: 0.000001, tons: 0.000001, t: 0.000001,
            metric_ton: 0.000001, metric_tons: 0.000001,
            stone: 0.000157473, stones: 0.000157473
        },
        // Volume conversions (base: liters)
        volume: {
            liter: 1, liters: 1, l: 1,
            milliliter: 1000, milliliters: 1000, ml: 1000,
            gallon: 0.264172, gallons: 0.264172, gal: 0.264172,
            quart: 1.05669, quarts: 1.05669, qt: 1.05669,
            pint: 2.11338, pints: 2.11338, pt: 2.11338,
            cup: 4.22675, cups: 4.22675,
            fluid_ounce: 33.814, fluid_ounces: 33.814, fl_oz: 33.814,
            tablespoon: 67.628, tablespoons: 67.628, tbsp: 67.628,
            teaspoon: 202.884, teaspoons: 202.884, tsp: 202.884,
            cubic_meter: 0.001, cubic_meters: 0.001, m3: 0.001,
            cubic_foot: 0.0353147, cubic_feet: 0.0353147, ft3: 0.0353147
        },
        // Area conversions (base: square meters)
        area: {
            square_meter: 1, square_meters: 1, m2: 1, sqm: 1,
            square_kilometer: 0.000001, square_kilometers: 0.000001, km2: 0.000001,
            square_mile: 0.000000386102, square_miles: 0.000000386102, mi2: 0.000000386102,
            square_yard: 1.19599, square_yards: 1.19599, yd2: 1.19599,
            square_foot: 10.7639, square_feet: 10.7639, ft2: 10.7639, sqft: 10.7639,
            square_inch: 1550, square_inches: 1550, in2: 1550,
            hectare: 0.0001, hectares: 0.0001, ha: 0.0001,
            acre: 0.000247105, acres: 0.000247105, ac: 0.000247105
        },
        // Speed conversions (base: meters per second)
        speed: {
            meters_per_second: 1, mps: 1, 'm/s': 1,
            kilometers_per_hour: 3.6, kph: 3.6, kmh: 3.6, 'km/h': 3.6,
            miles_per_hour: 2.23694, mph: 2.23694, 'mi/h': 2.23694,
            feet_per_second: 3.28084, fps: 3.28084, 'ft/s': 3.28084,
            knots: 1.94384, knot: 1.94384, kn: 1.94384
        },
        // Time conversions (base: seconds)
        time: {
            second: 1, seconds: 1, s: 1, sec: 1,
            millisecond: 1000, milliseconds: 1000, ms: 1000,
            microsecond: 1000000, microseconds: 1000000, μs: 1000000,
            nanosecond: 1000000000, nanoseconds: 1000000000, ns: 1000000000,
            minute: 0.0166667, minutes: 0.0166667, min: 0.0166667,
            hour: 0.000277778, hours: 0.000277778, h: 0.000277778, hr: 0.000277778,
            day: 0.0000115741, days: 0.0000115741, d: 0.0000115741,
            week: 0.00000165344, weeks: 0.00000165344, wk: 0.00000165344,
            month: 0.00000038052, months: 0.00000038052, mo: 0.00000038052,
            year: 0.0000000316881, years: 0.0000000316881, yr: 0.0000000316881
        }
    };

    /**
     * Executes the unit conversion action
     * 
     * @param params - The action parameters containing:
     *   - Value: The numeric value to convert
     *   - FromUnit: The unit to convert from
     *   - ToUnit: The unit to convert to
     * 
     * @returns A promise resolving to an ActionResultSimple with conversion data
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const valueParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'value');
            const fromUnitParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'fromunit');
            const toUnitParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'tounit');

            if (!valueParam || valueParam.Value === undefined || valueParam.Value === null) {
                return {
                    Success: false,
                    Message: "Value parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            if (!fromUnitParam || !fromUnitParam.Value) {
                return {
                    Success: false,
                    Message: "FromUnit parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            if (!toUnitParam || !toUnitParam.Value) {
                return {
                    Success: false,
                    Message: "ToUnit parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const value = parseFloat(valueParam.Value.toString());
            if (isNaN(value)) {
                return {
                    Success: false,
                    Message: "Value must be a valid number",
                    ResultCode: "INVALID_VALUE"
                };
            }

            const fromUnit = fromUnitParam.Value.toLowerCase().replace(/\s+/g, '_');
            const toUnit = toUnitParam.Value.toLowerCase().replace(/\s+/g, '_');

            // Handle temperature separately as it's not a simple multiplication
            if (this.isTemperature(fromUnit) || this.isTemperature(toUnit)) {
                const result = this.convertTemperature(value, fromUnit, toUnit);
                if (result === null) {
                    return {
                        Success: false,
                        Message: `Cannot convert between ${fromUnit} and ${toUnit}`,
                        ResultCode: "INCOMPATIBLE_UNITS"
                    };
                }

                const conversionData = {
                    original: {
                        value: value,
                        unit: fromUnitParam.Value
                    },
                    converted: {
                        value: result,
                        unit: toUnitParam.Value,
                        formatted: `${result.toFixed(2)} ${toUnitParam.Value}`
                    },
                    category: 'temperature',
                    formula: this.getTemperatureFormula(fromUnit, toUnit)
                };

                return {
                    Success: true,
                    ResultCode: "SUCCESS",
                    Message: JSON.stringify(conversionData, null, 2)
                };
            }

            // Find the category for both units
            let fromCategory: string | null = null;
            let toCategory: string | null = null;

            for (const [category, units] of Object.entries(this.conversions)) {
                if (units[fromUnit]) fromCategory = category;
                if (units[toUnit]) toCategory = category;
            }

            if (!fromCategory || !toCategory) {
                return {
                    Success: false,
                    Message: `Unknown unit(s): ${!fromCategory ? fromUnit : ''} ${!toCategory ? toUnit : ''}`,
                    ResultCode: "UNKNOWN_UNIT"
                };
            }

            if (fromCategory !== toCategory) {
                return {
                    Success: false,
                    Message: `Cannot convert between ${fromCategory} and ${toCategory} units`,
                    ResultCode: "INCOMPATIBLE_UNITS"
                };
            }

            // Perform conversion
            const fromFactor = this.conversions[fromCategory][fromUnit];
            const toFactor = this.conversions[fromCategory][toUnit];
            const baseValue = value / fromFactor;
            const result = baseValue * toFactor;

            const conversionData = {
                original: {
                    value: value,
                    unit: fromUnitParam.Value
                },
                converted: {
                    value: result,
                    unit: toUnitParam.Value,
                    formatted: this.formatResult(result, toUnitParam.Value)
                },
                category: fromCategory,
                conversionFactor: toFactor / fromFactor,
                alternativeUnits: this.getAlternativeConversions(baseValue, fromCategory, toUnit)
            };

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(conversionData, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to convert units: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    private isTemperature(unit: string): boolean {
        const tempUnits = ['celsius', 'c', 'fahrenheit', 'f', 'kelvin', 'k'];
        return tempUnits.includes(unit);
    }

    private convertTemperature(value: number, from: string, to: string): number | null {
        // Normalize unit names
        const normalizeTemp = (unit: string): string => {
            if (unit === 'c') return 'celsius';
            if (unit === 'f') return 'fahrenheit';
            if (unit === 'k') return 'kelvin';
            return unit;
        };

        from = normalizeTemp(from);
        to = normalizeTemp(to);

        if (from === to) return value;

        // Convert to Celsius first
        let celsius: number;
        switch (from) {
            case 'celsius':
                celsius = value;
                break;
            case 'fahrenheit':
                celsius = (value - 32) * 5/9;
                break;
            case 'kelvin':
                celsius = value - 273.15;
                break;
            default:
                return null;
        }

        // Convert from Celsius to target
        switch (to) {
            case 'celsius':
                return celsius;
            case 'fahrenheit':
                return celsius * 9/5 + 32;
            case 'kelvin':
                return celsius + 273.15;
            default:
                return null;
        }
    }

    private getTemperatureFormula(from: string, to: string): string {
        const formulas: Record<string, string> = {
            'celsius_fahrenheit': '°F = °C × 9/5 + 32',
            'fahrenheit_celsius': '°C = (°F - 32) × 5/9',
            'celsius_kelvin': 'K = °C + 273.15',
            'kelvin_celsius': '°C = K - 273.15',
            'fahrenheit_kelvin': 'K = (°F - 32) × 5/9 + 273.15',
            'kelvin_fahrenheit': '°F = (K - 273.15) × 9/5 + 32'
        };
        return formulas[`${from}_${to}`] || '';
    }

    private formatResult(value: number, unit: string): string {
        // Format based on the magnitude of the result
        if (Math.abs(value) < 0.01 || Math.abs(value) > 10000) {
            return `${value.toExponential(4)} ${unit}`;
        } else if (Number.isInteger(value)) {
            return `${value} ${unit}`;
        } else {
            // Determine decimal places based on value
            const decimals = Math.abs(value) < 1 ? 4 : 2;
            return `${value.toFixed(decimals)} ${unit}`;
        }
    }

    private getAlternativeConversions(baseValue: number, category: string, excludeUnit: string): any[] {
        const alternatives = [];
        const commonUnits: Record<string, string[]> = {
            length: ['meters', 'kilometers', 'miles', 'feet'],
            weight: ['grams', 'kilograms', 'pounds', 'ounces'],
            volume: ['liters', 'milliliters', 'gallons', 'cups'],
            area: ['square_meters', 'square_feet', 'acres', 'hectares'],
            speed: ['kilometers_per_hour', 'miles_per_hour', 'meters_per_second'],
            time: ['seconds', 'minutes', 'hours', 'days']
        };

        const unitsToShow = commonUnits[category] || [];
        
        for (const unit of unitsToShow) {
            if (unit !== excludeUnit && this.conversions[category][unit]) {
                const value = baseValue * this.conversions[category][unit];
                alternatives.push({
                    unit: unit.replace(/_/g, ' '),
                    value: parseFloat(value.toFixed(4))
                });
            }
        }

        return alternatives;
    }
}