import axios, { AxiosError } from 'axios';

/**
 * Calls the endpoint with authorization bearer token.
 * @param {string} endpoint
 * @param {string} accessToken
 */
export async function CallApi<T>(endpoint: string, accessToken: string): Promise<T | null> {

    const options = {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    };

    try {
        const response = await axios.get<T>(endpoint, options);
        return response.data;
    } 
    catch (error) {
        if(axios.isAxiosError(error)){
            const axiosError = error as AxiosError;
            if(axiosError.response){
                console.log(`Error calling api: ${axiosError.response.status} - ${axiosError.response.statusText}`);
            }
            else{
                console.log(`Error calling api: ${axiosError.message}`);
            }
        }
        else{
            console.log(`Error calling api`);
        }
        
        return null;
    }
};