export async function fetchCountryStats(countryName) {
    const apiUrl = `https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fullText=true`;
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch data for ${countryName}: ${response.statusText}`);
        }
        const jsonData = await response.json();
        return jsonData[0]; // Return the first match
    } catch (error) {
        console.error("Error fetching country stats:", error);
        return null;
    }
}
