# admin-live

The Live tab of the Polaris Mail admin (`/admin#live`): the website's globe (`globe.ts` and `land.ts`, copied from
`polaris AIRWAUS WEB/src/pages/network/`) and every Polaris flight on VATSIM with its phase (`live.ts`).

It is bundled with d3-geo into `../src/live-bundle.js`, which the Worker serves on `/admin/live.js`.
After changing anything here:

```
cd workers/polaris-efb-api/admin-live
npm install
npm run build
cd ..
npx wrangler deploy
```

The flights come from `/admin/api/live` (`../src/live.js`): VATSIM pilots with a PAW callsign flying to or from a
Polaris airport. The phase (at gate, taxi out, takeoff, cruise, descent, taxi in, arrived) is worked out in the page
from altitude, ground speed, vertical speed (two updates compared) and the distance to each airport.
