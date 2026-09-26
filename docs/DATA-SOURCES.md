# Data sources

## Market prices: real (KAMIS)

`data/market-prices.json` comes from **KAMIS, the Kenya Agricultural Market Information System** run by the Ministry of Agriculture: https://kamis.kilimo.go.ke/site/market. County market officers report wholesale and retail prices for many markets across Kenya.

- Import script: `server/scripts/fetch-kamis.ts` (`npm run seed:prices`). It reads the public market table for 10 crops.
- Method: median wholesale KES/kg per market over the last 30 days. Rows without a wholesale price are dropped.
- Quality: KAMIS has entry errors (e.g. maize at KES 1/kg, or watermelon apparently priced per piece). Markets more than 2× above or below the national median are flagged `outlier` and left out of the calculations, but still shown in the Prices tab with a "check" label.
- Coverage is uneven. Many counties (e.g. Nakuru) have no reports for some crops, so we fall back to the national median.
- The retrieval date is stored in the file and shown in the app.

## Buyers: demo data, clearly labelled

We did not find a public dataset of real buyers' demand volumes and offer prices in Kenya. `data/buyers.seed.json` contains **fictional** businesses (`isDemo: true`, shown with a "demo" label) placed in real market towns. Their offer prices were set close to the KAMIS wholesale prices retrieved on 2026-09-26, so the numbers are realistic even though the businesses are not real.

Real buyer data enters the system when buyers post through the Buyers tab. Posts are stored in `data/runtime/listings.json`, which is git-ignored.

Ideas for real buyer data after the hackathon (all need permission first): county agriculture offices, farmer co-operatives, NCPB depot notices, and partnerships with aggregators.

## Locations

County coordinates in `server/src/geo.ts` are approximate county headquarters locations, used only for distance estimates.

## Privacy

- AI calls go to Google Gemini. On the free tier, Google may use prompts and responses to improve its products, so we only send the computed evidence: crop, county, quantities, business names and prices. No phone numbers or personal data are sent.
- No farmer data is stored: analysis requests are not saved.
- Buyer phone numbers are optional and only shown to farmers if the buyer consents.
- No authentication in this prototype, so anyone can post a listing. Production would need verification and moderation.
