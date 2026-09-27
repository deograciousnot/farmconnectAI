# Data sources

## Market prices: real (KAMIS)

`data/market-prices.json` comes from **KAMIS, the Kenya Agricultural Market Information System** run by the Ministry of Agriculture: https://kamis.kilimo.go.ke/site/market. County market officers report wholesale and retail prices for many markets across Kenya.

- Import script: `server/scripts/fetch-kamis.ts` (`npm run seed:prices`). It reads the public market table for 63 food crops (cereals, pulses, roots, vegetables, fruit), each labelled with its common Kiswahili name. Grains and pulses are tagged so 90 kg bags can be converted.
- Method: median wholesale KES/kg per market over the last 30 days. Rows without a wholesale price are dropped.
- Quality: KAMIS has entry errors (e.g. maize at KES 1/kg, or watermelon apparently priced per piece). Markets more than 2× above or below the national median are flagged `outlier` and left out of the calculations, but still shown in the Prices tab with a "check" label.
- Coverage is uneven. Many counties (e.g. Nakuru) have no reports for some crops, so we fall back to the national median.
- The retrieval date (currently 2026-09-27) is stored in the file and shown in the app. Macadamia and yellow beans had no reports in the last 30 days.
- Coffee and tea are not included: they're sold through auctions and co-operatives, not open markets.

## Buyers: demo data, clearly labelled

We did not find a public dataset of real buyers' demand volumes and offer prices in Kenya. `data/buyers.seed.json` contains **fictional** businesses (`isDemo: true`, shown with a "demo" label) placed in real market towns. Their offer prices were set close to the KAMIS wholesale prices retrieved on 2026-09-26, so the numbers are realistic even though the businesses are not real. One demo buyer (Lakeside Hotels) starts with 300 of its 800 kg weekly demand already covered, to show live demand.

Real buyer data enters the system when buyers post through the Buyers tab, usually by speaking or pasting the WhatsApp message they already send to traders' groups. Posts are stored in `data/runtime/listings.json` and farmer requests in `data/runtime/requests.json`; both are git-ignored.

Ideas for real buyer data after the hackathon (all need permission first): county agriculture offices, farmer co-operatives, NCPB depot notices, and partnerships with aggregators.

## Locations

County coordinates in `server/src/geo.ts` are approximate county headquarters locations, used only for distance estimates.

## Privacy

- AI calls go to Google Gemini. On the free tier, Google may use prompts and responses to improve its products. For advice we only send computed evidence: crop, county, quantities, business names and prices. No phone numbers or farmer identities are sent.
- **Voice notes** are sent to Gemini to be understood and are not stored by Farmconnect. A voice is personal data, so production would need clear consent on the mic button and a paid tier that doesn't train on prompts.
- Farmers have no accounts. A request to a buyer stores only crop, kg, harvest date and county, not who the farmer is.
- Each buyer post has a private manage code kept on the buyer's own device. Only that device can see farmer requests for the post and answer them.
- Buyer phone numbers are optional and only shown to farmers if the buyer consents.
- No authentication in this prototype, so anyone can post a listing. Production would need verification and moderation.
