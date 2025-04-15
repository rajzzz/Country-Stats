const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());

app.get('/api/country/:name', async (req, res) => {
    const countryName = req.params.name;
    const apiUrl = `https://data.un.org/ws/rest/v1/country/${encodeURIComponent(countryName)}`;
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            return res.status(response.status).send(`Failed to fetch data for ${countryName}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Error fetching country stats:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
});
