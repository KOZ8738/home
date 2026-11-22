# admin-live

Flight Watch in the Polaris admin (`/admin#fw`, was the Live tab): the map (`opsmap.ts`) and every Polaris flight on
VATSIM with its phase (`live.ts`).

`opsmap.ts` is the EFB's Map in Operations: MapLibre GL 5 (loaded from jsDelivr, unpkg as the second choice) drawing
OpenFreeMap's vector tiles in the EFB Map's colours, as a globe when zoomed out. On it: the Polaris flights, tracks and
the open flight's route; the Polaris airports ringed in their flight category; weather radar, SIGMETs, FIR boundaries and
VATSIM traffic from the EFB server (`/api/efb/*`, same origin); stand numbers, taxiway names and runway ends close in.
The layer button in the map's corner switches the overlays (kept in localStorage `pmMapLayers`). For now it is used
with `?newmap` in the address; without it, or when MapLibre cannot load or the browser has no WebGL, the canvas globe
(`globe.ts` and `land.ts`, copied from `polaris AIRWAUS WEB/src/pages/network/`) is drawn as before. The page's
router (in `../src/admin.js`) puts the open page on `<body data-tab>`; `live.ts` draws the map, the list and the open
flight's head, and tells the page which flight is open (`pm:sel`) and what is on the map (`pm:live`, `window.pmLive`).
The open flight's operations panel (OOOI, gates, loadsheet, AOC log, messages) is in `admin.js`.

It is bundled with d3-geo (MapLibre is not bundled) into `../src/live-bundle.js`, which the Worker serves on `/admin/live.js`.
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
