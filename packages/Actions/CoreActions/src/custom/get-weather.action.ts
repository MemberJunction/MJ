import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import axios from "axios";

/**
 * Action that retrieves current weather information for a specified location
 * using the Open-Meteo API which provides free weather data without requiring an API key.
 * 
 * @example
 * ```typescript
 * // Get weather by city name
 * await runAction({
 *   ActionName: 'Get Weather',
 *   Params: [{
 *     Name: 'Location',
 *     Value: 'New York'
 *   }]
 * });
 * 
 * // Get weather by coordinates
 * await runAction({
 *   ActionName: 'Get Weather',
 *   Params: [{
 *     Name: 'Latitude',
 *     Value: 40.7128
 *   }, {
 *     Name: 'Longitude',  
 *     Value: -74.0060
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__GetWeather")
export class GetWeatherAction extends BaseAction {
    /**
     * Executes the weather retrieval action
     * 
     * @param params - The action parameters containing either:
     *   - Location: A city name to search for (will use geocoding)
     *   - Latitude & Longitude: Specific coordinates for weather data
     * 
     * @returns A promise resolving to an ActionResultSimple with:
     *   - Success: true if weather data was retrieved
     *   - ResultCode: "SUCCESS" or "FAILED"
     *   - ResultData: Object containing weather information
     *   - Message: Error message if failed
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const locationParam = params.Params.find(p => p.Name === 'Location');
            const latitudeParam = params.Params.find(p => p.Name === 'Latitude');
            const longitudeParam = params.Params.find(p => p.Name === 'Longitude');

            let latitude: number;
            let longitude: number;
            let locationName: string = '';

            // If location name is provided, geocode it first
            if (locationParam && locationParam.Value) {
                const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationParam.Value)}&count=1&language=en&format=json`;
                const geocodeResponse = await axios.get(geocodeUrl);
                
                if (!geocodeResponse.data.results || geocodeResponse.data.results.length === 0) {
                    return {
                        Success: false,
                        Message: `Location '${locationParam.Value}' not found`,
                        ResultCode: "LOCATION_NOT_FOUND"
                    };
                }

                const location = geocodeResponse.data.results[0];
                latitude = location.latitude;
                longitude = location.longitude;
                locationName = `${location.name}, ${location.admin1 || ''} ${location.country || ''}`.trim();
            } 
            // If coordinates are provided, use them directly
            else if (latitudeParam && longitudeParam) {
                latitude = parseFloat(latitudeParam.Value);
                longitude = parseFloat(longitudeParam.Value);
                locationName = `${latitude}, ${longitude}`;
            } 
            else {
                return {
                    Success: false,
                    Message: "Either 'Location' or both 'Latitude' and 'Longitude' parameters are required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            // Get weather data
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`;
            const weatherResponse = await axios.get(weatherUrl);

            const current = weatherResponse.data.current;
            const weatherCodes: Record<number, string> = {
                0: 'Clear sky',
                1: 'Mainly clear',
                2: 'Partly cloudy',
                3: 'Overcast',
                45: 'Foggy',
                48: 'Depositing rime fog',
                51: 'Light drizzle',
                53: 'Moderate drizzle',
                55: 'Dense drizzle',
                61: 'Slight rain',
                63: 'Moderate rain',
                65: 'Heavy rain',
                71: 'Slight snow fall',
                73: 'Moderate snow fall',
                75: 'Heavy snow fall',
                77: 'Snow grains',
                80: 'Slight rain showers',
                81: 'Moderate rain showers',
                82: 'Violent rain showers',
                85: 'Slight snow showers',
                86: 'Heavy snow showers',
                95: 'Thunderstorm',
                96: 'Thunderstorm with slight hail',
                99: 'Thunderstorm with heavy hail'
            };

            const weatherData = {
                location: locationName,
                coordinates: {
                    latitude,
                    longitude
                },
                current: {
                    temperature: `${current.temperature_2m}°F`,
                    feelsLike: `${current.apparent_temperature}°F`,
                    humidity: `${current.relative_humidity_2m}%`,
                    pressure: `${current.pressure_msl} hPa`,
                    windSpeed: `${current.wind_speed_10m} mph`,
                    windDirection: `${current.wind_direction_10m}°`,
                    cloudCover: `${current.cloud_cover}%`,
                    precipitation: `${current.precipitation} in`,
                    conditions: weatherCodes[current.weather_code] || 'Unknown',
                    isDay: current.is_day === 1,
                    time: current.time
                }
            };

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(weatherData, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to retrieve weather data: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }
}

/**
 * Loader function to ensure the GetWeatherAction class is included in the bundle.
 * This prevents tree-shaking from removing the class during the build process.
 */
export function LoadGetWeatherAction() {
    // this function is a stub that is used to force the bundler to include the above class in the final bundle and not tree shake them out
}