export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { endpoint, symbols } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: 'Missing "endpoint" query parameter. Use "quotes" or "global".' });
  }

  const apiKey = process.env.CMC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'CMC_API_KEY environment variable is not configured.' });
  }

  let url;

  switch (endpoint) {
    case 'quotes':
      if (!symbols) {
        return res.status(400).json({ error: 'Missing "symbols" query parameter for quotes endpoint.' });
      }
      url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbols)}&convert=USD`;
      break;

    case 'global':
      url = 'https://pro-api.coinmarketcap.com/v2/global-metrics/quotes/latest';
      break;

    default:
      return res.status(400).json({ error: `Unknown endpoint "${endpoint}". Use "quotes" or "global".` });
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`CoinMarketCap API error (${response.status}):`, errorText);
      return res.status(response.status).json({
        error: `CoinMarketCap API returned status ${response.status}`,
        details: errorText,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching from CoinMarketCap:', error);
    return res.status(500).json({
      error: 'Failed to fetch data from CoinMarketCap API',
      message: error.message,
    });
  }
}
