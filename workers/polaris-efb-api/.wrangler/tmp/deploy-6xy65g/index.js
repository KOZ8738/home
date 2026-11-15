var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/live.js
var PAW_APTS = {
  KSFO: [37.6189, -122.375, "SFO", "San Francisco"],
  KLAX: [33.9425, -118.4081, "LAX", "Los Angeles"],
  KSEA: [47.4502, -122.3088, "SEA", "Seattle"],
  KORD: [41.9786, -87.9048, "ORD", "Chicago O'Hare"],
  KMIA: [25.7959, -80.287, "MIA", "Miami"],
  KBOS: [42.3656, -71.0096, "BOS", "Boston"],
  KJFK: [40.6413, -73.7781, "JFK", "New York JFK"],
  PANC: [61.1743, -149.9963, "ANC", "Anchorage"],
  PHNL: [21.3187, -157.9225, "HNL", "Honolulu"],
  CYYZ: [43.6777, -79.6248, "YYZ", "Toronto"],
  VHHH: [22.308, 113.9185, "HKG", "Hong Kong"],
  RJTT: [35.5494, 139.7798, "HND", "Tokyo Haneda"],
  RCTP: [25.0797, 121.2342, "TPE", "Taipei Taoyuan"],
  ZBAA: [40.0799, 116.6031, "PEK", "Beijing Capital"],
  ZSPD: [31.1443, 121.8083, "PVG", "Shanghai Pudong"],
  WSSS: [1.3644, 103.9915, "SIN", "Singapore Changi"],
  EGLL: [51.47, -0.4543, "LHR", "London Heathrow"],
  LSZH: [47.4647, 8.5492, "ZRH", "Zurich"],
  ENGM: [60.1976, 11.1004, "OSL", "Oslo Gardermoen"]
};
var PAW_CS = /^PAW\d{1,4}[A-Z]{0,2}$/;
function cruiseFt(s) {
  const t = String(s || "").toUpperCase().trim();
  let m = t.match(/^(?:FL|F)(\d{2,3})$/);
  if (m) return +m[1] * 100;
  m = t.match(/^A(\d{2,3})$/);
  if (m) return +m[1] * 100;
  m = t.match(/^(\d{3,5})$/);
  if (m) return +m[1] < 1e3 ? +m[1] * 100 : +m[1];
  return null;
}
__name(cruiseFt, "cruiseFt");
function liveFlights(d) {
  const flights = [];
  for (const r of d.rows || []) {
    const cs = r[0];
    if (!PAW_CS.test(cs)) continue;
    const dep = r[11] || "", arr = r[12] || "";
    if ((dep || arr) && !PAW_APTS[dep] && !PAW_APTS[arr]) continue;
    const det = d.det && d.det[cs] || {};
    flights.push({
      cs,
      cid: r[1],
      name: r[2],
      lat: r[3],
      lon: r[4],
      alt: r[5],
      gs: r[6],
      hdg: r[7],
      sq: r[8],
      logon: r[9] ? r[9] * 1e3 : 0,
      ac: r[10],
      dep,
      arr,
      cruise: cruiseFt(r[13]),
      fl: r[13] || "",
      rules: r[14] || "",
      altn: det.altn || "",
      tas: det.tas || "",
      dt: det.dt || "",
      ete: det.ete || "",
      route: d.routes && d.routes[cs] || ""
    });
  }
  flights.sort((a, b) => a.cs.localeCompare(b.cs));
  return { upd: d.upd, now: Date.now(), source: "VATSIM", flights, apts: PAW_APTS };
}
__name(liveFlights, "liveFlights");

// src/admin.js
var ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Polaris Mail \xB7 Admin</title><link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgODE5MiA4MTkyIj48ZGVmcz48c3R5bGU+CiAgICAgIC5jbHMtMXtmaWxsOnVybCgjcmFkaWFsLWdyYWRpZW50LTEpfQogICAgICAuY2xzLTJ7ZmlsbDojZmZmZmZmfQogICAgPC9zdHlsZT48cmFkaWFsR3JhZGllbnQgaWQ9InJhZGlhbC1ncmFkaWVudC0xIiBjeD0iNzI3Mi41MzQiIGN5PSIxMjIwLjk5NiIgcj0iMTAxMzcuOTQ5IiBmeD0iNjI4MC44NjciIGZ5PSI0OTk3LjIxNyIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPjxzdG9wIG9mZnNldD0iMC4xNDA0IiBzdG9wLWNvbG9yPSIjMWE2NzcwIi8+PHN0b3Agb2Zmc2V0PSIwLjU0NzMiIHN0b3AtY29sb3I9IiMwZDRmNTYiIGRhdGEtdmMtbWlkcG9pbnQ9IjAuNTIzMSIvPjxzdG9wIG9mZnNldD0iMC45MTg0IiBzdG9wLWNvbG9yPSIjMDAzNjNiIi8+PC9yYWRpYWxHcmFkaWVudD48L2RlZnM+PGcgaWQ9IkFzc2V0XzM0IiBkYXRhLW5hbWU9IkFzc2V0IDM0Ij48Zz48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iODE5MiIgaGVpZ2h0PSI4MTkyIiBjbGFzcz0iY2xzLTEiLz48cGF0aCBkPSJNMzk2Mi41OTkgMTAwMS42NjcgTDQxMDEuODE5IDI3OC40MDEgTDQyNDYuMjcyIDEwMDEuNDkyIEw0MjQ2LjI3MiAxMDAxLjQ5MiBDNDg1My41MDYgMTAyOC42OTQgNTQxNC44ODkgMTIzMi4wODIgNTg4MC41MjkgMTU2MS43NjQgTDYwMzYuOTA1IDE0MzkuNTYyIEw2MTY4LjkwOSAxMzQwLjMzIEM2MTcwLjAxMSAxMzM5LjUwMiA2MTcxLjM0MSAxMzM5LjAzMiA2MTcyLjcxOSAxMzM4Ljk4MyBMNjE4Mi4xNDkgMTMzOC42NTMgQzYxODYuNzQ1IDEzMzguNTEgNjE5MC4xMzIgMTM0Mi45MTggNjE4OC44MDMgMTM0Ny4zMjUgTDYxODYuMDg3IDEzNTYuMzM0IEM2MTg1LjY4OSAxMzU3LjY1NCA2MTg0Ljg5NiAxMzU4LjgyIDYxODMuODE0IDEzNTkuNjc0IEw2MDU0LjQwMSAxNDYxLjg1NyBMNTkwOC4wNTEgMTU4MS40NzggTDU5MDguMDUxIDE1ODEuNDc4IEM2NjQ2LjA3MSAyMTE2LjI3MSA3MTM3LjA3MSAyOTcxLjA1OCA3MTc3LjQ1MSAzOTQyLjIzMyBMNzE3Ny40NTEgMzk0Mi4yMzMgTDc4MDEuMzI1IDQwNzEuNzI4IEw3MTc3LjY1NiA0MTk3LjAyOSBDNzExNC4wMTUgNTc4OS42NzIgNTgzOC41NjkgNzA3MC41MDkgNDI0OC4xNDQgNzE0Mi43MTUgTDQyNDguMTQ0IDcxNDIuNzE1IEw0MTAzLjc0NSA3ODg4LjcyOCBMNDEwMy43NDUgNzg4OC4zODUgTDQxMDMuNjgyIDc4ODguNzI4IEwzOTU2LjUwMyA3MTQyLjMzNyBDMzM3OC44NzcgNzExNC42MDcgMjg0My4wNTYgNjkyNy40MzYgMjM5Mi4wOSA2NjIzLjg3NiBMMjM4NS40NzcgNjYyNS41NTYgTDIyNzEuODI1IDY2NTAuNzA5IEwyMTY3Ljc5NiA2NjY5LjkyMyBMMjA3Ni40MjQgNjY4My4xNDIgTDE5OTUuMzc3IDY2OTEuMDk3IEwxOTIyLjMyMyA2Njk0LjUzMyBDMTkyMi4xOTIgNjY5NC41MzkgMTkyMi4wNiA2Njk0LjU0MSAxOTIxLjkyOSA2Njk0LjU0IEwxODU5LjM5IDY2OTMuODEzIEMxODU5LjIzNyA2NjkzLjgxMSAxODU5LjA4NCA2NjkzLjgwNCAxODU4LjkzMSA2NjkzLjc5MiBMMTgwMy4xNTYgNjY4OS4zMjkgQzE4MDIuOTg1IDY2ODkuMzE1IDE4MDIuODE1IDY2ODkuMjk1IDE4MDIuNjQ1IDY2ODkuMjY4IEwxNzUyLjg2OCA2NjgxLjQyMyBDMTc1Mi42NzQgNjY4MS4zOTMgMTc1Mi40ODEgNjY4MS4zNTQgMTc1Mi4yOSA2NjgxLjMwNiBMMTcwOC44ODcgNjY3MC41MDIgQzE3MDguNjYxIDY2NzAuNDQ2IDE3MDguNDM4IDY2NzAuMzc4IDE3MDguMjE5IDY2NzAuMjk5IEwxNjcwLjA1IDY2NTYuNDYxIEMxNjY5LjgwNyA2NjU2LjM3MyAxNjY5LjU2OSA2NjU2LjI3MSAxNjY5LjMzOCA2NjU2LjE1NiBMMTYzNS43MjUgNjYzOS4zODMgQzE2MzUuNDczIDY2MzkuMjU4IDE2MzUuMjMgNjYzOS4xMTYgMTYzNC45OTYgNjYzOC45NiBMMTYwNS41MzggNjYxOS4zMTEgQzE2MDUuMjc2IDY2MTkuMTM3IDE2MDUuMDI2IDY2MTguOTQ0IDE2MDQuNzkxIDY2MTguNzM0IEwxNTc5Ljk2OCA2NTk2LjU4NCBDMTU3OS43MTYgNjU5Ni4zNTkgMTU3OS40ODIgNjU5Ni4xMTYgMTU3OS4yNjYgNjU5NS44NTYgTDE1NTguMzkgNjU3MC42NTEgQzE1NTguMTcyIDY1NzAuMzg4IDE1NTcuOTc0IDY1NzAuMTA5IDE1NTcuNzk5IDY1NjkuODE3IEwxNTQwLjg5IDY1NDEuNTkxIEMxNTQwLjcxOSA2NTQxLjMwNSAxNTQwLjU2OSA2NTQxLjAwNyAxNTQwLjQ0MiA2NTQwLjcgTDE1MjcuNTkyIDY1MDkuNTY1IEMxNTI3LjQ4MiA2NTA5LjI5NyAxNTI3LjM4OCA2NTA5LjAyMiAxNTI3LjMxMyA2NTA4Ljc0MiBMMTUxNS41MzUgNjQ2NC44NyBDMTUxNS40NzggNjQ2NC42NiAxNTE1LjQzMiA2NDY0LjQ0NiAxNTE1LjM5NiA2NDY0LjIzMSBMMTUwNy43NTEgNjQxOC4zNDcgQzE1MDcuNzE3IDY0MTguMTQyIDE1MDcuNjkyIDY0MTcuOTM1IDE1MDcuNjc3IDY0MTcuNzI3IEwxNTA0LjE1NyA2MzY5LjEzOSBDMTUwNC4xNDIgNjM2OC45NDMgMTUwNC4xMzcgNjM2OC43NDcgMTUwNC4xNCA2MzY4LjU1IEwxNTA0LjkxOSA2MzE3LjAzNCBDMTUwNC45MjIgNjMxNi44NTUgMTUwNC45MzEgNjMxNi42NzcgMTUwNC45NDggNjMxNi40OTkgTDE1MTAuMjQ5IDYyNjAuNzM2IEMxNTEwLjI2NCA2MjYwLjU3OCAxNTEwLjI4NSA2MjYwLjQyIDE1MTAuMzExIDYyNjAuMjYzIEwxNTIwLjIxMSA2MjAxLjAyNiBDMTUyMC4yMzUgNjIwMC44ODEgMTUyMC4yNjQgNjIwMC43MzYgMTUyMC4yOTggNjIwMC41OTMgTDE1MzUuMTE5IDYxMzcuNjc0IEMxNTM1LjE1IDYxMzcuNTQxIDE1MzUuMTg2IDYxMzcuNDA5IDE1MzUuMjI1IDYxMzcuMjc5IEwxNTU1LjQ3NyA2MDY5Ljk0NyBDMTU1NS41MTIgNjA2OS44MzIgMTU1NS41NDkgNjA2OS43MTggMTU1NS41OSA2MDY5LjYwNSBMMTU4Mi4wNjQgNTk5Ni4wODQgTDE2MTQuNTMgNTkxOC4wMjcgTDE2MjcuNjE0IDU4OTAuMTYzIEMxMjc1LjEzNyA1NDEwLjM5MiAxMDU4LjYgNDgyNC41NDMgMTAzNC43OCA0MTg5LjM5MyBMMzkwLjY3NSA0MDU3LjgwNyBMMTAzNS43MzcgMzkzMS42NzggQzExMDcuMDE1IDIzNDYuOTM0IDIzNzguMjkgMTA3NC42MSAzOTYyLjU5OSAxMDAxLjY2NyBaIE00MTAxLjkxMSA1MTAuMzY0IEw0MTAyLjA5NSA5OTguMzY3IEM0MTAyLjA5NSA5OTguMzY3IDQxMDIuMDk1IDk5OC4zNjcgNDEwMi4wOTUgOTk4LjM2NyBMNDEwMi4xMzIgMTA5NS4xMTggQzQxMDIuMTMyIDEwOTUuMTE4IDQxMDIuMTMyIDEwOTUuMTE4IDQxMDIuMTMyIDEwOTUuMTE4IEw0MTAyLjIwOCAxMjk3Ljk3OCBDNDEwMi4yMDggMTI5Ny45NzggNDEwMi4yMDggMTI5Ny45NzggNDEwMi4yMDggMTI5Ny45NzggTDQxMDIuMjMxIDEzNTguNDQ3IEM0MTAyLjIzMSAxMzU4LjQ0NyA0MTAyLjIzMSAxMzU4LjQ0NyA0MTAyLjIzMSAxMzU4LjQ0NyBMNDEwMi44ODEgMzA3Ny44NTEgTDQxMDIuODgxIDMwNzcuODUxIEw0MTAyLjkxMSAzMTU2LjA1MSBMNDEwMi45MTEgMzE1Ni4wNTEgTDQxMDMuMDQzIDM1MDcuMjIyIEw0MTAzLjA0MyAzNTA3LjIyMiBMNDEwMy4yNTMgNDA2MS41NjMgTDQxMDMuMjUzIDQwNjEuNTYzIEw0MTAzLjI1NCA0MDY1LjI3IEw0MTAwLjQ3NyA0MDY4LjAxIEw0MDk4LjY4MSA0MDY5Ljc4MSBMNDA5OC42NzggNDA2OS43ODMgTDQwOTcuNjQ2IDQwNjguNzUzIEw0MDk4LjY3NSA0MDY5Ljc4NiBMNDA5Ni44MzkgNDA3MS41OTcgTDQwNTcuMzYgNDExMC41MyBMMzg0Ni40NDQgNDMxOC41MjkgTDM4NDYuNDQyIDQzMTguNTMxIEwzNzc3LjQ2NSA0Mzg3LjUyMiBMMzc1Ni40NSA0NDA4LjU0MiBMMzUxMS44OTEgNDY1My4xNDggTDM1MTEuODkxIDQ2NTMuMTQ4IEwzNTIwLjY1NiA0Njk3LjU5OCBMMzU3Ni45NDcgNDk4My4wNjYgTDM1NzYuOTQ3IDQ5ODMuMDY2IEwzNzkxLjQ3NSA2MDcxLjAwOCBMMzc5MS40NzUgNjA3MS4wMDggTDM4MDMuMzc0IDYxMzEuMzQ5IEwzODAzLjM3NCA2MTMxLjM0OSBMMzkyOC4yNTQgNjc2NC42NTQgTDM5NDAuMzQ5IDY4MjUuOTk1IEwzOTgzLjg3IDcwNDYuNzAxIEw0MDAzLjEgNzE0NC4yMjQgTDQxMDMuNzIxIDc2NTQuNTAzIEw0MTAzLjcyMSA3NjM5LjMwMyBMNDEwMy42NzIgNzE0NS45MjUgTDQxMDMuNjYyIDcwNDkuMTc1IEw0MTAzLjY0MSA2ODMwLjkxMyBMNDEwMy42MzUgNjc3MC40NDQgTDQxMDMuNTU5IDYwMDMuNTYxIEw0MTAzLjU1MyA1OTQxLjEzNiBMNDEwMy40NDEgNDgxNC42NjggTDQxMDMuNDM3IDQ3NjguNDExIEw0MTAzLjQyNCA0NjM5LjQyIEw0MTAzLjQyMSA0NjA0LjQxNSBMNDEwMy4zNzQgNDEyOS44MjQgTDQxMDMuMzY4IDQwNzQuNDk1IEw0MTAzLjM2OCA0MDc0LjQ2MSBMNDQ0MC4yNzUgNDQxMC41MDggTDQxMDMuMzY4IDQwNzQuNDU2IEw0MTAzLjM2OCA0MDY4LjAwNiBMNDEwMy4zNjcgNDA2NS4zODUgTDQxMDUuOTYyIDQwNjguMDAzIEw0Njg0LjM0NyA0NjUxLjcwMSBMNDY4NC42MTIgNDY1MS42NDcgTDUwMDkuNzc2IDQ1ODYuMzE5IEw2ODA4LjAzNCA0MjI1LjAzMiBMNjg2OS4yODMgNDIxMi43MjYgTDcwODEuODE3IDQxNzAuMDI2IEw3MTc5LjE2OCA0MTUwLjQ2NyBMNzU3MC42MDMgNDA3MS44MjQgTDc1NjguMDg0IDQwNzEuMzIxIEw3MTgwLjE0NiA0MDcwLjY0MyBMNzA4My4zOTUgNDA3MC40NzQgTDY4NzMuMTgzIDQwNzAuMTA2IEw2ODEyLjcxNCA0MDcwIEw0NjY5Ljg5IDQwNjYuMjU2IEw0NjM0LjkwMiA0MDY2LjE5NCBMNDEwNC45OSA0MDY1LjI2OCBMNDYzNS45NzIgNDA2NC41OTEgTDQ2NzEuMDMgNDA2NC41NDYgTDQ4NTguMTMxIDQwNjQuMzA3IEw0NjcxLjAzMSA0MDY0LjU0NSBMNDYzNS45NzMgNDA2NC41ODkgTDQxMDMuMzY3IDQwNjUuMjY1IEw0MTQ4LjY2IDQwMTkuODYxIEw0Njc0LjcgMzQ5Mi41MiBMNDY5My44MzEgMzQ3My4zNDIgTDQ2OTMuMzY0IDM0NzEuMDA2IEw0Njg4Ljk5NCAzNDQ5LjEyOSBMNDYyOS4zOTUgMzE1MC43OTUgTDQ1NDguOTU1IDI3NDguMTM5IEw0NTM3LjE5NSAyNjg5LjI2OSBMNDI3Mi4zMjkgMTM2My40MjggTDQyNjAuMDg4IDEzMDIuMTU0IEw0MjE5LjE0NiAxMDk3LjIxMiBMNDE5OS42NzcgOTk5Ljc1NCBaIE00MTAzLjI1NCA0MDY1LjI3IEw0MTAxLjQwMyA0MDYzLjQxNSBMNDA5Ni44NjcgNDA1OC44NjggTDM2MzcuNzg2IDM1OTguNzA1IEwzNTkyLjE5MiAzNTUzLjAwMyBMMzUyOS41OTcgMzQ5MC4yNjEgTDM1MjIuNzk0IDM0OTEuNTkxIEwzMTkyLjA5MSAzNTU2LjI1NCBMMTQwNS4zMDEgMzkwNS42MjcgTDEzNDQuMDc5IDM5MTcuNTk4IEwxMTMxLjQzOSAzOTU5LjE3NiBMMTAzMy45OTIgMzk3OC4yMyBMNjI0LjYwNCA0MDU4LjI3OCBMMTAzMi42MTIgNDA1OS4wOTggTDEwMzIuNjEyIDQwNTkuMDk4IEwxMTI5LjM2MiA0MDU5LjI5MiBMMTEyOS4zNjIgNDA1OS4yOTIgTDEzNDAuMjUzIDQwNTkuNzE2IEwxMzQwLjI1MyA0MDU5LjcxNiBMMTQwMC43MjIgNDA1OS44MzggTDE0MDAuNzIyIDQwNTkuODM4IEwzMDcyLjAwNiA0MDYzLjE5NyBMMzA3Mi4wMDYgNDA2My4xOTcgTDMxNzIuMDczIDQwNjMuMzk5IEwzMTcyLjA3MyA0MDYzLjM5OSBMMzM0OS40NDUgNDA2My43NTUgTDM1MjcuNDk4IDQwNjQuMTEzIEwzNTI3LjQ5OCA0MDY0LjExMyBMNDA5NC4xNTQgNDA2NS4yNTIgTDQwOTQuMTU0IDQwNjUuMjUyIEw0MDk2Ljg1OSA0MDY1LjI1OCBMNDA5Ni44NTkgNDA2NS4yNTggTDQwOTkuNTU2IDQwNjUuMjYzIEw0MDk5LjU1NiA0MDY1LjI2MyBaIE0zODgxLjM0NiA2NzYxLjE5NCBMMzc2MC42MzUgNjE0OS4wMjkgTDM2MjkuMTYxIDYyMDMuNDE2IEwzNDAwLjcyOCA2MjkzLjk0NyBMMzE4OC44MzcgNjM3My45ODcgTDI5OTQuNzYyIDY0NDMuMjkgTDI4ODUuNTU2IDY0NzkuODg2IEwyODg1LjU1NiA2NDc5Ljg4NiBDMzE4OS4wNTIgNjYzMy42MjYgMzUyNS40MzUgNjczMS44NDkgMzg4MS4zNDYgNjc2MS4xOTQgWiBNMzkzNy4yMDEgNzA0NC40NSBMMzg5My40OTggNjgyMi44MiBDMzUwMi40NTIgNjc5My4wMTQgMzEzNC4xMzkgNjY4MS45MDkgMjgwNS40MjQgNjUwNi4zNzIgTDI2NTguMzc5IDY1NTIuMDMyIEwyNTE5LjQ4MiA2NTkxLjQzNCBMMjUxOS40ODIgNjU5MS40MzQgQzI5MzQuMTMgNjg1My4xNjcgMzQxNy44OSA3MDE1LjM2IDM5MzcuMjAxIDcwNDQuNDUgWiBNNDI2NS44MTQgMTA5OS4zMTIgTDQzMDYuOTI2IDEzMDUuMTA4IEw0MzA2LjkyNiAxMzA1LjEwOCBDNDc5NS45MzggMTM0MC4wNzkgNTI0OS43ODMgMTUwMi4xNTIgNTYzNS42MDYgMTc1OC40NyBMNTYzNS42MDYgMTc1OC40NyBDNTY0Ni4yOTkgMTc2NS41NzQgNTY1Ni45NCAxNzcyLjc1IDU2NjcuNTI3IDE3NzkuOTk4IEw1NjY3LjUyNyAxNzc5Ljk5OCBDNjM0Ny4zODkgMjI0NS4zOTcgNjgwOC45MzggMzAwNi4zODkgNjg2Ni45OTIgMzg3Ny43OTIgTDY4NjYuOTkyIDM4NzcuNzkyIEw3MDc5LjY3MiAzOTIxLjkzOCBDNzAzMi45NzkgMjk4Mi4zMSA2NTUwLjY0IDIxNTcuMzU1IDU4MzAuNDcyIDE2NDQuODg4IEM1ODIwLjY4MiAxNjM3LjkyMSA1ODEwLjg0NyAxNjMxLjAxMiA1ODAwLjk2OSAxNjI0LjE2MSBDNTM2MC44NjUgMTMxOC45MjcgNDgzNC40OTQgMTEyOS4zMjQgNDI2NS44MTQgMTA5OS4zMTIgWiBNMzk0My43NzIgMTA5OS40OCBDMjQyOC4wNDYgMTE4MS4wNjIgMTIxMy42MjUgMjM5Ni40MzEgMTEzMy41NCAzOTEyLjU1NCBMMTM0Ni45MTggMzg3MC44MzIgQzE0NDEuNjcyIDI1MDAuMjM0IDI1MzQuNzYgMTQwNC4zNzQgMzkwNC4xNTggMTMwNS4yNzcgWiBNNDMxOS4yMjMgMTM2Ni42NjUgTDQ1NzYuNDkgMjY1NC40NjUgTDQ1OTcuMTc5IDI2MzYuMTQgTDQ5MDMuNTYzIDIzNzAuNDMgTDUyMTcuNzQyIDIxMDMuNjU5IEw1NTI2LjE1NCAxODQ3LjM2NyBMNTU4Ni4zOCAxNzk4LjQ1MiBDNTIxNi44MzYgMTU1Ni42NTIgNDc4NC41MzggMTQwMi44MTEgNDMxOS4yMjMgMTM2Ni42NjUgWiBNMzg5Mi4zMTMgMTM2Ni44MTMgQzI1NjUuODc5IDE0NzAuNzg3IDE1MDguMTcxIDI1MzEuMTkyIDE0MDguNDE0IDM4NTguODA4IEwzMTY1LjA1MiAzNTE1LjMzIEwyNDEzLjQyNCAyMzc3Ljc1MSBMMzU1MC40NDkgMzE0Mi44NTIgWiBNNTYxOS4wNjggMTgyMC4xOCBMNTU1MC42NjcgMTg3Ni44OTggTDUyNDUuMjA5IDIxMzYuMDIyIEw0OTM0LjEwOSAyNDA1LjY2MyBMNDYzMC44MiAyNjc0LjEzMyBMNDU4OC4xMjkgMjcxMi43MjYgTDQ1ODguMTI5IDI3MTIuNzI2IEw0NjcwLjEzMiAzMTIzLjIwOSBMNTgxNi43ODEgMjM0Ni43MzUgTDUwNDcuNDg5IDM1MDAuMTI1IEw1MDQ3LjQ4OSAzNTAwLjEyNSBMNjgwNS40ODMgMzg2NS4wMjUgQzY3NDMuNDY1IDMwMTMuNjA4IDYyODcuNTExIDIyNzEuNTEgNTYxOS4wNjggMTgyMC4xOCBaIE01NzExLjQzIDI0NTIuMTcgTDQ3MzEuOTA2IDM0MzIuNDM0IEw0NzMxLjkwNiAzNDMyLjQzNCBMNDczMi4zNjIgMzQzNC43MTYgTDUwMTYuNzIxIDM0OTMuNzM5IFogTTI1MTkuNDk2IDI0ODQuMjUxIEwzNDg0LjI3MSAzNDUyLjkxMyBMMzQ5MS4wMjEgMzQ1MS41OTMgTDM1NDQuNDY0IDMxNzMuOTQ4IFogTTExMzIuNDQxIDQyMDkuMzQ0IEMxMTU5LjExNiA0Nzk3LjQxIDEzNTYuNDAzIDUzNDEuMDE4IDE2NzUuOTczIDU3OTEuODM3IEwxNjc1Ljk3MyA1NzkxLjgzNyBDMTY5NC43MDggNTgxOC4yNjcgMTcxMy44NjMgNTg0NC4zNzcgMTczMy40MjkgNTg3MC4xNTkgTDE3MzMuNDI5IDU4NzAuMTU5IEMxOTI5LjgxIDYxMjguOTMyIDIxNjcuNTQ4IDYzNTQuNTk2IDI0MzYuNzk4IDY1MzcuMzA1IEwyNDk4LjQxMiA2NTIyLjIyNCBMMjYzOC40NCA2NDgzLjgyMyBMMjcyMC41NTEgNjQ1OS4xMTEgQzIzNzYuMzY5IDYyNTkuNDQ5IDIwNzkuMTk0IDU5ODcuNzEzIDE4NDkuNjggNTY2NC41NTggQzE4MzAuODI0IDU2MzguMDA4IDE4MTIuNDIzIDU2MTEuMTEgMTc5NC40OTEgNTU4My44NzcgQzE1MzkuNzg1IDUxOTcuMDU1IDEzNzkuNTM4IDQ3NDIuNTE3IDEzNDYuNTggNDI1My4wOTEgWiBNNzA3OS45NSA0MjE2LjY1OSBMNjg2Ni40MTUgNDI1OS41NiBDNjc3MC45ODEgNTYyOS4yNDMgNTY3OC41MTggNjcyNC4yMSA0MzA5LjkxOSA2ODIzLjU2NiBMNDMwOS45MTkgNjgyMy41NjYgTDQyNjcuMDc1IDcwNDQuOTEyIEM1Nzg4LjcgNjk2My45NjkgNzAwNy4xMTkgNTc0MC40MjQgNzA3OS45NSA0MjE2LjY1OSBaIE0xNDA4LjA4NiA0MjY1LjY1NyBDMTQ0Mi4wODkgNDcyOC4yNzIgMTU5Mi4zOTggNTE1OC41NjQgMTgyOS44OSA1NTI3LjQxMSBMMTg5Mi42NTIgNTQzMi4yMzYgTDE5NzUuOTQ2IDUzMTQuNzc5IEwyMDcxLjIyOSA1MTg3LjUzNyBMMjE3Ny41NjIgNTA1Mi4xNTEgTDIyOTUuNjI3IDQ5MDguNDE1IEwyNDI3LjY1MSA0NzUzLjk0MiBMMjU3MS43NTggNDU5MS41NDMgTDI2MzkuODg5IDQ1MTcuMzA1IFogTTY4MDQuODg0IDQyNzEuOTIzIEw1MDM2LjU5NSA0NjI3LjE4OSBMNTAzNi41OTUgNDYyNy4xODkgTDU0ODUuNTggNTMxMS4zODIgTDU4MTEuMTIyIDUxNTcuODYzIEw2MDY1Ljc2NiA1MDM0LjMxMiBDNjA2Ni44NzMgNTAzMy43NzUgNjA2OC4xMDUgNTAzMy41NTEgNjA2OS4zMyA1MDMzLjY2NSBMNjA3Mi4yMjcgNTAzMy45MzUgQzYwNzcuMTQ5IDUwMzQuMzk0IDYwNzkuOTE0IDUwMzkuODI0IDYwNzcuMzkxIDUwNDQuMDc1IEw2MDc1LjkwNiA1MDQ2LjU3NiBDNjA3NS4yNzggNTA0Ny42MzQgNjA3NC4zNzIgNTA0OC40OTkgNjA3My4yODcgNTA0OS4wNzkgTDU4MjMuNDc2IDUxODIuNDU1IEw1NTA4LjQzIDUzNDYuMjAzIEw1NTA4LjQzIDUzNDYuMjAzIEw1Nzc0LjE1MyA1NzUxLjEzIEw1MzEyLjIxMiA1NDQzLjc1MyBMNTEyMy4zNzMgNTUzNS44MSBMNDc4MC40NTQgNTY5OC4yOTggTDQ1MDMuMDI4IDU4MjUuODk2IEw0NTAzLjAyOCA1ODI1Ljg5NiBMNDMyMS44MzIgNjc2Mi4wMiBDNTY0Ny4zMjIgNjY1Ny43NzQgNjcwNC4zMDYgNTU5OC40NDEgNjgwNC44ODQgNDI3MS45MjMgWiBNMjcyOC44MzEgNDUzNS40NzUgTDI2MzAuOTA2IDQ2NDQuMzc5IEwyNDg5LjM4NyA0ODA3LjE2IEwyMzU5Ljk0OCA0OTYxLjc2IEwyMjQ0LjQ0NiA1MTA1LjMyMiBMMjE0MC42NzUgNTI0MC4yNDUgTDIwNDcuOTYyIDUzNjYuNzExIEwxOTY3LjIzNSA1NDgzLjAzNCBMMTg5NC4yMDcgNTU5My4yNiBMMTg4NC40NTMgNTYwOC44NzggTDE4ODQuNDUzIDU2MDguODc4IEMyMTIxLjc0MSA1OTQ5LjY2OCAyNDM1LjQxMiA2MjMzLjI5OSAyODAwLjY2NCA2NDM0Ljk2NiBMMjk3Mi44MDkgNjM3OC45NSBMMzE2Ni4yODUgNjMxMS43NjQgTDMzNzcuODE3IDYyMzMuOTY4IEwzNjA2LjExOCA2MTQ1Ljc5MiBMMzc0OC42NTcgNjA4OC4yODMgTDM1MzYuMTU2IDUwMTAuNjI3IEwyMzU5Ljg3NyA1ODA1LjM5IEwyMzYwLjAzMyA1ODA1LjIzNCBMMjM1OS44NDkgNTgwNS4zNjEgTDMxNTMuMjY2IDQ2MjIuMTg0IFogTTMxODQuMTI1IDQ2MjguNDg4IEwyNDY2LjI4NyA1Njk4Ljk1NyBMMjQ3My4xOTQgNTY5Mi4wNTEgTDM0NzMuMjgxIDQ2OTEuNzY2IEwzNDcyLjQ5IDQ2ODcuNzUyIEwzNDcyLjQxNyA0Njg3LjM4NCBaIE00NzIxLjg5IDQ2OTUuMTgzIEw0NjY2Ljg4NyA0OTc5LjM0OCBMNDY2Ni44ODcgNDk3OS4zNDggTDUyOTguMzI0IDUzOTkuNTA5IEw1Mjk4LjMyNCA1Mzk5LjUwOSBMNTM0Mi41NzMgNTQyOC45NTIgTDUzNDIuNTczIDU0MjguOTUyIEw1NjY5LjI4IDU2NDYuMzQ1IEw1NjY4LjM2NSA1NjQ0Ljk3MiBMNTQxNi45NjIgNTM5Mi42ODggTDUzODMuMzYyIDUzNTguOTcxIFogTTYyMzguMTM4IDQ4OTQuNTE1IEM2Mjc0Ljk0NyA0ODcwLjM5IDYzMDcuODE3IDQ3NjQuODQgNjMyMS45MjkgNDc2OC45MjkgQzYzMzYuMDQyIDQ3NzMuMDE3IDYzMDcuMzk1IDQ4NzkuNzkxIDYzMjUuNjA3IDQ5MTkuODU3IEM2MzI3LjEwNyA0OTIzLjE1OCA2MzI3LjY3NSA0OTI1LjE4OSA2MzI5LjA1IDQ5MjcuNjg2IEM2MzMwLjQyNSA0OTMwLjE4MyA2MzMxLjgzOCA0OTMxLjc0OSA2MzMzLjgyNiA0OTM0Ljc4MSBDNjM1Ny45NTEgNDk3MS41OTEgNjQ2My41MDEgNTAwNC40NiA2NDU5LjQxMiA1MDE4LjU3MyBDNjQ1NS4zMjQgNTAzMi42ODUgNjM0OC41NSA1MDA0LjAzOSA2MzA4LjQ4NCA1MDIyLjI1IEM2MzA1LjE4MyA1MDIzLjc1MSA2MzAzLjE1MiA1MDI0LjMxOCA2MzAwLjY1NSA1MDI1LjY5MyBDNjI5OC4xNTggNTAyNy4wNjkgNjI5Ni41OTIgNTAyOC40ODEgNjI5My41NiA1MDMwLjQ2OSBDNjI1Ni43NSA1MDU0LjU5NCA2MjIzLjg4MSA1MTYwLjE0NCA2MjA5Ljc2OCA1MTU2LjA1NiBDNjE5NS42NTYgNTE1MS45NjcgNjIyNC4zMDIgNTA0NS4xOTMgNjIwNi4wOTEgNTAwNS4xMjcgQzYyMDQuNTkgNTAwMS44MjYgNjIwNC4wMjMgNDk5OS43OTUgNjIwMi42NDggNDk5Ny4yOTggQzYyMDEuMjcyIDQ5OTQuODAxIDYxOTkuODU5IDQ5OTMuMjM2IDYxOTcuODcyIDQ5OTAuMjAzIEM2MTczLjc0NyA0OTUzLjM5NCA2MDY4LjE5NyA0OTIwLjUyNCA2MDcyLjI4NSA0OTA2LjQxMSBDNjA3Ni4zNzQgNDg5Mi4yOTkgNjE4My4xNDggNDkyMC45NDUgNjIyMy4yMTQgNDkwMi43MzQgQzYyMjYuNTE1IDQ5MDEuMjM0IDYyMjguNTQ2IDQ5MDAuNjY2IDYyMzEuMDQzIDQ4OTkuMjkxIEM2MjMzLjU0IDQ4OTcuOTE2IDYyMzUuMTA1IDQ4OTYuNTAzIDYyMzguMTM4IDQ4OTQuNTE1IFogTTQ2NjAuODg0IDUwMTAuMzU3IEw0NTE1LjUxOSA1NzYxLjM2NiBMNDc1OS4wNTIgNTY1MS45MjggTDUxMDIuODc1IDU0OTIuNjggTDUyNjcuNjc2IDU0MTQuMTE5IFogTTE2ODYuOTE3IDU5NjguMjUxIEwxNjYxLjcyMiA2MDI3LjM2MiBMMTYzNi4xMTQgNjA5Ni41NzEgQzE2MzYuMDczIDYwOTYuNjg0IDE2MzYuMDM0IDYwOTYuNzk3IDE2MzUuOTk4IDYwOTYuOTEyIEwxNjE2LjU5MSA2MTU5LjQ0NSBDMTYxNi41NSA2MTU5LjU3NSAxNjE2LjUxNCA2MTU5LjcwNyAxNjE2LjQ4MSA2MTU5LjgzOSBMMTYwMi4zNzQgNjIxNy40NTcgQzE2MDIuMzM5IDYyMTcuNiAxNjAyLjMwOSA2MjE3Ljc0NCAxNjAyLjI4MyA2MjE3Ljg5IEwxNTkyLjg1NSA2MjcxLjQxOSBDMTU5Mi44MjcgNjI3MS41NzUgMTU5Mi44MDUgNjI3MS43MzMgMTU5Mi43ODkgNjI3MS44OTEgTDE1ODcuNjQ0IDYzMjEuMzg5IEMxNTg3LjYyNiA2MzIxLjU2NiAxNTg3LjYxNCA2MzIxLjc0NSAxNTg3LjYxIDYzMjEuOTI0IEwxNTg2LjU0MyA2MzY2LjUyOCBDMTU4Ni41MzggNjM2Ni43MjQgMTU4Ni41NDIgNjM2Ni45MjEgMTU4Ni41NTUgNjM2Ny4xMTcgTDE1ODkuMTc3IDY0MDguMzM5IEMxNTg5LjE5IDY0MDguNTQ3IDE1ODkuMjEzIDY0MDguNzU0IDE1ODkuMjQ1IDY0MDguOTYgTDE1OTUuMjc1IDY0NDcuMjI5IEMxNTk1LjMwOSA2NDQ3LjQ0NSAxNTk1LjM1MyA2NDQ3LjY1OCAxNTk1LjQwOCA2NDQ3Ljg2OSBMMTYwNC40ODMgNjQ4Mi45MDggQzE2MDQuNTU1IDY0ODMuMTg4IDE2MDQuNjQ2IDY0ODMuNDYzIDE2MDQuNzU0IDY0ODMuNzMxIEwxNjEzLjExMyA2NTA0LjUxOSBDMTYxMy4yMzcgNjUwNC44MjggMTYxMy4zODQgNjUwNS4xMjcgMTYxMy41NTIgNjUwNS40MTQgTDE2MjQuMDQ3IDY1MjMuMzAyIEMxNjI0LjIxOSA2NTIzLjU5NyAxNjI0LjQxNCA2NTIzLjg3OCAxNjI0LjYyOSA2NTI0LjE0MiBMMTYzNy41NyA2NTQwLjA2MiBDMTYzNy43ODQgNjU0MC4zMjQgMTYzOC4wMTYgNjU0MC41NyAxNjM4LjI2NyA2NTQwLjc5OCBMMTY1NC4yMyA2NTU1LjMwNiBDMTY1NC40NjMgNjU1NS41MTggMTY1NC43MTEgNjU1NS43MTMgMTY1NC45NzEgNjU1NS44OSBMMTY3NS40NDYgNjU2OS44MTUgQzE2NzUuNjc5IDY1NjkuOTc0IDE2NzUuOTIxIDY1NzAuMTE3IDE2NzYuMTcyIDY1NzAuMjQ1IEwxNzAxLjA4MyA2NTgyLjk1NSBDMTcwMS4zMTMgNjU4My4wNzMgMTcwMS41NSA2NTgzLjE3NyAxNzAxLjc5MiA2NTgzLjI2NyBMMTczMS42ODIgNjU5NC40MDQgQzE3MzEuOTAxIDY1OTQuNDg1IDE3MzIuMTIzIDY1OTQuNTU1IDE3MzIuMzQ5IDY1OTQuNjE0IEwxNzY4LjMxOCA2NjAzLjkwNSBDMTc2OC41MDkgNjYwMy45NTQgMTc2OC43MDEgNjYwMy45OTUgMTc2OC44OTUgNjYwNC4wMjcgTDE4MTIuMjI3IDY2MTEuMjQ3IEMxODEyLjM5NyA2NjExLjI3NSAxODEyLjU2NyA2NjExLjI5NyAxODEyLjczOCA2NjExLjMxMiBMMTg2Mi44MjkgNjYxNS43NjMgQzE4NjIuOTgyIDY2MTUuNzc2IDE4NjMuMTM0IDY2MTUuNzg1IDE4NjMuMjg4IDY2MTUuNzg4IEwxOTIwLjg4NSA2NjE2Ljk2MiBDMTkyMS4wMTYgNjYxNi45NjUgMTkyMS4xNDggNjYxNi45NjQgMTkyMS4yNzkgNjYxNi45NTkgTDE5OTAuMTM3IDY2MTQuMzI1IEwyMDY3LjU2MyA2NjA3LjQwOCBMMjE1NS44NjEgNjU5NS40MjIgTDIyNTcuMzE4IDY1NzcuNjAxIEwyMzA5Ljc0OCA2NTY2LjQ3NyBDMjA3NS4xMjUgNjM5Ny4xODcgMTg2NS4zNDQgNjE5NS42MDcgMTY4Ni45MTcgNTk2OC4yNTEgWiIgY2xhc3M9ImNscy0yIi8+PC9nPjwvZz48L3N2Zz4=">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&family=Marcellus&display=swap" rel="stylesheet">
<script>try{const t=localStorage.getItem("pmTheme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}<\/script>
<style>
:root{color-scheme:light;--teal:#1A6772;--teal-d:#124C55;--accent:#1A6772;--mist:#E3E9E9;--bronze:#A78970;--ink:#0F2A2E;--label:#51696C;--line:#D5DEDE;--bg:#FFFFFF;--soft:#F5F8F8;--field:#FFFFFF;--off:#9aa8aa;--red:#B42828;--red-l:#e6c4c4;--green:#2C7A4B;--ok-bg:#E6F0E9;--err-bg:#F6E5E5;--q-bg:#F4ECE3;--q:#8A6744}
:root[data-theme=dark]{color-scheme:dark;--teal:#1A6772;--teal-d:#22808D;--accent:#7CC2C9;--mist:#222225;--bronze:#A78970;--ink:#E8E8E9;--label:#9C9CA1;--line:#2E2E32;--bg:#1A1A1C;--soft:#121213;--field:#222225;--off:#5C5C61;--red:#F2A3A3;--red-l:#4A2427;--green:#8FCFA6;--ok-bg:#1D2A23;--err-bg:#3A1C1E;--q-bg:#2E2A24;--q:#D9C2AD}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--teal:#1A6772;--teal-d:#22808D;--accent:#7CC2C9;--mist:#222225;--bronze:#A78970;--ink:#E8E8E9;--label:#9C9CA1;--line:#2E2E32;--bg:#1A1A1C;--soft:#121213;--field:#222225;--off:#5C5C61;--red:#F2A3A3;--red-l:#4A2427;--green:#8FCFA6;--ok-bg:#1D2A23;--err-bg:#3A1C1E;--q-bg:#2E2A24;--q:#D9C2AD}}
body,header,section,input,select,textarea,button,.preview{transition:background-color .25s,border-color .25s,color .25s}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--soft);color:var(--ink);font:15px/1.5 Jost,"Avenir Next","Segoe UI",system-ui,sans-serif}
header{background:var(--bg);border-bottom:1px solid var(--line);padding:0 24px;height:59px;display:flex;align-items:center;gap:14px}
header h1{font:400 22px Marcellus,Georgia,serif;margin:0;color:var(--accent)}
.brand{display:flex;align-items:center;gap:14px}.brand img{height:30px;width:auto;display:block}.brand span{font:400 21px Marcellus,Georgia,serif;color:var(--bronze);padding-left:14px;border-left:1px solid var(--line);line-height:26px;letter-spacing:.02em}
@media(max-width:520px){.brand img{height:24px}.brand span{font-size:18px}}header .who{margin-left:auto;color:var(--label);font-size:13px}
main{max-width:1180px;margin:0 auto;padding:24px;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:24px}
@media(max-width:900px){main{grid-template-columns:1fr}}
section{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:20px}
h2{font:500 13px Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--bronze);margin:0 0 14px}
label{display:block;font-weight:500;font-size:13px;color:var(--label);margin:14px 0 6px}
input[type=text],input[type=datetime-local],select,textarea{width:100%;font:inherit;color:var(--ink);background:var(--field);border:1px solid var(--line);border-radius:4px;padding:9px 11px}
input[type=file]{font:inherit;font-size:13.5px;color:var(--label)}input[type=file]::file-selector-button{font:500 13px Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;border-radius:4px;border:1px solid var(--line);background:var(--field);color:var(--ink);padding:6px 12px;margin-right:10px;cursor:pointer}
::placeholder{color:var(--off)}
textarea{min-height:220px;resize:vertical;font-size:14.5px}input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:var(--accent)}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.row>*{flex:1}
.radio{display:flex;gap:18px;flex-wrap:wrap;margin-top:4px}.radio label{display:flex;gap:7px;align-items:center;margin:0;font-weight:400;color:var(--ink)}
.radio label.off{color:var(--off)}
.hint{color:var(--label);font-size:12.5px;margin:6px 0 0}
button{font:500 14px Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;border-radius:4px;border:1px solid var(--line);background:var(--field);color:var(--ink);padding:9px 16px;cursor:pointer}
button.primary{background:var(--teal);border-color:var(--teal);color:#fff}button.primary:hover{background:var(--teal-d)}
button.warn{color:var(--red);border-color:var(--red-l)}button:disabled{opacity:.5;cursor:default}
.actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
.preview{border:1px dashed var(--line);border-radius:4px;padding:14px 16px;margin-top:8px;background:var(--soft);min-height:60px}
.preview h4{margin:12px 0 4px;font-size:15px}.preview p{margin:0 0 10px}.preview ul{margin:0 0 10px;padding-left:20px}
.atts{list-style:none;padding:0;margin:8px 0 0}.atts li{display:flex;gap:10px;align-items:center;font-size:13.5px;padding:4px 0}.atts button{padding:2px 9px;font-size:12px}
.mail{border-top:1px solid var(--line);padding:12px 0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px}
.mail:first-of-type{border-top:0}.mail b{font-weight:600}.mail .meta{color:var(--label);font-size:12.5px}
.mail .btns{grid-row:1/3;grid-column:2;display:flex;gap:6px;align-items:start}.mail .btns button{padding:4px 10px;font-size:12.5px}
.tag{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.05em;padding:1px 7px;border-radius:9px;margin-left:6px;vertical-align:1px}
.tag.s{background:var(--ok-bg);color:var(--green)}.tag.d{background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
.to-one{margin-top:4px;padding:2px 14px 12px;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:4px;background:var(--soft)}.to-one input{text-transform:uppercase}
.lv-dbtn button.msg{background:var(--teal);border-color:var(--teal);color:#fff;display:inline-flex;align-items:center;gap:6px}.lv-dbtn button.msg svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8}.lv-dbtn button.msg:disabled{opacity:.45}.tag.q{background:var(--q-bg);color:var(--q)}
.msg{margin-top:12px;padding:10px 12px;border-radius:4px;font-size:14px}.msg.ok{background:var(--ok-bg);color:var(--green)}.msg.err{background:var(--err-bg);color:var(--red)}
.deny{max-width:640px;margin:60px auto;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:24px;font-size:15px}
.empty{color:var(--label);font-size:14px}
/* ---------- header tabs ---------- */
.tabs{display:flex;gap:4px;margin-left:10px;background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:3px}
.tabs a{font:500 13.5px Jost,system-ui,sans-serif;color:var(--label);text-decoration:none;padding:5px 14px;border-radius:5px;display:flex;align-items:center;gap:7px}
.tabs a:hover{color:var(--ink)}.tabs a[aria-current=true]{background:var(--bg);color:var(--accent);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.lv-n{font:600 10.5px/1 Jost,system-ui,sans-serif;background:var(--teal);color:#fff;border-radius:9px;padding:3px 6px}
/* ---------- Live tab ---------- */
#live{--g-bg:#EEF3F3;--g-sphere:#DCE7E8;--g-land:#FFFFFF;--g-edge:#B9CBCD;--g-grat:rgba(26,103,114,.10);--g-rim:rgba(26,103,114,.25);--g-glow:rgba(26,103,114,.14);--g-route:#A78970;--g-plane:#1A6772;--g-trail:rgba(26,103,114,.35);--g-label:#0F2A2E;--g-ground:#EEF3F2;--g-apron:#D8E0E1;--g-twy:#C4CFD1;--g-rwy:#6F7D81;--g-rwy-mark:#FFFFFF;--g-rwy-tag:#1D1F22;--g-cl:#D4A21E;--g-twy-tag:#F2C230;--g-bldg:#B5C2C5;--g-stand:#51696C;
 --p-gate:#7A8A8C;--p-taxi:#A78970;--p-to:#2E8B97;--p-cr:#1A6772;--p-de:#B7791F;--p-arr:#2C7A4B}
:root[data-theme=dark] #live{--g-bg:#0B0D10;--g-sphere:#12171C;--g-land:#1F262D;--g-edge:#323C46;--g-grat:rgba(255,255,255,.045);--g-rim:rgba(255,255,255,.08);--g-glow:rgba(124,194,201,.13);--g-route:#E2C08C;--g-plane:#C9B39F;--g-trail:rgba(201,179,159,.3);--g-label:rgba(255,255,255,.75);--g-ground:#181D23;--g-apron:#2B343D;--g-twy:#3B4752;--g-rwy:#6B7783;--g-rwy-mark:rgba(255,255,255,.82);--g-rwy-tag:#0E1013;--g-cl:#C9A13A;--g-twy-tag:#E9BC2F;--g-bldg:#36424D;--g-stand:#9AA7AE;
 --p-gate:#8E8E94;--p-taxi:#D9C2AD;--p-to:#7CC2C9;--p-cr:#9AD6DC;--p-de:#E8B86A;--p-arr:#8FCFA6}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]) #live{--g-bg:#0B0D10;--g-sphere:#12171C;--g-land:#1F262D;--g-edge:#323C46;--g-grat:rgba(255,255,255,.045);--g-rim:rgba(255,255,255,.08);--g-glow:rgba(124,194,201,.13);--g-route:#E2C08C;--g-plane:#C9B39F;--g-trail:rgba(201,179,159,.3);--g-label:rgba(255,255,255,.75);--g-ground:#181D23;--g-apron:#2B343D;--g-twy:#3B4752;--g-rwy:#6B7783;--g-rwy-mark:rgba(255,255,255,.82);--g-rwy-tag:#0E1013;--g-cl:#C9A13A;--g-twy-tag:#E9BC2F;--g-bldg:#36424D;--g-stand:#9AA7AE;
 --p-gate:#8E8E94;--p-taxi:#D9C2AD;--p-to:#7CC2C9;--p-cr:#9AD6DC;--p-de:#E8B86A;--p-arr:#8FCFA6}}
main#live{max-width:none;margin:0;padding:0;gap:0;display:grid;grid-template-columns:minmax(0,1fr) 400px;height:calc(100vh - 59px);height:calc(100svh - 59px)}
main#live[hidden]{display:none!important}
.lv-stage{position:relative;background:var(--g-bg);overflow:hidden;min-height:0}
#lvGlobe{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none}#lvGlobe.dragging{cursor:grabbing}#lvGlobe.over-plane{cursor:pointer}
.lv-ctl{position:absolute;right:16px;bottom:16px;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--bg)}
.lv-ctl button{border:0;border-radius:0;background:transparent;width:38px;height:38px;padding:0;display:grid;place-items:center;font-size:18px;color:var(--ink)}
.lv-ctl button+button{border-top:1px solid var(--line)}.lv-ctl svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7}
.lv-src{position:absolute;left:16px;bottom:16px;font-size:12.5px;color:var(--label);background:color-mix(in srgb,var(--bg) 88%,transparent);border:1px solid var(--line);border-radius:6px;padding:6px 10px;display:flex;align-items:center;gap:7px;max-width:calc(100% - 90px)}
.lv-dot{width:7px;height:7px;border-radius:50%;background:#3FB27F;box-shadow:0 0 0 0 rgba(63,178,127,.6);animation:lvPulse 2s infinite}
@keyframes lvPulse{70%{box-shadow:0 0 0 7px rgba(63,178,127,0)}100%{box-shadow:0 0 0 0 rgba(63,178,127,0)}}
.lv-err{color:var(--red)}.lv-link{border:0;background:none;padding:0;color:var(--accent);font-size:12.5px;text-decoration:underline}
.lv-tag{display:inline-block;font:600 10.5px Jost,system-ui,sans-serif;letter-spacing:.06em;color:var(--q);background:var(--q-bg);border-radius:9px;padding:1px 7px;margin-left:7px;vertical-align:2px}
.lv-src .lv-tag{margin:0}
.lv-side{border-left:1px solid var(--line);background:var(--bg);display:flex;flex-direction:column;min-height:0;overflow:auto}
.lv-sum{display:grid;grid-template-columns:repeat(7,1fr);border-bottom:1px solid var(--line)}
.lv-c{padding:12px 2px 10px;text-align:center;border-top:3px solid var(--pc,var(--line))}
.lv-c b{display:block;font:400 22px/1.1 Marcellus,Georgia,serif;color:var(--ink)}.lv-c span{display:block;font-size:10.5px;color:var(--label);margin-top:3px;letter-spacing:.02em}
.lv-c.z{opacity:.45}
.ph-gate{--pc:var(--p-gate)}.ph-taxiout,.ph-taxiin{--pc:var(--p-taxi)}.ph-takeoff{--pc:var(--p-to)}.ph-cruise{--pc:var(--p-cr)}.ph-descent{--pc:var(--p-de)}.ph-arrived{--pc:var(--p-arr)}
.lv-list{display:flex;flex-direction:column;padding:6px 0}
.lv-f{display:grid;grid-template-columns:auto 1fr auto;grid-template-areas:"cs rt ph" "cs al ph";gap:1px 12px;align-items:center;text-align:left;border:0;border-radius:0;background:transparent;padding:10px 18px;border-left:3px solid transparent}
.lv-f:hover{background:var(--soft)}.lv-f.on{background:var(--soft);border-left-color:var(--accent)}
.lv-cs{grid-area:cs;font:600 14.5px "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--ink)}
.lv-rt{grid-area:rt;font-size:13.5px;color:var(--ink)}.lv-rt i{font-style:normal;color:var(--label);margin:0 2px}.lv-rt em{font-style:normal;color:var(--label);font-size:12px;margin-left:8px}
.lv-al{grid-area:al;font-size:12px;color:var(--label)}
.lv-ph{grid-area:ph;font:600 11px Jost,system-ui,sans-serif;letter-spacing:.03em;color:var(--pc);border:1px solid color-mix(in srgb,var(--pc) 45%,transparent);background:color-mix(in srgb,var(--pc) 12%,transparent);border-radius:10px;padding:2px 9px;white-space:nowrap}
.lv-empty{padding:28px 22px;color:var(--label);font-size:14px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}.lv-empty b{color:var(--ink);font-weight:500}.lv-empty button{margin-top:6px}
.lv-det{border-top:1px solid var(--line);padding:16px 18px 20px;margin-top:auto;background:var(--bg)}
.lv-dh{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.lv-dh b{font:600 18px "IBM Plex Mono",ui-monospace,Consolas,monospace}.lv-dh small{display:block;color:var(--label);font-size:12.5px;margin-top:2px}
.lv-dbtn{display:flex;gap:6px}.lv-dbtn button{padding:4px 10px;font-size:12.5px}.lv-dbtn button[aria-pressed=true]{background:var(--teal);border-color:var(--teal);color:#fff}
.lv-od{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;margin-top:14px}
.lv-od b{font:400 22px Marcellus,Georgia,serif;display:block}.lv-od small{color:var(--label);font-size:11.5px}.lv-od .r{text-align:right}
.lv-bar{position:relative;height:2px;background:var(--line);border-radius:2px}.lv-bar span{position:absolute;left:0;top:0;bottom:0;background:var(--bronze);border-radius:2px;transition:width .6s}
.lv-bar i{position:absolute;top:50%;width:18px;height:18px;transform:translate(-50%,-50%) rotate(90deg);transition:left .6s;display:block}.lv-bar i svg{width:100%;height:100%;fill:var(--bronze);display:block}
.lv-dist{font-size:12px;color:var(--label);margin-top:8px}
.lv-steps{list-style:none;padding:0;margin:16px 0 4px;display:grid;grid-template-columns:repeat(7,1fr);position:relative}
.lv-steps li{display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;font-size:10.5px;color:var(--label);text-align:center}
.lv-steps li::before{content:"";position:absolute;top:5px;left:-50%;right:50%;height:2px;background:var(--line)}.lv-steps li:first-child::before{display:none}
.lv-steps li.done::before,.lv-steps li.now::before{background:var(--accent)}
.lv-steps span{width:12px;height:12px;border-radius:50%;border:2px solid var(--line);background:var(--bg);position:relative;z-index:1}
.lv-steps li.done span{background:var(--accent);border-color:var(--accent)}
.lv-steps li.now span{border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 25%,transparent);background:var(--accent);animation:lvNow 1.6s ease-in-out infinite}
@keyframes lvNow{50%{box-shadow:0 0 0 7px color-mix(in srgb,var(--accent) 10%,transparent)}}
.lv-steps b{font-weight:500}.lv-steps li.now b{color:var(--ink);font-weight:600}
.lv-kv{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin:16px 0 0}.lv-kv dt{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--label)}.lv-kv dd{margin:2px 0 0;font:500 14px "IBM Plex Mono",ui-monospace,Consolas,monospace}
.lv-route{margin-top:14px;font-size:13px}.lv-route summary{cursor:pointer;color:var(--accent)}.lv-route p{font:12.5px/1.6 "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--label);margin:8px 0 0;word-break:break-word}
@media(max-width:900px){main#live{grid-template-columns:1fr;grid-template-rows:56vh auto;height:auto}.lv-side{border-left:0;border-top:1px solid var(--line);overflow:visible}.tabs{margin-left:auto}.who{display:none}}
@media(prefers-reduced-motion:reduce){.lv-dot,.lv-steps li.now span{animation:none}}
@media(max-width:560px){header{padding:0 12px;gap:10px}.brand{gap:0}.brand span{display:none}.brand img{height:22px}.tabs a{padding:5px 10px}.thm button{padding:5px 6px}}

.preview a{color:var(--accent)}
.thm{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}.thm button{border:0;border-radius:0;background:transparent;color:var(--label);padding:5px 9px;display:grid;place-items:center}.thm button+button{border-left:1px solid var(--line)}.thm button[aria-pressed=true]{background:var(--soft);color:var(--accent)}.thm svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
</style></head><body>
<header><h1 class="brand"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgMTUwOTIuNDg0IDM5MDUuNDYiPjxkZWZzPjxzdHlsZT4KICAgICAgLmNscy0xe2ZpbGw6IzFhNjc3MH0KICAgICAgLmNscy0ye2ZpbGw6I2E3ODk3MH0KICAgIDwvc3R5bGU+PC9kZWZzPjxnIGlkPSJBc3NldF8zMCIgZGF0YS1uYW1lPSJBc3NldCAzMCI+PGc+PGc+PHBvbHlnb24gcG9pbnRzPSIxOTA0LjYyMiwzNjkuNDcyIDE5MDQuNTI4LDExOS4wMzkgMTk1NC42OTksMzcwLjE4MyAxOTY0LjY5MSw0MjAuMTk3IDE5ODUuNzAxLDUyNS4zNjkgMTk5MS45ODMsNTU2LjgxMyAyMTI3LjkwNiwxMjM3LjIwNyAyMTMzLjk0MiwxMjY3LjQxOCAyMTc1LjIyMSwxNDc0LjA1MiAyMjA1LjgwNiwxNjI3LjE1MSAyMjA4LjA0OSwxNjM4LjM3OCAyMjA4LjI4OSwxNjM5LjU3NyAyMTk4LjQ3MSwxNjQ5LjQxOCAxOTI4LjUxOSwxOTIwLjAzOCAxOTA1LjI3NSwxOTQzLjMzOSAyMTc4LjU5NywxOTQyLjk5MiAyMTk2LjU4OCwxOTQyLjk2OSAyMjkyLjYwNCwxOTQyLjg0NyAyMTk2LjU4OCwxOTQyLjk3IDIxNzguNTk3LDE5NDIuOTkzIDE5MDYuMTA4LDE5NDMuMzQxIDIxNzguMDQ4LDE5NDMuODE2IDIxOTYuMDAzLDE5NDMuODQ3IDMyOTUuNjU1LDE5NDUuNzY5IDMzMjYuNjg2LDE5NDUuODIzIDM0MzQuNTYzLDE5NDYuMDEyIDM0ODQuMjEzLDE5NDYuMDk5IDM2ODMuMjk1LDE5NDYuNDQ3IDM2ODQuNTg3LDE5NDYuNzA1IDM0ODMuNzExLDE5ODcuMDYzIDM0MzMuNzUzLDE5OTcuMSAzMzI0LjY4NSwyMDE5LjAxMyAzMjkzLjI1MywyMDI1LjMyOCAyMzcwLjQyNSwyMjEwLjczMyAyMjAzLjU1OCwyMjQ0LjI1OCAyMjAzLjQyMiwyMjQ0LjI4NSAxOTA2LjYwNywxOTQ0Ljc0NCAxOTA1LjI3NSwxOTQzLjQgMTkwNS4yNzUsMTk0NC43NDYgMTkwNS4yNzYsMTk0OC4wNTYgMjA3OC4xNjksMjEyMC41MSAxOTA1LjI3NiwxOTQ4LjA1OCAxOTA1LjI3NiwxOTQ4LjA3NiAxOTA1LjI3OSwxOTc2LjQ2OSAxOTA1LjMwMywyMjIwLjAxOSAxOTA1LjMwNCwyMjM3Ljk4MyAxOTA1LjMxMSwyMzA0LjE3OSAxOTA1LjMxMywyMzI3LjkxNyAxOTA1LjM3LDI5MDUuOTk2IDE5MDUuMzc0LDI5MzguMDMyIDE5MDUuNDEyLDMzMzEuNTggMTkwNS40MTYsMzM2Mi42MTEgMTkwNS40MjcsMzQ3NC42MTggMTkwNS40MzIsMzUyNC4yNjkgMTkwNS40NTcsMzc3Ny40NiAxOTA1LjQ1NywzNzg1LjI2IDE4NTMuODIsMzUyMy4zOTYgMTg0My45NTIsMzQ3My4zNDkgMTgyMS42MTgsMzM2MC4wODcgMTgxNS40MTEsMzMyOC42MDkgMTc1MS4zMjUsMzAwMy42MSAxNzQ1LjIxOSwyOTcyLjY0NCAxNjM1LjEyNywyNDE0LjMzNSAxNjA2LjI0LDIyNjcuODM5IDE2MDEuNzQyLDIyNDUuMDI4IDE3MjcuMjQ0LDIxMTkuNTAxIDE3MzguMDI5LDIxMDguNzE1IDE3NzMuNDI3LDIwNzMuMzEgMTc3My40MjgsMjA3My4zMDkgMTg4MS42NjUsMTk2Ni41NjggMTkwMS45MjUsMTk0Ni41ODggMTkwMi44NjcsMTk0NS42NTkgMTkwMi4zMzksMTk0NS4xMjkgMTkwMi44NjksMTk0NS42NTcgMTkwMi44NywxOTQ1LjY1NiAxOTAzLjc5MiwxOTQ0Ljc0OCAxOTA1LjIxNywxOTQzLjM0MiAxOTA1LjIxNiwxOTQxLjQzOSAxOTA1LjEwOSwxNjU2Ljk2MyAxOTA1LjA0MSwxNDc2Ljc0OSAxOTA1LjAyNiwxNDM2LjYxOSAxOTA0LjY5Miw1NTQuMjU3IDE5MDQuNjgsNTIzLjIyNiAxOTA0LjY0MSw0MTkuMTIyIiBjbGFzcz0iY2xzLTEiLz48cG9seWdvbiBwb2ludHM9IjIyMjcuODI4LDE2MTguNTg0IDI3MzAuNDk5LDExMTUuNTMzIDIzNzMuOTg5LDE2NTAuMDQ0IDIyMjguMDYyLDE2MTkuNzU0IiBjbGFzcz0iY2xzLTEiLz48cG9seWdvbiBwb2ludHM9IjE1ODcuNTY4LDE2MjkuMDkzIDEwOTIuNDY2LDExMzEuOTk2IDE2MTguNDU4LDE0ODUuOTM0IDE1OTEuMDMyLDE2MjguNDE1IiBjbGFzcz0iY2xzLTEiLz48cG9seWdvbiBwb2ludHM9IjE2MDcuMzM3LDE2NDguOTQyIDE2MTAuODI5LDE2NDguMjU5IDE2NDIuOTUxLDE2ODAuNDU3IDE2NjYuMzQ5LDE3MDMuOTEgMTkwMS45MzksMTk0MC4wNTYgMTkwNC4yNjcsMTk0Mi4zODkgMTkwNS4yMTcsMTk0My4zNDIgMTkwMy4zMTksMTk0My4zMzggMTkwMS45MzUsMTk0My4zMzUgMTkwMC41NDcsMTk0My4zMzIgMTYwOS43NTEsMTk0Mi43NDggMTUxOC4zNzgsMTk0Mi41NjQgMTQyNy4zNTUsMTk0Mi4zODEgMTM3Ni4wMDMsMTk0Mi4yNzggNTE4LjMzNCwxOTQwLjU1NCA1MTguMzM0LDE5NDAuNTU0IDQ4Ny4zMDMsMTk0MC40OTEgNDg3LjMwMywxOTQwLjQ5MSAzNzkuMDc5LDE5NDAuMjc0IDM3OS4wNzksMTk0MC4yNzQgMzI5LjQyOCwxOTQwLjE3NCAzMjkuNDI4LDE5NDAuMTc0IDEyMC4wNDcsMTkzOS43NTMgMzMwLjEzNiwxODk4LjY3NCAzODAuMTQ0LDE4ODguODk2IDQ4OS4yNjcsMTg2Ny41NTkgNTIwLjY4NCwxODYxLjQxNiAxNDM3LjYyOCwxNjgyLjEyNSIgY2xhc3M9ImNscy0xIi8+PHBvbHlnb24gcG9pbnRzPSIxMDY1LjE2LDI3ODEuNzE1IDE0MzMuNTM5LDIyMzIuMzczIDE1ODEuNDg1LDIyNjIuNTk3IDE1ODEuNTIyLDIyNjIuNzg2IDE1ODEuOTI4LDIyNjQuODQ2IDEwNjguNzA1LDI3NzguMTcxIiBjbGFzcz0iY2xzLTEiLz48cG9seWdvbiBwb2ludHM9IjIxOTQuNDYxLDI0MTIuNDI3IDIyMjIuNjg4LDIyNjYuNTk5IDI1NjIuMTQxLDI2MDcuMjQxIDI1NzkuMzg0LDI2MjQuNTQ1IDI3MDguMzk5LDI3NTQuMDExIDI3MDguODY5LDI3NTQuNzE2IDI1NDEuMjA5LDI2NDMuMTU0IDI1MTguNTAyLDI2MjguMDQ1IiBjbGFzcz0iY2xzLTEiLz48cGF0aCBkPSJNMTgzMy4wMzYgMzcxLjE2NSBMMTkwNC40OCAwIEwxOTc4LjYxMSAzNzEuMDc1IEwxOTc4LjYxMSAzNzEuMDc1IEMyMjkwLjIzMSAzODUuMDM1IDI1NzguMzIgNDg5LjQwOSAyODE3LjI3NyA2NTguNTk1IEwyODk3LjUyNiA1OTUuODgzIEwyOTY1LjI2OCA1NDQuOTYgQzI5NjUuODMzIDU0NC41MzUgMjk2Ni41MTYgNTQ0LjI5MyAyOTY3LjIyMyA1NDQuMjY5IEwyOTcyLjA2MiA1NDQuMDk5IEMyOTc0LjQyMSA1NDQuMDI2IDI5NzYuMTU5IDU0Ni4yODggMjk3NS40NzcgNTQ4LjU1IEwyOTc0LjA4MyA1NTMuMTczIEMyOTczLjg3OSA1NTMuODUgMjk3My40NzIgNTU0LjQ0OCAyOTcyLjkxNiA1NTQuODg3IEwyOTA2LjUwNSA2MDcuMzI1IEwyODMxLjQwMSA2NjguNzEyIEMzMjEwLjEzNyA5NDMuMTU3IDM0NjIuMTA4IDEzODEuODE1IDM0ODIuODMgMTg4MC4yMDIgTDM4MDIuOTg5IDE5NDYuNjU2IEwzNDgyLjkzNSAyMDEwLjk1OCBDMzQ1MC4yNzYgMjgyOC4yNjggMjc5NS43NDQgMzQ4NS41NjcgMTk3OS41NzIgMzUyMi42MjEgTDE5NzkuNTcyIDM1MjIuNjIxIEwxOTA1LjQ2OSAzOTA1LjQ2IEwxOTA1LjQ2OSAzOTA1LjI4NCBMMTkwNS40MzcgMzkwNS40NiBMMTgyOS45MDcgMzUyMi40MjcgQzE1MzMuNDgyIDM1MDguMTk3IDEyNTguNTEgMzQxMi4xNDUgMTAyNy4wODQgMzI1Ni4zNjQgTDEwMjMuNjkgMzI1Ny4yMjYgTDk2NS4zNjcgMzI3MC4xMzQgTDkxMS45ODEgMzI3OS45OTQgTDg2NS4wOTEgMzI4Ni43NzggTDgyMy40OTkgMzI5MC44NjEgTDc4Ni4wMDkgMzI5Mi42MjQgQzc4NS45NDIgMzI5Mi42MjcgNzg1Ljg3NCAzMjkyLjYyOCA3ODUuODA3IDMyOTIuNjI3IEw3NTMuNzEzIDMyOTIuMjU0IEM3NTMuNjM1IDMyOTIuMjUzIDc1My41NTYgMzI5Mi4yNSA3NTMuNDc4IDMyOTIuMjQzIEw3MjQuODU1IDMyODkuOTUzIEM3MjQuNzY4IDMyODkuOTQ2IDcyNC42OCAzMjg5LjkzNiA3MjQuNTkzIDMyODkuOTIyIEw2OTkuMDQ5IDMyODUuODk2IEM2OTguOTQ5IDMyODUuODgxIDY5OC44NSAzMjg1Ljg2IDY5OC43NTIgMzI4NS44MzYgTDY3Ni40NzkgMzI4MC4yOTIgQzY3Ni4zNjMgMzI4MC4yNjMgNjc2LjI0OCAzMjgwLjIyOCA2NzYuMTM2IDMyODAuMTg3IEw2NTYuNTQ4IDMyNzMuMDg2IEM2NTYuNDIzIDMyNzMuMDQxIDY1Ni4zMDEgMzI3Mi45ODkgNjU2LjE4MyAzMjcyLjkzIEw2MzguOTMzIDMyNjQuMzIyIEM2MzguODA0IDMyNjQuMjU4IDYzOC42NzkgMzI2NC4xODUgNjM4LjU1OSAzMjY0LjEwNSBMNjIzLjQ0MiAzMjU0LjAyMiBDNjIzLjMwNyAzMjUzLjkzMiA2MjMuMTc5IDMyNTMuODMzIDYyMy4wNTkgMzI1My43MjUgTDYxMC4zMiAzMjQyLjM1OSBDNjEwLjE5MSAzMjQyLjI0MyA2MTAuMDcgMzI0Mi4xMTggNjA5Ljk2IDMyNDEuOTg1IEw1OTkuMjQ2IDMyMjkuMDUgQzU5OS4xMzUgMzIyOC45MTUgNTk5LjAzMyAzMjI4Ljc3MiA1OTguOTQzIDMyMjguNjIyIEw1OTAuMjY2IDMyMTQuMTM3IEM1OTAuMTc4IDMyMTMuOTkxIDU5MC4xMDEgMzIxMy44MzggNTkwLjAzNiAzMjEzLjY4IEw1ODMuNDQyIDMxOTcuNzAyIEM1ODMuMzg1IDMxOTcuNTY1IDU4My4zMzcgMzE5Ny40MjMgNTgzLjI5OSAzMTk3LjI4IEw1NzcuMjU0IDMxNzQuNzY2IEM1NzcuMjI1IDMxNzQuNjU4IDU3Ny4yMDEgMzE3NC41NDggNTc3LjE4MyAzMTc0LjQzOCBMNTczLjI2IDMxNTAuODkxIEM1NzMuMjQyIDMxNTAuNzg2IDU3My4yMjkgMzE1MC42NzkgNTczLjIyMiAzMTUwLjU3MyBMNTcxLjQxNSAzMTI1LjYzOCBDNTcxLjQwOCAzMTI1LjUzOCA1NzEuNDA1IDMxMjUuNDM3IDU3MS40MDYgMzEyNS4zMzYgTDU3MS44MDYgMzA5OC44OTkgQzU3MS44MDggMzA5OC44MDggNTcxLjgxMyAzMDk4LjcxNiA1NzEuODIxIDMwOTguNjI1IEw1NzQuNTQyIDMwNzAuMDA4IEM1NzQuNTUgMzA2OS45MjcgNTc0LjU2IDMwNjkuODQ2IDU3NC41NzQgMzA2OS43NjYgTDU3OS42NTQgMzAzOS4zNjcgQzU3OS42NjYgMzAzOS4yOTIgNTc5LjY4MSAzMDM5LjIxOCA1NzkuNjk4IDMwMzkuMTQ0IEw1ODcuMzA0IDMwMDYuODU2IEM1ODcuMzIgMzAwNi43ODcgNTg3LjMzOSAzMDA2LjcyIDU4Ny4zNTkgMzAwNi42NTMgTDU5Ny43NTIgMjk3Mi4xIEM1OTcuNzY5IDI5NzIuMDQxIDU5Ny43ODkgMjk3MS45ODIgNTk3LjgxIDI5NzEuOTI0IEw2MTEuMzk1IDI5MzQuMTk1IEw2MjguMDU2IDI4OTQuMTM3IEw2MzQuNzcxIDI4NzkuODM4IEM0NTMuODg3IDI2MzMuNjMgMzQyLjc2NSAyMzMyLjk4NCAzMzAuNTQxIDIwMDcuMDM5IEwwIDE5MzkuNTEyIEwzMzEuMDMyIDE4NzQuNzg1IEMzNjcuNjExIDEwNjEuNTI4IDEwMjAuMDAyIDQwOC41OTggMTgzMy4wMzYgMzcxLjE2NSBaIE0xOTA0LjUyOCAxMTkuMDM5IEwxOTA0LjYyMiAzNjkuNDcyIEwxOTA0LjY0MSA0MTkuMTIyIEwxOTA0LjY4IDUyMy4yMjYgTDE5MDQuNjkyIDU1NC4yNTcgTDE5MDUuMDI2IDE0MzYuNjE5IEwxOTA1LjA0MSAxNDc2Ljc0OSBMMTkwNS4xMDkgMTY1Ni45NjMgTDE5MDUuMjE2IDE5NDEuNDM5IEwxOTA1LjIxNyAxOTQzLjM0MiBMMTkwMy43OTIgMTk0NC43NDggTDE5MDIuODcgMTk0NS42NTYgTDE5MDIuODY5IDE5NDUuNjU3IEwxOTAyLjMzOSAxOTQ1LjEyOSBMMTkwMi44NjcgMTk0NS42NTkgTDE5MDEuOTI1IDE5NDYuNTg4IEwxODgxLjY2NSAxOTY2LjU2OCBMMTc3My40MjggMjA3My4zMDkgTDE3NzMuNDI3IDIwNzMuMzEgTDE3MzguMDI5IDIxMDguNzE1IEwxNzI3LjI0NCAyMTE5LjUwMSBMMTYwMS43NDIgMjI0NS4wMjggTDE2MDYuMjQgMjI2Ny44MzkgTDE2MzUuMTI3IDI0MTQuMzM1IEwxNzQ1LjIxOSAyOTcyLjY0NCBMMTc1MS4zMjUgMzAwMy42MSBMMTgxNS40MTEgMzMyOC42MDkgTDE4MjEuNjE4IDMzNjAuMDg3IEwxODQzLjk1MiAzNDczLjM0OSBMMTg1My44MiAzNTIzLjM5NiBMMTkwNS40NTcgMzc4NS4yNiBMMTkwNS40NTcgMzc3Ny40NiBMMTkwNS40MzIgMzUyNC4yNjkgTDE5MDUuNDI3IDM0NzQuNjE4IEwxOTA1LjQxNiAzMzYyLjYxMSBMMTkwNS40MTIgMzMzMS41OCBMMTkwNS4zNzQgMjkzOC4wMzIgTDE5MDUuMzcgMjkwNS45OTYgTDE5MDUuMzEzIDIzMjcuOTE3IEwxOTA1LjMxMSAyMzA0LjE3OSBMMTkwNS4zMDQgMjIzNy45ODMgTDE5MDUuMzAzIDIyMjAuMDE5IEwxOTA1LjI3OSAxOTc2LjQ2OSBMMTkwNS4yNzYgMTk0OC4wNzYgTDE5MDUuMjc2IDE5NDguMDU4IEwyMDc4LjE2OSAyMTIwLjUxIEwxOTA1LjI3NiAxOTQ4LjA1NiBMMTkwNS4yNzUgMTk0NC43NDYgTDE5MDUuMjc1IDE5NDMuNCBMMTkwNi42MDcgMTk0NC43NDQgTDIyMDMuNDIyIDIyNDQuMjg1IEwyMjAzLjU1OCAyMjQ0LjI1OCBMMjM3MC40MjUgMjIxMC43MzMgTDMyOTMuMjUzIDIwMjUuMzI4IEwzMzI0LjY4NSAyMDE5LjAxMyBMMzQzMy43NTMgMTk5Ny4xIEwzNDgzLjcxMSAxOTg3LjA2MyBMMzY4NC41ODcgMTk0Ni43MDUgTDM2ODMuMjk1IDE5NDYuNDQ3IEwzNDg0LjIxMyAxOTQ2LjA5OSBMMzQzNC41NjMgMTk0Ni4wMTIgTDMzMjYuNjg2IDE5NDUuODIzIEwzMjk1LjY1NSAxOTQ1Ljc2OSBMMjE5Ni4wMDMgMTk0My44NDcgTDIxNzguMDQ4IDE5NDMuODE2IEwxOTA2LjEwOCAxOTQzLjM0MSBMMjE3OC41OTcgMTk0Mi45OTMgTDIxOTYuNTg4IDE5NDIuOTcgTDIyOTIuNjA0IDE5NDIuODQ3IEwyMTk2LjU4OCAxOTQyLjk2OSBMMjE3OC41OTcgMTk0Mi45OTIgTDE5MDUuMjc1IDE5NDMuMzM5IEwxOTI4LjUxOSAxOTIwLjAzOCBMMjE5OC40NzEgMTY0OS40MTggTDIyMDguMjg5IDE2MzkuNTc3IEwyMjA4LjA0OSAxNjM4LjM3OCBMMjIwNS44MDYgMTYyNy4xNTEgTDIxNzUuMjIxIDE0NzQuMDUyIEwyMTMzLjk0MiAxMjY3LjQxOCBMMjEyNy45MDYgMTIzNy4yMDcgTDE5OTEuOTgzIDU1Ni44MTMgTDE5ODUuNzAxIDUyNS4zNjkgTDE5NjQuNjkxIDQyMC4xOTcgTDE5NTQuNjk5IDM3MC4xODMgWiBNMTkwNS4yMTcgMTk0My4zNDIgTDE5MDQuMjY3IDE5NDIuMzg5IEwxOTAxLjkzOSAxOTQwLjA1NiBMMTY2Ni4zNDkgMTcwMy45MSBMMTY0Mi45NTEgMTY4MC40NTcgTDE2MTAuODI5IDE2NDguMjU5IEwxNjA3LjMzNyAxNjQ4Ljk0MiBMMTQzNy42MjggMTY4Mi4xMjUgTDUyMC42ODQgMTg2MS40MTYgTDQ4OS4yNjcgMTg2Ny41NTkgTDM4MC4xNDQgMTg4OC44OTYgTDMzMC4xMzYgMTg5OC42NzQgTDEyMC4wNDcgMTkzOS43NTMgTDMyOS40MjggMTk0MC4xNzQgTDMyOS40MjggMTk0MC4xNzQgTDM3OS4wNzkgMTk0MC4yNzQgTDM3OS4wNzkgMTk0MC4yNzQgTDQ4Ny4zMDMgMTk0MC40OTEgTDQ4Ny4zMDMgMTk0MC40OTEgTDUxOC4zMzQgMTk0MC41NTQgTDUxOC4zMzQgMTk0MC41NTQgTDEzNzYuMDAzIDE5NDIuMjc4IEwxNDI3LjM1NSAxOTQyLjM4MSBMMTUxOC4zNzggMTk0Mi41NjQgTDE2MDkuNzUxIDE5NDIuNzQ4IEwxOTAwLjU0NyAxOTQzLjMzMiBMMTkwMS45MzUgMTk0My4zMzUgTDE5MDMuMzE5IDE5NDMuMzM4IFogTTE5ODguNjM5IDQyMS4yNzQgTDIwMDkuNzM3IDUyNi44ODQgQzIyNjAuNjg4IDU0NC44MzEgMjQ5My41OTIgNjI4LjAwNCAyNjkxLjU4OCA3NTkuNTQxIEMyNjk3LjA3NSA3NjMuMTg2IDI3MDIuNTM2IDc2Ni44NjkgMjcwNy45NjkgNzcwLjU4OCBDMzA1Ni44NiAxMDA5LjQyMSAzMjkzLjcxNyAxMzk5Ljk0NiAzMzIzLjUwOSAxODQ3LjEzMiBMMzQzMi42NTIgMTg2OS43ODYgQzM0MDguNjkgMTM4Ny41ODkgMzE2MS4xNjQgOTY0LjI0IDI3OTEuNTg5IDcwMS4yNTMgQzI3ODYuNTY1IDY5Ny42NzcgMjc4MS41MTggNjk0LjEzMiAyNzc2LjQ0OSA2OTAuNjE2IEMyNTUwLjU5NyA1MzMuOTc2IDIyODAuNDc0IDQzNi42NzYgMTk4OC42MzkgNDIxLjI3NCBaIE0xODIzLjM3NCA0MjEuMzYxIEMxMDQ1LjUzNiA0NjMuMjI3IDQyMi4zMiAxMDg2LjkyOSAzODEuMjIyIDE4NjQuOTcxIEw0OTAuNzI0IDE4NDMuNTYgQzUzOS4zNDkgMTE0MC4xOTggMTEwMC4yOTkgNTc3LjgyNiAxODAzLjA0NSA1MjYuOTcxIFogTTIwMTYuMDQ4IDU1OC40NzQgTDIxNDguMDcyIDEyMTkuMzQ2IEwyMTU4LjY4OSAxMjA5Ljk0MiBMMjMxNS45MTkgMTA3My41ODUgTDI0NzcuMTQ5IDkzNi42ODQgTDI2MzUuNDIgODA1LjE2MSBMMjY2Ni4zMjYgNzgwLjA1OCBDMjQ3Ni42ODQgNjU1Ljk3MiAyMjU0LjgzOCA1NzcuMDI0IDIwMTYuMDQ4IDU1OC40NzQgWiBNMTc5Ni45NjcgNTU4LjU1IEMxMTE2LjI2OCA2MTEuOTA3IDU3My40NzUgMTE1Ni4wODUgNTIyLjI4MiAxODM3LjM4OSBMMTQyMy43NTEgMTY2MS4xMjQgTDEwMzguMDMyIDEwNzcuMzQyIEwxNjIxLjUyOSAxNDY5Ljk3NiBaIE0yNjgzLjEwMSA3OTEuMjA5IEwyNjQ3Ljk5OSA4MjAuMzE1IEwyNDkxLjI0NCA5NTMuMjkyIEwyMzMxLjU5NCAxMDkxLjY2NiBMMjE3NS45NTMgMTIyOS40MzkgTDIxNTQuMDQ1IDEyNDkuMjQ0IEwyMTk2LjEyNyAxNDU5Ljg5NiBMMjc4NC41NjMgMTA2MS40MjYgTDIzODkuNzc5IDE2NTMuMzIxIEwzMjkxLjk0NCAxODQwLjU4IEMzMjYwLjExOCAxNDAzLjY1MSAzMDI2LjEzMiAxMDIyLjgyMiAyNjgzLjEwMSA3OTEuMjA5IFogTTI3MzAuNDk5IDExMTUuNTMzIEwyMjI3LjgyOCAxNjE4LjU4NCBMMjIyOC4wNjIgMTYxOS43NTQgTDIzNzMuOTg5IDE2NTAuMDQ0IFogTTEwOTIuNDY2IDExMzEuOTk2IEwxNTg3LjU2OCAxNjI5LjA5MyBMMTU5MS4wMzIgMTYyOC40MTUgTDE2MTguNDU4IDE0ODUuOTM0IFogTTM4MC42NTggMjAxNy4yNzcgQzM5NC4zNDggMjMxOS4wNjEgNDk1LjU5MSAyNTk4LjAyOCA2NTkuNTg4IDI4MjkuMzc5IEM2NjkuMjAyIDI4NDIuOTQyIDY3OS4wMzIgMjg1Ni4zNDIgNjg5LjA3MyAyODY5LjU3MyBDNzg5Ljg1MSAzMDAyLjM2OSA5MTEuODU0IDMxMTguMTc1IDEwNTAuMDI3IDMyMTEuOTM4IEwxMDgxLjY0NiAzMjA0LjE5OSBMMTE1My41MDUgMzE4NC40OTIgTDExOTUuNjQzIDMxNzEuODEgQzEwMTkuMDE2IDMwNjkuMzQ4IDg2Ni41MTIgMjkyOS44OTkgNzQ4LjczMSAyNzY0LjA2MyBDNzM5LjA1NCAyNzUwLjQzNyA3MjkuNjExIDI3MzYuNjM0IDcyMC40MDkgMjcyMi42NTkgQzU4OS42OTkgMjUyNC4xNSA1MDcuNDYzIDIyOTAuODkxIDQ5MC41NSAyMDM5LjcyOCBaIE0zNDMyLjc5NSAyMDIxLjAzMSBMMzMyMy4yMTMgMjA0My4wNDcgQzMyNzQuMjM4IDI3NDUuOTQgMjcxMy42MDkgMzMwNy44NTMgMjAxMS4yNzMgMzM1OC44NDEgTDE5ODkuMjg2IDM0NzIuNDMxIEMyNzcwLjE1MyAzNDMwLjg5MyAzMzk1LjQxOSAyODAyLjk5NSAzNDMyLjc5NSAyMDIxLjAzMSBaIE01MjIuMTEzIDIwNDYuMTc2IEM1MzkuNTY0IDIyODMuNTggNjE2LjY5OSAyNTA0LjM5NyA3MzguNTc0IDI2OTMuNjgxIEw3NzAuNzgzIDI2NDQuODQgTDgxMy41MjggMjU4NC41NjMgTDg2Mi40MjUgMjUxOS4yNjUgTDkxNi45OTIgMjQ0OS43ODggTDk3Ny41ODEgMjM3Ni4wMjYgTDEwNDUuMzMzIDIyOTYuNzUzIEwxMTE5LjI4NiAyMjEzLjQxNCBMMTE1NC4yNDkgMjE3NS4zMTYgWiBNMzI5MS42MzcgMjA0OS4zOTEgTDIzODQuMTg4IDIyMzEuNzA2IEwyNjE0LjU5NyAyNTgyLjgyIEwyNzgxLjY1OSAyNTA0LjAzNyBMMjkxMi4zMzcgMjQ0MC42MzMgQzI5MTIuOTA1IDI0NDAuMzU4IDI5MTMuNTM3IDI0NDAuMjQzIDI5MTQuMTY2IDI0NDAuMzAyIEwyOTE1LjY1MiAyNDQwLjQ0IEMyOTE4LjE3OCAyNDQwLjY3NiAyOTE5LjU5NyAyNDQzLjQ2MiAyOTE4LjMwMiAyNDQ1LjY0NCBMMjkxNy41NCAyNDQ2LjkyNyBDMjkxNy4yMTggMjQ0Ny40NyAyOTE2Ljc1MyAyNDQ3LjkxNCAyOTE2LjE5NyAyNDQ4LjIxMSBMMjc4Ny45OTkgMjUxNi42NTcgTDI2MjYuMzI0IDI2MDAuNjg5IEwyNzYyLjY4NyAyODA4LjQ5IEwyNTI1LjYyOSAyNjUwLjc1IEwyNDI4LjcyMSAyNjk3Ljk5MSBMMjI1Mi43NDIgMjc4MS4zNzcgTDIxMTAuMzczIDI4NDYuODU4IEwyMDE3LjM4NiAzMzI3LjI1NyBDMjY5Ny42IDMyNzMuNzYgMzI0MC4wMjIgMjczMC4xMzMgMzI5MS42MzcgMjA0OS4zOTEgWiBNMTE5OS44OTIgMjE4NC42NDEgTDExNDkuNjM5IDIyNDAuNTI4IEwxMDc3LjAxNSAyMzI0LjA2NCBMMTAxMC41ODkgMjQwMy40MDEgTDk1MS4zMTYgMjQ3Ny4wNzQgTDg5OC4wNjMgMjU0Ni4zMTQgTDg1MC40ODUgMjYxMS4yMTQgTDgwOS4wNTcgMjY3MC45MDggTDc3MS41ODEgMjcyNy40NzQgTDc2Ni41NzUgMjczNS40ODggQzg4OC4zNDYgMjkxMC4zNzUgMTA0OS4zMTYgMzA1NS45MjggMTIzNi43NTUgMzE1OS40MTkgTDEzMjUuMDk3IDMxMzAuNjczIEwxNDI0LjM4NCAzMDk2LjE5NSBMMTUzMi45MzggMzA1Ni4yNzIgTDE2NTAuMDk3IDMwMTEuMDIxIEwxNzIzLjI0NSAyOTgxLjUwOSBMMTYxNC4xOTUgMjQyOC40NzkgTDEwMTAuNTUzIDI4MzYuMzM0IEwxMDEwLjYzMyAyODM2LjI1NCBMMTAxMC41MzggMjgzNi4zMTkgTDE0MTcuNzAzIDIyMjkuMTM4IFogTTE0MzMuNTM5IDIyMzIuMzczIEwxMDY1LjE2IDI3ODEuNzE1IEwxMDY4LjcwNSAyNzc4LjE3MSBMMTU4MS45MjggMjI2NC44NDYgTDE1ODEuNTIyIDIyNjIuNzg2IEwxNTgxLjQ4NSAyMjYyLjU5NyBaIE0yMjIyLjY4OCAyMjY2LjU5OSBMMjE5NC40NjEgMjQxMi40MjcgTDI1MTguNTAyIDI2MjguMDQ1IEwyNTQxLjIwOSAyNjQzLjE1NCBMMjcwOC44NjkgMjc1NC43MTYgTDI3MDguMzk5IDI3NTQuMDExIEwyNTc5LjM4NCAyNjI0LjU0NSBMMjU2Mi4xNDEgMjYwNy4yNDEgWiBNMjE5MS4zODEgMjQyOC4zNCBMMjExNi43ODMgMjgxMy43NDIgTDIyNDEuNzU4IDI3NTcuNTgxIEwyNDE4LjIwMiAyNjc1Ljg1OCBMMjUwMi43NzQgMjYzNS41NDIgWiBNNjY1LjIwNCAyOTE5LjkxMSBMNjUyLjI3NCAyOTUwLjI0NiBMNjM5LjEzMyAyOTg1Ljc2MiBDNjM5LjExMiAyOTg1LjgyIDYzOS4wOTIgMjk4NS44NzggNjM5LjA3MyAyOTg1LjkzNyBMNjI5LjExNCAzMDE4LjAyOCBDNjI5LjA5MyAzMDE4LjA5NSA2MjkuMDc0IDMwMTguMTYyIDYyOS4wNTggMzAxOC4yMyBMNjIxLjgxOCAzMDQ3Ljc5OCBDNjIxLjggMzA0Ny44NzIgNjIxLjc4NSAzMDQ3Ljk0NiA2MjEuNzcyIDMwNDguMDIxIEw2MTYuOTMzIDMwNzUuNDkxIEM2MTYuOTE5IDMwNzUuNTcxIDYxNi45MDggMzA3NS42NTIgNjE2Ljg5OSAzMDc1LjczMyBMNjE0LjI1OSAzMTAxLjEzNCBDNjE0LjI1IDMxMDEuMjI1IDYxNC4yNDQgMzEwMS4zMTcgNjE0LjI0MiAzMTAxLjQwOSBMNjEzLjY5NCAzMTI0LjI5OSBDNjEzLjY5MiAzMTI0LjM5OSA2MTMuNjk0IDMxMjQuNSA2MTMuNyAzMTI0LjYwMSBMNjE1LjA0NiAzMTQ1Ljc1NSBDNjE1LjA1MiAzMTQ1Ljg2MiA2MTUuMDY0IDMxNDUuOTY4IDYxNS4wODEgMzE0Ni4wNzQgTDYxOC4xNzUgMzE2NS43MTMgQzYxOC4xOTMgMzE2NS44MjMgNjE4LjIxNSAzMTY1LjkzMyA2MTguMjQzIDMxNjYuMDQxIEw2MjIuOSAzMTg0LjAyMiBDNjIyLjkzOCAzMTg0LjE2NiA2MjIuOTg0IDMxODQuMzA3IDYyMy4wNCAzMTg0LjQ0NSBMNjI3LjMyOSAzMTk1LjExMyBDNjI3LjM5MyAzMTk1LjI3MSA2MjcuNDY4IDMxOTUuNDI0IDYyNy41NTUgMzE5NS41NzIgTDYzMi45NCAzMjA0Ljc1MiBDNjMzLjAyOSAzMjA0LjkwMyA2MzMuMTI5IDMyMDUuMDQ3IDYzMy4yMzkgMzIwNS4xODMgTDYzOS44OCAzMjEzLjM1MyBDNjM5Ljk5IDMyMTMuNDg3IDY0MC4xMDkgMzIxMy42MTMgNjQwLjIzNyAzMjEzLjczIEw2NDguNDI5IDMyMjEuMTc1IEM2NDguNTQ5IDMyMjEuMjg0IDY0OC42NzYgMzIyMS4zODQgNjQ4LjgxIDMyMjEuNDc1IEw2NTkuMzE3IDMyMjguNjIxIEM2NTkuNDM3IDMyMjguNzAzIDY1OS41NjEgMzIyOC43NzYgNjU5LjY5IDMyMjguODQyIEw2NzIuNDc0IDMyMzUuMzY0IEM2NzIuNTkyIDMyMzUuNDI1IDY3Mi43MTMgMzIzNS40NzggNjcyLjgzNyAzMjM1LjUyNCBMNjg4LjE3NyAzMjQxLjI0IEM2ODguMjg5IDMyNDEuMjgxIDY4OC40MDMgMzI0MS4zMTcgNjg4LjUxOSAzMjQxLjM0NyBMNzA2Ljk3NyAzMjQ2LjExNSBDNzA3LjA3NSAzMjQ2LjE0MSA3MDcuMTc0IDMyNDYuMTYxIDcwNy4yNzMgMzI0Ni4xNzggTDcyOS41MTEgMzI0OS44ODMgQzcyOS41OTcgMzI0OS44OTggNzI5LjY4NSAzMjQ5LjkwOSA3MjkuNzczIDMyNDkuOTE3IEw3NTUuNDc4IDMyNTIuMjAxIEM3NTUuNTU2IDMyNTIuMjA4IDc1NS42MzUgMzI1Mi4yMTIgNzU1LjcxNCAzMjUyLjIxNCBMNzg1LjI3MSAzMjUyLjgxNiBDNzg1LjMzOSAzMjUyLjgxOCA3ODUuNDA2IDMyNTIuODE3IDc4NS40NzQgMzI1Mi44MTQgTDgyMC44MSAzMjUxLjQ2MyBMODYwLjU0MyAzMjQ3LjkxMyBMOTA1Ljg1NiAzMjQxLjc2MiBMOTU3LjkyMSAzMjMyLjYxNyBMOTg0LjgyNyAzMjI2LjkwOCBDODY0LjQyNCAzMTQwLjAzMiA3NTYuNzY5IDMwMzYuNTg2IDY2NS4yMDQgMjkxOS45MTEgWiBNMTcyOS4zOTIgMzAxMi42ODMgTDE2NjEuOTIzIDMwNDAuNTkzIEwxNTQ0LjY5NiAzMDg3LjA1MiBMMTQzNS45NTggMzEyOC4xMjYgTDEzMzYuMzYyIDMxNjMuNjkxIEwxMjgwLjMyIDMxODIuNDcxIEMxNDM2LjA2OCAzMjYxLjM2OCAxNjA4LjY5MiAzMzExLjc3MyAxNzkxLjMzOSAzMzI2LjgzMyBaIE0xMjM5LjE5OCAzMTk2LjA2NCBMMTE2My43MzggMzIxOS40OTYgTDEwOTIuNDU5IDMyMzkuNzE2IEMxMzA1LjI0NyAzMzc0LjAzMiAxNTUzLjUwMyAzNDU3LjI2NSAxODIwLjAwMiAzNDcyLjE5NCBMMTc5Ny41NzUgMzM1OC40NTggQzE1OTYuODk4IDMzNDMuMTYyIDE0MDcuODg4IDMyODYuMTQ2IDEyMzkuMTk4IDMxOTYuMDY0IFoiIGNsYXNzPSJjbHMtMiIvPjxwYXRoIGQ9Ik0zMDAwLjc5NCAyMzY4Ljg5MyBDMzAxOS42ODQgMjM1Ni41MTIgMzAzNi41NTIgMjMwMi4zNDYgMzA0My43OTQgMjMwNC40NDQgQzMwNTEuMDM3IDIzMDYuNTQzIDMwMzYuMzM2IDIzNjEuMzM3IDMwNDUuNjgyIDIzODEuODk4IEMzMDQ2LjQ1MiAyMzgzLjU5MiAzMDQ2Ljc0MyAyMzg0LjYzNCAzMDQ3LjQ0OSAyMzg1LjkxNSBDMzA0OC4xNTQgMjM4Ny4xOTcgMzA0OC44NzkgMjM4OCAzMDQ5Ljg5OSAyMzg5LjU1NiBDMzA2Mi4yOCAyNDA4LjQ0NiAzMTE2LjQ0NiAyNDI1LjMxNCAzMTE0LjM0OCAyNDMyLjU1NiBDMzExMi4yNSAyNDM5Ljc5OSAzMDU3LjQ1NSAyNDI1LjA5OCAzMDM2Ljg5NCAyNDM0LjQ0NCBDMzAzNS4yIDI0MzUuMjE0IDMwMzQuMTU4IDI0MzUuNTA1IDMwMzIuODc3IDI0MzYuMjEgQzMwMzEuNTk1IDI0MzYuOTE2IDMwMzAuNzkyIDI0MzcuNjQxIDMwMjkuMjM2IDI0MzguNjYxIEMzMDEwLjM0NiAyNDUxLjA0MiAyOTkzLjQ3OCAyNTA1LjIwOCAyOTg2LjIzNiAyNTAzLjExIEMyOTc4Ljk5NCAyNTAxLjAxMSAyOTkzLjY5NCAyNDQ2LjIxNyAyOTg0LjM0OCAyNDI1LjY1NiBDMjk4My41NzkgMjQyMy45NjIgMjk4My4yODcgMjQyMi45MiAyOTgyLjU4MiAyNDIxLjYzOSBDMjk4MS44NzYgMjQyMC4zNTcgMjk4MS4xNTEgMjQxOS41NTQgMjk4MC4xMzEgMjQxNy45OTggQzI5NjcuNzUgMjM5OS4xMDggMjkxMy41ODQgMjM4Mi4yNCAyOTE1LjY4MiAyMzc0Ljk5OCBDMjkxNy43ODEgMjM2Ny43NTUgMjk3Mi41NzUgMjM4Mi40NTYgMjk5My4xMzYgMjM3My4xMSBDMjk5NC44MyAyMzcyLjM0IDI5OTUuODcyIDIzNzIuMDQ5IDI5OTcuMTUzIDIzNzEuMzQzIEMyOTk4LjQzNSAyMzcwLjYzOCAyOTk5LjIzOCAyMzY5LjkxMyAzMDAwLjc5NCAyMzY4Ljg5MyBaIiBjbGFzcz0iY2xzLTIiLz48L2c+PGc+PHBhdGggZD0iTTQ1NTUuNzg0IDk5My4zOTMgTDQ1NTUuNzg0IDk2MS41ODggTDQ2ODMuMDIgOTYxLjU4OCBMNDkzNC4wMjcgOTYxLjU4OCBMNTM0Ni40MDggOTYxLjU4OCBDNTU4Mi41OTEgOTYxLjU4OCA1OTk1LjExMSAxMDYwLjM5IDU5OTUuMTExIDE1MjUuNTk3IEM1OTk1LjExMSAxOTkwLjgwNSA1NTQxLjcyMiAyMDg0LjM0MiA1Mzc2LjMwMSAyMDg0LjM0MiBMNDkzNC4wMjcgMjA4NC4zNDIgTDQ5MzQuMDI3IDI5MTQuMTkyIEw0NjgzLjAyIDI5MTQuMTkyIEw0NjgzLjAyIDEyMzIuMjU3IEw0NjgzLjAyIDEyMTAuMDM4IEM0NjgxLjM1MSAxMTU0LjQ0OCA0NjY2LjE5NSAxMDEyLjQzIDQ1NTUuNzg0IDk5My4zOTMgWiBNNDkzNC4wMjcgMTA3My40MzUgTDQ5MzQuMDI3IDE5NzUuODA4IEw1MzE0LjkwMiAxOTc1LjgwOCBDNTUzNC40MjcgMTk3NS44MDggNTcyNi45NzYgMTgyNS44NjcgNTcyNi45NzYgMTUyNS41OTcgQzU3MjYuOTc2IDEyMjUuMzI4IDU1MzcuNjc3IDEwNzMuNDM1IDUzMjguODczIDEwNzMuNDM1IFoiIGNsYXNzPSJjbHMtMSIvPjxwYXRoIGQ9Ik02MTYyLjY4NyAxOTM3Ljk0NyBDNjE2Mi42ODcgMTQ3Mi41NzcgNjQ0MC44NTIgOTI1LjIxOCA3MTEwLjg2MyA5MjUuMjE4IEM3NzY3LjA4IDkyNS4yMTggODAyNy45NTIgMTUzNS4yODggODAyNy45NTIgMTkzNy45NDcgQzgwMjcuOTUyIDI0ODkuMDcyIDc2NzkuNzc3IDI5NjEuNDY1IDcxMTAuODYzIDI5NjEuNDY1IEM2NDY3LjA3NyAyOTYxLjQ2NSA2MTYyLjY4NyAyNDc2LjUwNiA2MTYyLjY4NyAxOTM3Ljk0NyBaIE02NDQ4LjY5NCAxOTMzLjczMSBDNjQ0OC42OTQgMjMyMC4yODUgNjU5NC44MDcgMjg1My45NjggNzExMC44NjMgMjg1My45NjggQzc2MTAuNDYgMjg1My45NjggNzczOC44MzYgMjI4MS40MTMgNzczOC44MzYgMTkzOS4xODMgQzc3MzguODM2IDE2NTEuOTU1IDc2MjYuNDg1IDEwMzguNzMyIDcwOTUuMzE5IDEwMzIuOTc1IEM2NTY5Ljk2NyAxMDI3LjI4MSA2NDQ4LjY5NCAxNjE4Ljg5NiA2NDQ4LjY5NCAxOTMzLjczMSBaIiBjbGFzcz0iY2xzLTEiLz48cGF0aCBkPSJNODE3MC44ODUgOTkyLjIxNyBMODE3MC44ODUgOTYxLjY0NSBMODI5Ny42NTEgOTYxLjY0NSBMODU0My40OTQgOTYxLjY0NSBMODU0OC42NTkgOTYxLjY0NSBMODU0OC42NTkgMjgwMi4wMDQgTDkwNTUuNDMxIDI4MDIuMDA0IEw5MTQ4LjUzIDI4MDIuMDA0IEM5MTgwLjQyOSAyODAxLjIwNSA5MjE0LjM5MiAyNzk5LjM2NCA5MjM5LjU3NiAyNzk1LjQ2NSBDOTMwMy40MjkgMjc4NS41NzggOTQxMC45NSAyNzU3Ljk3NiA5NDQ5LjI2MiAyNzIwLjQ4OCBMOTQ2OC42MjQgMjcyMC40ODggTDk0MjMuMDY1IDI5MTQuMjQ5IEw4NTQ4LjY1OSAyOTE0LjI0OSBMODI5Ny42NTEgMjkxNC4yNDkgTDgyOTcuNjUxIDI4MDIuMDA0IEw4Mjk3LjY1MSAxMjM5LjUyNiBDODI5Ny42NTEgMTIzOS41MTcgODI5Ny42NTEgMTIzOS41MDggODI5Ny42NTEgMTIzOS40OTggQzgyOTcuNjUxIDExMDMuNzMzIDgyNzkuNDMgMTA2OC45NDggODI0OC45NDUgMTAzNS41OCBDODIxOC40NiAxMDAyLjIxMSA4MTcwLjg4NSA5OTIuMjE3IDgxNzAuODg1IDk5Mi4yMTcgWiIgY2xhc3M9ImNscy0xIi8+PHBhdGggZD0iTTEwMzExLjQ2OSAxMTI4LjY5OSBMMTAzODIuMzk5IDk0MC4wMSBMMTA1MDMuNTI3IDk0MC4wMSBMMTExMDQuMjIyIDI1NzYuODIzIEwxMTEwNC4yMjQgMjU3Ni44MjkgQzExMjA1LjA2OSAyODUwLjc5IDExMzMwLjA1OCAyOTE0LjE5MiAxMTMzMC4wNTggMjkxNC4xOTIgTDExMjI4LjAzMyAyOTE0LjE5MiBMMTExNTkuODg5IDI5MTQuMTkyIEwxMDk2Ni43MjggMjkxNC4xOTIgTDEwNzM0LjkyIDIyODIuNTQ2IEw5OTk4Ljg1MSAyMjgyLjU0NiBMOTgyOC4zMzYgMjczNi4xNTIgQzk4MjguMjM4IDI3MzYuNDE0IDk4MjguMTQgMjczNi42NzYgOTgyOC4wNCAyNzM2LjkzNyBMOTgyOC4wNCAyNzM2LjkzOSBMOTgyNi43NzYgMjc0MC4zMDEgQzk3OTUuNjA5IDI4MjQuMTcyIDk3ODguODk2IDI5MTQuMTkyIDk3ODguODk2IDI5MTQuMTkyIEw5NzYxLjQwOCAyOTE0LjE5MiBMOTY0MC4yOCAyOTE0LjE5MiBMOTYyMC41OTEgMjkxNC4xOTIgQzk2MzUuMzk5IDI5MDcuMzcgOTY4Ny4zMDkgMjc4My4xNjggOTcyOS42MDcgMjY3Ni41NjYgWiBNMTAzNzEuMzA1IDEyOTEuNzQ2IEwxMDA0MS42MTkgMjE2OC43NzUgTDEwNjkzLjE2NyAyMTY4Ljc3NSBaIiBjbGFzcz0iY2xzLTEiLz48cGF0aCBkPSJNMTE0NjUuMzU2IDk5Mi43MjQgTDExNDY1LjM1NiA5NjMuNDggTDExNTk1LjA4NyA5NjMuNDggTDExNjAyLjE5NSA5NjMuNDggTDExNjkyLjIwOSA5NjMuNDggTDExNzMzLjI0OCA5NjMuNDggTDExODQ2LjA5NCA5NjMuNDggTDExOTM0LjA3OSA5NjMuNDggTDEyMjQ3LjkxNyA5NjMuNDggQzEyMzU0LjExMyA5NjMuNDggMTI4NTMuNDA3IDk4Mi4yNDIgMTI4NTMuNDA3IDE0OTEuMDk4IEMxMjg1My40MDcgMTc3MS45MDMgMTI2MzAuMjQ5IDE5NjUuMzc2IDEyMzc4LjkzIDE5OTEuNjQ0IEMxMjQyNS45OTUgMjAxNS4zMjMgMTI1MDkuNDA1IDIwNDkuNTQ4IDEyNjI1LjgzNCAyMzAyLjEwOSBDMTI3NDIuMjY0IDI1NTQuNjY5IDEyNzYzLjA4MSAyNTk1LjM0IDEyNzYzLjA4MSAyNTk1LjM0IEwxMjc2My4wODEgMjU5NS4zNDIgQzEyODg1LjQxNiAyODU0LjE5MyAxMzAyNi41MjUgMjkxNS45NjkgMTMwMjYuNTI1IDI5MTUuOTY5IEwxMjgxNi4wNjIgMjkxNS45NjkgTDEyNzU3Ljk0MiAyOTE2LjAwNiBDMTI2ODQuOTU0IDI5MTYuMDU0IDEyNjMxLjQ0OSAyODk3Ljg0OSAxMjU1Ni4zNjMgMjc0MSBDMTI0ODEuMjc4IDI1ODQuMTUyIDEyMzI5LjYxNiAyMjU2LjU0NiAxMjMyOS42MTYgMjI1Ni41NDYgQzEyMjU3LjE4NiAyMTAyLjI1MyAxMjE5NC4zNTIgMjAxOS45MzkgMTIwOTcuNzU0IDIwMTkuOTM5IEwxMTg0Ni4wOTQgMjAxOS45MzkgTDExODQ2LjA5NCAyOTE2LjA4NCBMMTE1OTUuMDg3IDI5MTYuMDg0IEwxMTU5NS4wODcgMTIzNC4yMDMgQzExNTk1LjA4NyAxMDI3LjQ5OSAxMTUwNi4wMDMgMTAwNC4yODkgMTE0NjUuMzU2IDk5Mi43MjQgWiBNMTE4NDYuMDk0IDEwNzYuNjg2IEwxMTg0Ni4wOTQgMTkwNi43MzIgTDEyMTgwLjk0NyAxOTA2LjczMiBDMTIyODYuNzcyIDE5MDYuNzMyIDEyNTkyLjg1OCAxODQyLjYyNyAxMjU5Mi44NTggMTQ5OC4zOTggQzEyNTkyLjg1OCAxMjU3LjY2NSAxMjQ2Ny42MTUgMTA3Ni42ODYgMTIyMDQuOTY3IDEwNzYuNjg2IEwxMjAyNS40NjggMTA3Ni42ODYgTDEyMDIwLjcwOSAxMDc2LjY4NiBaIiBjbGFzcz0iY2xzLTEiLz48cGF0aCBkPSJNMTMxMjAuNTg2IDk5Mi43MjQgTDEzMTIwLjU4NiA5NjMuNDggTDEzMjQzLjMyNSA5NjMuNDggTDEzMjU3LjQyNSA5NjMuNDggTDEzMzg4LjQ3OSA5NjMuNDggTDEzNDk0LjMzMiA5NjMuNDggTDEzNDk0LjMzMiAyOTE2LjA4NCBMMTMyNDMuMzI1IDI5MTYuMDg0IEwxMzI0My4zMjUgMTIyMC4xOSBDMTMyNDMuMzI1IDEwMDcuNzY4IDEzMTUyLjg3NSAxMDAyLjk3OSAxMzEyMC41ODYgOTkyLjcyNCBaIiBjbGFzcz0iY2xzLTEiLz48cGF0aCBkPSJNMTQ5ODkuNzM5IDEzNDAuOTI4IEwxNDk4OS43MzkgMTA5Ny41MDYgQzE0OTg5LjczOSAxMDk3LjUwNiAxNDgyNS45NDcgOTI1LjU5MSAxNDQ1Ny43MzMgOTI1LjU5MSBDMTQwODkuNTIgOTI1LjU5MSAxMzg0MC40MTcgMTEzNS4wNzIgMTM4NDAuNDE3IDE0MTguOTU0IEMxMzg0MC40MTcgMTcwMi44MzUgMTM5NDQuNjg2IDE4NTQuOTgzIDE0MzU1Ljg3IDIwMTYuNjM0IEMxNDc4My45NTIgMjE4NC45MjkgMTQ4NDYuNzc4IDIyOTguODA1IDE0ODQ2Ljc3OCAyNDg1LjQ1MSBDMTQ4NDYuNzc4IDI2NzIuMDk3IDE0NzE5LjIzIDI4NDguNzIzIDE0NDEzLjU1MSAyODQ4LjcyMyBDMTQxMDcuODczIDI4NDguNzIzIDEzOTQxLjA1MyAyNjc0LjQ1MSAxMzg0MC40MTcgMjUyMi4yNjkgTDEzODE5LjEwOSAyNTIyLjI2OSBMMTM4MTkuMTA5IDI3NjQuNjY4IEMxMzgxOS4xMDkgMjc2NC42NjggMTQwNjUuODI0IDI5NTguMjkzIDE0NDEzLjU1MSAyOTU4LjI5MyBDMTQ3NjEuMjc5IDI5NTguMjkzIDE1MDkyLjQ4NCAyNzgzLjg4NiAxNTA5Mi40ODQgMjQyMi4yMDkgQzE1MDkyLjQ4NCAyMDYwLjUzMSAxNDg5NC41MTEgMTkzNy4yODYgMTQ1NTEuOTUxIDE3OTcuMTQ4IEMxNDIwOS4zOTIgMTY1Ny4wMSAxNDA3My43MDIgMTU3Ny4yMjcgMTQwNzMuNzAyIDEzNjcuODM2IEMxNDA3My43MDIgMTE1OC40NDYgMTQyMzQuMjE5IDEwMjkuNzI1IDE0NDU3LjczMyAxMDI5LjcyNSBDMTQ2ODEuMjQ4IDEwMjkuNzI1IDE0ODc4Ljk0IDExNzEuNjU3IDE0OTU2Ljc5NSAxMzQwLjkyOCBaIiBjbGFzcz0iY2xzLTEiLz48L2c+PC9nPjwvZz48L3N2Zz4=" alt="Polaris"><span>Mail</span></h1><nav class="tabs" aria-label="Sections"><a href="#mail" data-tab="mail">Mail</a><a href="#live" data-tab="live">Live <span class="lv-n" id="lvCount" hidden></span></a></nav><span class="who" id="who"></span><div class="thm" role="group" aria-label="Appearance"><button data-thm="light" title="Light" aria-label="Light"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button><button data-thm="auto" title="Match system" aria-label="Match system"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></button><button data-thm="dark" title="Dark" aria-label="Dark"><svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg></button></div></header>
<!--DENIED-->
<main id="app">
<section>
 <h2 id="formTitle">New message</h2>
 <label for="to">To</label>
 <div class="radio" id="to"><label><input type="radio" name="to" value="all" checked> All pilots</label><label><input type="radio" name="to" value="one"> One pilot</label></div>
 <div id="toOne" class="to-one" hidden><div class="row"><div><label for="toCs">Callsign</label><input type="text" id="toCs" maxlength="10" placeholder="PAW806" autocomplete="off" spellcheck="false"></div><div><label for="toCid">VATSIM CID</label><input type="text" id="toCid" maxlength="9" inputmode="numeric" placeholder="1234567" autocomplete="off"></div></div><input type="hidden" id="toName">
 <p class="hint" id="toHint">Shown only on the EFB whose flight plan has this callsign (for 24 hours after it goes out) or whose VATSIM CID in Settings matches. Pick a flight on the Live tab to fill this in.</p></div>
 <div class="row"><div><label for="from">From</label><input type="text" id="from" list="froms" maxlength="60" value="Crew Management"><datalist id="froms"><option>Crew Management</option><option>Flight Operations</option><option>Training</option><option>Polaris News</option><option>Fleet</option></datalist></div>
 <div><label for="when">Send</label><select id="when"><option value="now">Now</option><option value="later">At a set time</option></select></div></div>
 <div id="atRow" hidden><label for="at">Send at (your local time)</label><input type="datetime-local" id="at"></div>
 <label for="subject">Subject</label><input type="text" id="subject" maxlength="160">
 <label for="body">Message</label><textarea id="body" maxlength="20000" placeholder="Dear Polaris pilots,&#10;&#10;**Bold**, *italic*, a line starting with - for a list, ## for a heading, links as [text](https://\u2026)."></textarea>
 <label>Preview</label><div class="preview" id="preview"><span class="empty">The message as pilots will see it.</span></div>
 <label for="file">Attachments <span class="hint" style="margin:0">PDF, PNG, JPG, WebP or text \xB7 up to 5 files, 5 MB each</span></label>
 <input type="file" id="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,text/plain"><ul class="atts" id="atts"></ul>
 <div class="actions"><button class="primary" id="send">Send to all pilots</button><button id="cancel" hidden>Cancel editing</button></div>
 <div id="msg"></div>
 <p class="hint">Until pilot sign-in comes, the Mail app is open to anyone who opens the EFB, and a message to one pilot can be read by anyone who asks with that callsign or CID: don't put anything private in a message.</p>
</section>
<section><h2>Sent and scheduled</h2><div id="list"><span class="empty">Loading\u2026</span></div></section>
</main>
<main id="live" hidden>
<div class="lv-stage"><canvas id="lvGlobe" aria-label="Globe with Polaris flights"></canvas><div class="lv-src" id="lvSrc"></div><div class="lv-ctl"><button data-lv="in" aria-label="Zoom in">+</button><button data-lv="out" aria-label="Zoom out">\u2212</button><button data-lv="all" aria-label="Whole globe" title="Whole globe"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg></button></div></div>
<aside class="lv-side"><div class="lv-sum" id="lvSum"></div><div class="lv-list" id="lvList"></div><div class="lv-det" id="lvDet" hidden></div></aside>
</main>
<script>
const $=s=>document.querySelector(s),esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* the same light markup the EFB renders */
function md(t){const L=esc(t).split("\\n"),out=[];let ul=false,para=[];const inl=s=>s.replace(/\\*\\*(.+?)\\*\\*/g,"<b>$1</b>").replace(/(^|[^*])\\*(?!\\s)(.+?)\\*/g,"$1<i>$2</i>").replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
 const flush=()=>{if(para.length){out.push("<p>"+para.map(inl).join("<br>")+"</p>");para=[]}};
 for(const l of L){if(/^\\s*[-\u2022]\\s+/.test(l)){flush();if(!ul){out.push("<ul>");ul=true}out.push("<li>"+inl(l.replace(/^\\s*[-\u2022]\\s+/,""))+"</li>");continue}if(ul){out.push("</ul>");ul=false}
  if(/^##\\s+/.test(l)){flush();out.push("<h4>"+inl(l.replace(/^##\\s+/,""))+"</h4>")}else if(!l.trim())flush();else para.push(l)}
 flush();if(ul)out.push("</ul>");return out.join("")}
function thmUi(){let t="auto";try{t=localStorage.getItem("pmTheme")||"auto"}catch(e){}document.querySelectorAll("[data-thm]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.thm===t)))}
document.addEventListener("click",e=>{const b=e.target.closest("[data-thm]");if(!b)return;const t=b.dataset.thm;try{t==="auto"?localStorage.removeItem("pmTheme"):localStorage.setItem("pmTheme",t)}catch(x){}if(t==="auto")delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t;thmUi()});
thmUi();
let S={mails:[],edit:null,keep:[],add:[]};
const api=async(path,opt)=>{const r=await fetch(path,{credentials:"same-origin",...(opt||{})});let j=null;try{j=await r.json()}catch(e){}if(!r.ok)throw new Error((j&&j.error)||("HTTP "+r.status));return j};
const say=(t,ok)=>{$("#msg").innerHTML=t?'<div class="msg '+(ok?"ok":"err")+'">'+esc(t)+"</div>":""};
const fmt=ms=>new Date(ms).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})+" \xB7 "+new Date(ms).toISOString().slice(11,16)+"Z";
const kb=n=>n>1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";
function attsUi(){const old=S.edit?(S.mails.find(m=>m.id===S.edit)||{}).att||[]:[];
 $("#atts").innerHTML=old.filter(a=>S.keep.includes(a.n)).map(a=>'<li>\u{1F4CE} '+esc(a.name)+' <span class="hint" style="margin:0">'+kb(a.size)+'</span><button data-rmk="'+a.n+'">Remove</button></li>').join("")+S.add.map((f,i)=>'<li>\u{1F4CE} '+esc(f.name)+' <span class="hint" style="margin:0">'+kb(f.size)+' \xB7 new</span><button data-rma="'+i+'">Remove</button></li>').join("")}
/* recipient: all pilots, or one pilot by callsign and/or VATSIM CID */
const toMode=()=>(document.querySelector("input[name=to]:checked")||{}).value||"all";
function toGet(){if(toMode()!=="one")return null;return {cs:$("#toCs").value.toUpperCase().replace(/[^A-Z0-9]/g,""),cid:$("#toCid").value.replace(/[^0-9]/g,""),name:$("#toName").value}}
const toLabel=t=>t?(t.cs||"")+(t.cs&&t.cid?" \xB7 ":"")+(t.cid?"CID "+t.cid:""):"all pilots";
function toUi(){const one=toMode()==="one",t=toGet();$("#toOne").hidden=!one;if(!S.edit)$("#send").textContent=one?"Send to "+(t&&(t.cs||t.cid)?(t.cs||"CID "+t.cid):"this pilot"):"Send to all pilots";preview()}
function toSet(t){document.querySelector("input[name=to][value="+(t?"one":"all")+"]").checked=true;$("#toCs").value=(t&&t.cs)||"";$("#toCid").value=(t&&t.cid)||"";$("#toName").value=(t&&t.name)||"";toUi()}
/* the Live tab's "Message" button */
window.pmCompose=function(t){if(S.edit)reset();toSet(t);if($("#from").value==="Crew Management")$("#from").value="Flight Operations";say("");location.hash="#mail";setTimeout(()=>{scrollTo({top:0});$("#subject").focus()},60)};
function preview(){const b=$("#body").value,t=toGet();$("#preview").innerHTML=b.trim()?"<h4 style='margin-top:0'>"+esc($("#subject").value||"(no subject)")+"</h4><div class='hint' style='margin:-2px 0 10px'>From "+esc($("#from").value||"\u2026")+" \xB7 "+(t?"To "+esc(toLabel(t))+(t.name?" ("+esc(t.name)+")":""):"To all Polaris pilots")+"</div>"+md(b):'<span class="empty">The message as pilots will see it.</span>'}
function listUi(){const now=Date.now();$("#list").innerHTML=S.mails.length?S.mails.map(m=>{const q=m.sendAt>now;return '<div class="mail"><div><b>'+esc(m.subject)+'</b><span class="tag '+(q?"q":"s")+'">'+(q?"SCHEDULED":"SENT")+'</span>'+(m.to?'<span class="tag d" title="'+esc(m.to.name||"")+'">TO '+esc(m.to.cs||("CID "+m.to.cid))+'</span>':'')+'</div><div class="meta">'+esc(m.from)+" \xB7 "+(q?"goes out ":"")+fmt(m.sendAt)+(m.att.length?" \xB7 \u{1F4CE} "+m.att.length:"")+(m.by?" \xB7 by "+esc(m.by):"")+(m.edited?" \xB7 edited":"")+'</div><div class="btns"><button data-edit="'+m.id+'">Edit</button><button class="warn" data-del="'+m.id+'">Delete</button></div></div>'}).join(""):'<span class="empty">No mail yet.</span>'}
async function load(){try{const j=await api("/admin/api/mail");S.mails=j.mails;listUi()}catch(e){$("#list").innerHTML='<div class="msg err">'+esc(e.message)+"</div>"}}
function reset(){S.edit=null;S.keep=[];S.add=[];$("#formTitle").textContent="New message";$("#send").textContent="Send to all pilots";$("#cancel").hidden=true;["subject","body"].forEach(i=>$("#"+i).value="");$("#from").value="Crew Management";$("#when").value="now";$("#atRow").hidden=true;$("#file").value="";attsUi();toSet(null)}
const localInput=ms=>{const d=new Date(ms-new Date(ms).getTimezoneOffset()*60000);return d.toISOString().slice(0,16)};
document.addEventListener("click",async e=>{const t=e.target.closest("button");if(!t)return;
 if(t.dataset.rmk!=null){S.keep=S.keep.filter(n=>n!==+t.dataset.rmk);attsUi()}
 else if(t.dataset.rma!=null){S.add.splice(+t.dataset.rma,1);attsUi()}
 else if(t.dataset.edit){const m=S.mails.find(x=>x.id===t.dataset.edit);if(!m)return;S.edit=m.id;S.keep=m.att.map(a=>a.n);S.add=[];toSet(m.to||null);$("#from").value=m.from;$("#subject").value=m.subject;$("#body").value=m.body;
  const q=m.sendAt>Date.now();$("#when").value=q?"later":"now";$("#atRow").hidden=!q;if(q)$("#at").value=localInput(m.sendAt);$("#formTitle").textContent="Edit message";$("#send").textContent=q?"Save changes":"Save changes (already sent)";$("#cancel").hidden=false;attsUi();preview();say("");scrollTo({top:0,behavior:"smooth"})}
 else if(t.dataset.del){const m=S.mails.find(x=>x.id===t.dataset.del);if(!m||!confirm('Delete "'+m.subject+'"? Pilots will no longer see it.'))return;try{await api("/admin/api/mail?id="+encodeURIComponent(m.id),{method:"DELETE"});if(S.edit===m.id)reset();say("Deleted.",true);load()}catch(er){say(er.message)}}
 else if(t.id==="cancel"){reset();say("")}
 else if(t.id==="send"){const to=toGet();if(to&&!to.cs&&!to.cid){say("Add the pilot's callsign or VATSIM CID.");return}const body={id:S.edit||undefined,to,from:$("#from").value,subject:$("#subject").value,body:$("#body").value,keepAtt:S.keep,newAtt:S.add.map(f=>({name:f.name,type:f.type,data:f.data}))};
  if($("#when").value==="later"){if(!$("#at").value){say("Pick when it goes out.");return}body.sendAt=new Date($("#at").value).toISOString()}
  t.disabled=true;try{await api("/admin/api/mail",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const was=S.edit,later=body.sendAt&&Date.parse(body.sendAt)>Date.now();reset();say(was?"Saved.":later?"Scheduled.":"Sent to "+toLabel(to)+".",true);load()}catch(er){say(er.message)}finally{t.disabled=false}}});
$("#when").addEventListener("change",()=>{$("#atRow").hidden=$("#when").value!=="later"});
["subject","body","from"].forEach(i=>$("#"+i).addEventListener("input",preview));
document.querySelectorAll("input[name=to]").forEach(x=>x.addEventListener("change",toUi));["toCs","toCid"].forEach(i=>$("#"+i).addEventListener("input",()=>{$("#toName").value="";toUi()}));
$("#file").addEventListener("change",async e=>{for(const f of e.target.files){if(f.size>5242880){say(f.name+" is larger than 5 MB.");continue}
 const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=rej;r.readAsDataURL(f)});S.add.push({name:f.name,type:f.type||"application/octet-stream",size:f.size,data})}e.target.value="";attsUi()});
if(!document.querySelector(".deny")){api("/admin/api/me").then(j=>{$("#who").textContent="Signed in as "+j.email}).catch(()=>{});load();preview()}else $("#app").hidden=true;
<\/script>
<script src="/admin/live.js" defer><\/script></body></html>`;

// src/live-bundle.js
var LIVE_JS = '/* Polaris Mail admin, Live tab. Includes d3-geo:\n * Copyright 2010-2026 Mike Bostock\n * \n * Permission to use, copy, modify, and/or distribute this software for any purpose\n * with or without fee is hereby granted, provided that the above copyright notice\n * and this permission notice appear in all copies.\n * \n * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH\n * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND\n * FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,\n * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS\n * OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER\n * TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF\n * THIS SOFTWARE.\n * \n * This license applies to GeographicLib, versions 1.12 and later.\n * \n * Copyright 2008-2012 Charles Karney\n * \n * Permission is hereby granted, free of charge, to any person obtaining a copy of\n * this software and associated documentation files (the "Software"), to deal in\n * the Software without restriction, including without limitation the rights to\n * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of\n * the Software, and to permit persons to whom the Software is furnished to do so,\n * subject to the following conditions:\n * \n * The above copyright notice and this permission notice shall be included in all\n * copies or substantial portions of the Software.\n * \n * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS\n * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE AUTHORS OR\n * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER\n * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN\n * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n */\n(()=>{var Vt=Object.defineProperty;var Kt=(t,n,e)=>n in t?Vt(t,n,{enumerable:!0,configurable:!0,writable:!0,value:e}):t[n]=e;var q=(t,n,e)=>Kt(t,typeof n!="symbol"?n+"":n,e);function B1(t,n){return t==null||n==null?NaN:t<n?-1:t>n?1:t>=n?0:NaN}function Zt(t,n){return t==null||n==null?NaN:n<t?-1:n>t?1:n>=t?0:NaN}function Wn(t){let n,e,r;t.length!==2?(n=B1,e=(s,h)=>B1(t(s),h),r=(s,h)=>t(s)-h):(n=t===B1||t===Zt?t:_t,e=t,r=t);function i(s,h,l=0,u=s.length){if(l<u){if(n(h,h)!==0)return u;do{let c=l+u>>>1;e(s[c],h)<0?l=c+1:u=c}while(l<u)}return l}function o(s,h,l=0,u=s.length){if(l<u){if(n(h,h)!==0)return u;do{let c=l+u>>>1;e(s[c],h)<=0?l=c+1:u=c}while(l<u)}return l}function a(s,h,l=0,u=s.length){let c=i(s,h,l,u-1);return c>l&&r(s[c-1],h)>-r(s[c],h)?c-1:c}return{left:i,center:a,right:o}}function _t(){return 0}function Jt(t){return t===null?NaN:+t}var Gn=Wn(B1),wi=Gn.right,Mi=Gn.left,yi=Wn(Jt).center;var Si=Hn(Xn),bi=Hn(Qt);function Hn(t){return function(n,e,r=e){if(!((e=+e)>=0))throw new RangeError("invalid rx");if(!((r=+r)>=0))throw new RangeError("invalid ry");let{data:i,width:o,height:a}=n;if(!((o=Math.floor(o))>=0))throw new RangeError("invalid width");if(!((a=Math.floor(a!==void 0?a:i.length/o))>=0))throw new RangeError("invalid height");if(!o||!a||!e&&!r)return n;let s=e&&t(e),h=r&&t(r),l=i.slice();return s&&h?(m1(s,l,i,o,a),m1(s,i,l,o,a),m1(s,l,i,o,a),v1(h,i,l,o,a),v1(h,l,i,o,a),v1(h,i,l,o,a)):s?(m1(s,i,l,o,a),m1(s,l,i,o,a),m1(s,i,l,o,a)):h&&(v1(h,i,l,o,a),v1(h,l,i,o,a),v1(h,i,l,o,a)),n}}function m1(t,n,e,r,i){for(let o=0,a=r*i;o<a;)t(n,e,o,o+=r,1)}function v1(t,n,e,r,i){for(let o=0,a=r*i;o<r;++o)t(n,e,o,o+a,r)}function Qt(t){let n=Xn(t);return(e,r,i,o,a)=>{i<<=2,o<<=2,a<<=2,n(e,r,i+0,o+0,a),n(e,r,i+1,o+1,a),n(e,r,i+2,o+2,a),n(e,r,i+3,o+3,a)}}function Xn(t){let n=Math.floor(t);if(n===t)return ne(t);let e=t-n,r=2*t+1;return(i,o,a,s,h)=>{if(!((s-=h)>=a))return;let l=n*o[a],u=h*n,c=u+h;for(let f=a,m=a+u;f<m;f+=h)l+=o[Math.min(s,f)];for(let f=a,m=s;f<=m;f+=h)l+=o[Math.min(s,f+u)],i[f]=(l+e*(o[Math.max(a,f-c)]+o[Math.min(s,f+c)]))/r,l-=o[Math.max(a,f-u)]}}function ne(t){let n=2*t+1;return(e,r,i,o,a)=>{if(!((o-=a)>=i))return;let s=t*r[i],h=a*t;for(let l=i,u=i+h;l<u;l+=a)s+=r[Math.min(o,l)];for(let l=i,u=o;l<=u;l+=a)s+=r[Math.min(o,l+h)],e[l]=s/n,s-=r[Math.max(i,l-h)]}}var K=class{constructor(){this._partials=new Float64Array(32),this._n=0}add(n){let e=this._partials,r=0;for(let i=0;i<this._n&&i<32;i++){let o=e[i],a=n+o,s=Math.abs(n)<Math.abs(o)?n-(a-o):o-(a-n);s&&(e[r++]=s),n=a}return e[r]=n,this._n=r+1,this}valueOf(){let n=this._partials,e=this._n,r,i,o,a=0;if(e>0){for(a=n[--e];e>0&&(r=a,i=n[--e],a=r+i,o=i-(a-r),!o););e>0&&(o<0&&n[e-1]<0||o>0&&n[e-1]>0)&&(i=o*2,r=a+i,i==r-a&&(a=r))}return a}};var te=Array.prototype,Ei=te.slice;var Li=Math.sqrt(50),xi=Math.sqrt(10),Pi=Math.sqrt(2);function*ee(t){for(let n of t)yield*n}function hn(t){return Array.from(ee(t))}function f1(t,n,e){t=+t,n=+n,e=(i=arguments.length)<2?(n=t,t=0,1):i<3?1:+e;for(var r=-1,i=Math.max(0,Math.ceil((n-t)/e))|0,o=new Array(i);++r<i;)o[r]=t+r*e;return o}var Ai=ie(Math.random);function ie(t){return function(e,r=0,i=e.length){let o=i-(r=+r);for(;o;){let a=t()*o--|0,s=e[o+r];e[o+r]=e[a+r],e[a+r]=s}return e}}var k=1e-6,gt=1e-12,N=Math.PI,Y=N/2,Yn=N/4,t1=N*2,Z=180/N,B=N/180,C=Math.abs,C1=Math.atan,u1=Math.atan2,T=Math.cos,j1=Math.ceil,pt=Math.exp;var mt=Math.log;var A=Math.sin,re=Math.sign||function(t){return t>0?1:t<0?-1:0},_=Math.sqrt,vt=Math.tan;function wt(t){return t>1?0:t<-1?N:Math.acos(t)}function i1(t){return t>1?Y:t<-1?-Y:Math.asin(t)}function Un(t){return(t=A(t/2))*t}function W(){}function K1(t,n){t&&Kn.hasOwnProperty(t.type)&&Kn[t.type](t,n)}var Vn={Feature:function(t,n){K1(t.geometry,n)},FeatureCollection:function(t,n){for(var e=t.features,r=-1,i=e.length;++r<i;)K1(e[r].geometry,n)}},Kn={Sphere:function(t,n){n.sphere()},Point:function(t,n){t=t.coordinates,n.point(t[0],t[1],t[2])},MultiPoint:function(t,n){for(var e=t.coordinates,r=-1,i=e.length;++r<i;)t=e[r],n.point(t[0],t[1],t[2])},LineString:function(t,n){vn(t.coordinates,n,0)},MultiLineString:function(t,n){for(var e=t.coordinates,r=-1,i=e.length;++r<i;)vn(e[r],n,0)},Polygon:function(t,n){Zn(t.coordinates,n)},MultiPolygon:function(t,n){for(var e=t.coordinates,r=-1,i=e.length;++r<i;)Zn(e[r],n)},GeometryCollection:function(t,n){for(var e=t.geometries,r=-1,i=e.length;++r<i;)K1(e[r],n)}};function vn(t,n,e){var r=-1,i=t.length-e,o;for(n.lineStart();++r<i;)o=t[r],n.point(o[0],o[1],o[2]);n.lineEnd()}function Zn(t,n){var e=-1,r=t.length;for(n.polygonStart();++e<r;)vn(t[e],n,1);n.polygonEnd()}function h1(t,n){t&&Vn.hasOwnProperty(t.type)?Vn[t.type](t,n):K1(t,n)}var zi=new K,Ti=new K;function wn(t){return[u1(t[1],t[0]),i1(t[2])]}function M1(t){var n=t[0],e=t[1],r=T(e);return[r*T(n),r*A(n),A(e)]}function W1(t,n){return t[0]*n[0]+t[1]*n[1]+t[2]*n[2]}function Z1(t,n){return[t[1]*n[2]-t[2]*n[1],t[2]*n[0]-t[0]*n[2],t[0]*n[1]-t[1]*n[0]]}function dn(t,n){t[0]+=n[0],t[1]+=n[1],t[2]+=n[2]}function G1(t,n){return[t[0]*n,t[1]*n,t[2]*n]}function Mn(t){var n=_(t[0]*t[0]+t[1]*t[1]+t[2]*t[2]);t[0]/=n,t[1]/=n,t[2]/=n}function yn(t,n){function e(r,i){return r=t(r,i),n(r[0],r[1])}return t.invert&&n.invert&&(e.invert=function(r,i){return r=n.invert(r,i),r&&t.invert(r[0],r[1])}),e}function Sn(t,n){return C(t)>N&&(t-=Math.round(t/t1)*t1),[t,n]}Sn.invert=Sn;function oe(t,n,e){return(t%=t1)?n||e?yn(Jn(t),Qn(n,e)):Jn(t):n||e?Qn(n,e):Sn}function _n(t){return function(n,e){return n+=t,C(n)>N&&(n-=Math.round(n/t1)*t1),[n,e]}}function Jn(t){var n=_n(t);return n.invert=_n(-t),n}function Qn(t,n){var e=T(t),r=A(t),i=T(n),o=A(n);function a(s,h){var l=T(h),u=T(s)*l,c=A(s)*l,f=A(h),m=f*e+u*r;return[u1(c*i-m*o,u*e-f*r),i1(m*i+c*o)]}return a.invert=function(s,h){var l=T(h),u=T(s)*l,c=A(s)*l,f=A(h),m=f*i-c*o;return[u1(c*i+f*o,u*e+m*r),i1(m*e-u*r)]},a}function se(t,n,e,r,i,o){if(e){var a=T(n),s=A(n),h=r*e;i==null?(i=n+r*t1,o=n-h/2):(i=nt(a,i),o=nt(a,o),(r>0?i<o:i>o)&&(i+=r*t1));for(var l,u=i;r>0?u>o:u<o;u-=h)l=wn([a,-s*T(u),-s*A(u)]),t.point(l[0],l[1])}}function nt(t,n){n=M1(n),n[0]-=t,Mn(n);var e=wt(-n[1]);return((-n[2]<0?-e:e)+t1-k)%t1}function Mt(){var t=[],n;return{point:function(e,r,i){n.push([e,r,i])},lineStart:function(){t.push(n=[])},lineEnd:W,rejoin:function(){t.length>1&&t.push(t.pop().concat(t.shift()))},result:function(){var e=t;return t=[],n=null,e}}}function Y1(t,n){return C(t[0]-n[0])<k&&C(t[1]-n[1])<k}function H1(t,n,e,r){this.x=t,this.z=n,this.o=e,this.e=r,this.v=!1,this.n=this.p=null}function yt(t,n,e,r,i){var o=[],a=[],s,h;if(t.forEach(function(p){if(!((b=p.length-1)<=0)){var b,g=p[0],M=p[b],v;if(Y1(g,M)){if(!g[2]&&!M[2]){for(i.lineStart(),s=0;s<b;++s)i.point((g=p[s])[0],g[1]);i.lineEnd();return}M[0]+=2*k}o.push(v=new H1(g,p,null,!0)),a.push(v.o=new H1(g,null,v,!1)),o.push(v=new H1(M,p,null,!1)),a.push(v.o=new H1(M,null,v,!0))}}),!!o.length){for(a.sort(n),tt(o),tt(a),s=0,h=a.length;s<h;++s)a[s].e=e=!e;for(var l=o[0],u,c;;){for(var f=l,m=!0;f.v;)if((f=f.n)===l)return;u=f.z,i.lineStart();do{if(f.v=f.o.v=!0,f.e){if(m)for(s=0,h=u.length;s<h;++s)i.point((c=u[s])[0],c[1]);else r(f.x,f.n.x,1,i);f=f.n}else{if(m)for(u=f.p.z,s=u.length-1;s>=0;--s)i.point((c=u[s])[0],c[1]);else r(f.x,f.p.x,-1,i);f=f.p}f=f.o,u=f.z,m=!m}while(!f.v);i.lineEnd()}}}function tt(t){if(n=t.length){for(var n,e=0,r=t[0],i;++e<n;)r.n=i=t[e],i.p=r,r=i;r.n=i=t[0],i.p=r}}function gn(t){return C(t[0])<=N?t[0]:re(t[0])*((C(t[0])+N)%t1-N)}function ae(t,n){var e=gn(n),r=n[1],i=A(r),o=[A(e),-T(e),0],a=0,s=0,h=new K;i===1?r=Y+k:i===-1&&(r=-Y-k);for(var l=0,u=t.length;l<u;++l)if(f=(c=t[l]).length)for(var c,f,m=c[f-1],p=gn(m),b=m[1]/2+Yn,g=A(b),M=T(b),v=0;v<f;++v,p=y,g=x,M=I,m=d){var d=c[v],y=gn(d),E=d[1]/2+Yn,x=A(E),I=T(E),R=y-p,L=R>=0?1:-1,$=L*R,P=$>N,j=g*x;if(h.add(u1(j*L*A($),M*I+j*T($))),a+=P?R+L*t1:R,P^p>=e^y>=e){var O=Z1(M1(m),M1(d));Mn(O);var F=Z1(o,O);Mn(F);var w=(P^R>=0?-1:1)*i1(F[2]);(r>w||r===w&&(O[0]||O[1]))&&(s+=P^R>=0?1:-1)}}return(a<-k||a<k&&h<-gt)^s&1}function St(t,n,e,r){return function(i){var o=n(i),a=Mt(),s=n(a),h=!1,l,u,c,f={point:m,lineStart:b,lineEnd:g,polygonStart:function(){f.point=M,f.lineStart=v,f.lineEnd=d,u=[],l=[]},polygonEnd:function(){f.point=m,f.lineStart=b,f.lineEnd=g,u=hn(u);var y=ae(l,r);u.length?(h||(i.polygonStart(),h=!0),yt(u,ue,y,e,i)):y&&(h||(i.polygonStart(),h=!0),i.lineStart(),e(null,null,1,i),i.lineEnd()),h&&(i.polygonEnd(),h=!1),u=l=null},sphere:function(){i.polygonStart(),i.lineStart(),e(null,null,1,i),i.lineEnd(),i.polygonEnd()}};function m(y,E){t(y,E)&&i.point(y,E)}function p(y,E){o.point(y,E)}function b(){f.point=p,o.lineStart()}function g(){f.point=m,o.lineEnd()}function M(y,E){c.push([y,E]),s.point(y,E)}function v(){s.lineStart(),c=[]}function d(){M(c[0][0],c[0][1]),s.lineEnd();var y=s.clean(),E=a.result(),x,I=E.length,R,L,$;if(c.pop(),l.push(c),c=null,!!I){if(y&1){if(L=E[0],(R=L.length-1)>0){for(h||(i.polygonStart(),h=!0),i.lineStart(),x=0;x<R;++x)i.point(($=L[x])[0],$[1]);i.lineEnd()}return}I>1&&y&2&&E.push(E.pop().concat(E.shift())),u.push(E.filter(le))}}return f}}function le(t){return t.length>1}function ue(t,n){return((t=t.x)[0]<0?t[1]-Y-k:Y-t[1])-((n=n.x)[0]<0?n[1]-Y-k:Y-n[1])}var et=St(function(){return!0},ce,he,[-N,-Y]);function ce(t){var n=NaN,e=NaN,r=NaN,i;return{lineStart:function(){t.lineStart(),i=1},point:function(o,a){var s=o>0?N:-N,h=C(o-n);C(h-N)<k?(t.point(n,e=(e+a)/2>0?Y:-Y),t.point(r,e),t.lineEnd(),t.lineStart(),t.point(s,e),t.point(o,e),i=0):r!==s&&h>=N&&(C(n-r)<k&&(n-=r*k),C(o-s)<k&&(o-=s*k),e=fe(n,e,o,a),t.point(r,e),t.lineEnd(),t.lineStart(),t.point(s,e),i=0),t.point(n=o,e=a),r=s},lineEnd:function(){t.lineEnd(),n=e=NaN},clean:function(){return 2-i}}}function fe(t,n,e,r){var i,o,a=A(t-e);return C(a)>k?C1((A(n)*(o=T(r))*A(e)-A(r)*(i=T(n))*A(t))/(i*o*a)):(n+r)/2}function he(t,n,e,r){var i;if(t==null)i=e*Y,r.point(-N,i),r.point(0,i),r.point(N,i),r.point(N,0),r.point(N,-i),r.point(0,-i),r.point(-N,-i),r.point(-N,0),r.point(-N,i);else if(C(t[0]-n[0])>k){var o=t[0]<n[0]?N:-N;i=e*o/2,r.point(-o,i),r.point(0,i),r.point(o,i)}else r.point(n[0],n[1])}function de(t){var n=T(t),e=2*B,r=n>0,i=C(n)>k;function o(u,c,f,m){se(m,t,e,f,u,c)}function a(u,c){return T(u)*T(c)>n}function s(u){var c,f,m,p,b;return{lineStart:function(){p=m=!1,b=1},point:function(g,M){var v=[g,M],d,y=a(g,M),E=r?y?0:l(g,M):y?l(g+(g<0?N:-N),M):0;if(!c&&(p=m=y)&&u.lineStart(),y!==m&&(d=h(c,v),(!d||Y1(c,d)||Y1(v,d))&&(v[2]=1)),y!==m)b=0,y?(u.lineStart(),d=h(v,c),u.point(d[0],d[1])):(d=h(c,v),u.point(d[0],d[1],2),u.lineEnd()),c=d;else if(i&&c&&r^y){var x;!(E&f)&&(x=h(v,c,!0))&&(b=0,r?(u.lineStart(),u.point(x[0][0],x[0][1]),u.point(x[1][0],x[1][1]),u.lineEnd()):(u.point(x[1][0],x[1][1]),u.lineEnd(),u.lineStart(),u.point(x[0][0],x[0][1],3)))}y&&(!c||!Y1(c,v))&&u.point(v[0],v[1]),c=v,m=y,f=E},lineEnd:function(){m&&u.lineEnd(),c=null},clean:function(){return b|(p&&m)<<1}}}function h(u,c,f){var m=M1(u),p=M1(c),b=[1,0,0],g=Z1(m,p),M=W1(g,g),v=g[0],d=M-v*v;if(!d)return!f&&u;var y=n*M/d,E=-n*v/d,x=Z1(b,g),I=G1(b,y),R=G1(g,E);dn(I,R);var L=x,$=W1(I,L),P=W1(L,L),j=$*$-P*(W1(I,I)-1);if(!(j<0)){var O=_(j),F=G1(L,(-$-O)/P);if(dn(F,I),F=wn(F),!f)return F;var w=u[0],z=c[0],D=u[1],H=c[1],X;z<w&&(X=w,w=z,z=X);var r1=z-w,U=C(r1-N)<k,Q=U||r1<k;if(!U&&H<D&&(X=D,D=H,H=X),Q?U?D+H>0^F[1]<(C(F[0]-w)<k?D:H):D<=F[1]&&F[1]<=H:r1>N^(w<=F[0]&&F[0]<=z)){var V=G1(L,(-$+O)/P);return dn(V,I),[F,wn(V)]}}}function l(u,c){var f=r?t:N-t,m=0;return u<-f?m|=1:u>f&&(m|=2),c<-f?m|=4:c>f&&(m|=8),m}return St(a,s,o,r?[0,-t]:[-N,t-N])}function ge(t,n,e,r,i,o){var a=t[0],s=t[1],h=n[0],l=n[1],u=0,c=1,f=h-a,m=l-s,p;if(p=e-a,!(!f&&p>0)){if(p/=f,f<0){if(p<u)return;p<c&&(c=p)}else if(f>0){if(p>c)return;p>u&&(u=p)}if(p=i-a,!(!f&&p<0)){if(p/=f,f<0){if(p>c)return;p>u&&(u=p)}else if(f>0){if(p<u)return;p<c&&(c=p)}if(p=r-s,!(!m&&p>0)){if(p/=m,m<0){if(p<u)return;p<c&&(c=p)}else if(m>0){if(p>c)return;p>u&&(u=p)}if(p=o-s,!(!m&&p<0)){if(p/=m,m<0){if(p>c)return;p>u&&(u=p)}else if(m>0){if(p<u)return;p<c&&(c=p)}return u>0&&(t[0]=a+u*f,t[1]=s+u*m),c<1&&(n[0]=a+c*f,n[1]=s+c*m),!0}}}}}var x1=1e9,X1=-x1;function pe(t,n,e,r){function i(l,u){return t<=l&&l<=e&&n<=u&&u<=r}function o(l,u,c,f){var m=0,p=0;if(l==null||(m=a(l,c))!==(p=a(u,c))||h(l,u)<0^c>0)do f.point(m===0||m===3?t:e,m>1?r:n);while((m=(m+c+4)%4)!==p);else f.point(u[0],u[1])}function a(l,u){return C(l[0]-t)<k?u>0?0:3:C(l[0]-e)<k?u>0?2:1:C(l[1]-n)<k?u>0?1:0:u>0?3:2}function s(l,u){return h(l.x,u.x)}function h(l,u){var c=a(l,1),f=a(u,1);return c!==f?c-f:c===0?u[1]-l[1]:c===1?l[0]-u[0]:c===2?l[1]-u[1]:u[0]-l[0]}return function(l){var u=l,c=Mt(),f,m,p,b,g,M,v,d,y,E,x,I={point:R,lineStart:j,lineEnd:O,polygonStart:$,polygonEnd:P};function R(w,z){i(w,z)&&u.point(w,z)}function L(){for(var w=0,z=0,D=m.length;z<D;++z)for(var H=m[z],X=1,r1=H.length,U=H[0],Q,V,c1=U[0],p1=U[1];X<r1;++X)Q=c1,V=p1,U=H[X],c1=U[0],p1=U[1],V<=r?p1>r&&(c1-Q)*(r-V)>(p1-V)*(t-Q)&&++w:p1<=r&&(c1-Q)*(r-V)<(p1-V)*(t-Q)&&--w;return w}function $(){u=c,f=[],m=[],x=!0}function P(){var w=L(),z=x&&w,D=(f=hn(f)).length;(z||D)&&(l.polygonStart(),z&&(l.lineStart(),o(null,null,1,l),l.lineEnd()),D&&yt(f,s,w,o,l),l.polygonEnd()),u=l,f=m=p=null}function j(){I.point=F,m&&m.push(p=[]),E=!0,y=!1,v=d=NaN}function O(){f&&(F(b,g),M&&y&&c.rejoin(),f.push(c.result())),I.point=R,y&&u.lineEnd()}function F(w,z){var D=i(w,z);if(m&&p.push([w,z]),E)b=w,g=z,M=D,E=!1,D&&(u.lineStart(),u.point(w,z));else if(D&&y)u.point(w,z);else{var H=[v=Math.max(X1,Math.min(x1,v)),d=Math.max(X1,Math.min(x1,d))],X=[w=Math.max(X1,Math.min(x1,w)),z=Math.max(X1,Math.min(x1,z))];ge(H,X,t,n,e,r)?(y||(u.lineStart(),u.point(H[0],H[1])),u.point(X[0],X[1]),D||u.lineEnd(),x=!1):D&&(u.lineStart(),u.point(w,z),x=!1)}v=w,d=z,y=D}return I}}var bn,En,U1,V1,y1={sphere:W,point:W,lineStart:me,lineEnd:W,polygonStart:W,polygonEnd:W};function me(){y1.point=we,y1.lineEnd=ve}function ve(){y1.point=y1.lineEnd=W}function we(t,n){t*=B,n*=B,En=t,U1=A(n),V1=T(n),y1.point=Me}function Me(t,n){t*=B,n*=B;var e=A(n),r=T(n),i=C(t-En),o=T(i),a=A(i),s=r*a,h=V1*e-U1*r*o,l=U1*e+V1*r*o;bn.add(u1(_(s*s+h*h),l)),En=t,U1=e,V1=r}function ye(t){return bn=new K,h1(t,y1),+bn}var Ln=[null,null],Se={type:"LineString",coordinates:Ln};function b1(t,n){return Ln[0]=t,Ln[1]=n,ye(Se)}function it(t,n,e){var r=f1(t,n-k,e).concat(n);return function(i){return r.map(function(o){return[i,o]})}}function rt(t,n,e){var r=f1(t,n-k,e).concat(n);return function(i){return r.map(function(o){return[o,i]})}}function be(){var t,n,e,r,i,o,a,s,h=10,l=h,u=90,c=360,f,m,p,b,g=2.5;function M(){return{type:"MultiLineString",coordinates:v()}}function v(){return f1(j1(r/u)*u,e,u).map(p).concat(f1(j1(s/c)*c,a,c).map(b)).concat(f1(j1(n/h)*h,t,h).filter(function(d){return C(d%u)>k}).map(f)).concat(f1(j1(o/l)*l,i,l).filter(function(d){return C(d%c)>k}).map(m))}return M.lines=function(){return v().map(function(d){return{type:"LineString",coordinates:d}})},M.outline=function(){return{type:"Polygon",coordinates:[p(r).concat(b(a).slice(1),p(e).reverse().slice(1),b(s).reverse().slice(1))]}},M.extent=function(d){return arguments.length?M.extentMajor(d).extentMinor(d):M.extentMinor()},M.extentMajor=function(d){return arguments.length?(r=+d[0][0],e=+d[1][0],s=+d[0][1],a=+d[1][1],r>e&&(d=r,r=e,e=d),s>a&&(d=s,s=a,a=d),M.precision(g)):[[r,s],[e,a]]},M.extentMinor=function(d){return arguments.length?(n=+d[0][0],t=+d[1][0],o=+d[0][1],i=+d[1][1],n>t&&(d=n,n=t,t=d),o>i&&(d=o,o=i,i=d),M.precision(g)):[[n,o],[t,i]]},M.step=function(d){return arguments.length?M.stepMajor(d).stepMinor(d):M.stepMinor()},M.stepMajor=function(d){return arguments.length?(u=+d[0],c=+d[1],M):[u,c]},M.stepMinor=function(d){return arguments.length?(h=+d[0],l=+d[1],M):[h,l]},M.precision=function(d){return arguments.length?(g=+d,f=it(o,i,90),m=rt(n,t,g),p=it(s,a,90),b=rt(r,e,g),M):g},M.extentMajor([[-180,-90+k],[180,90-k]]).extentMinor([[-180,-80-k],[180,80+k]])}function bt(){return be()()}function Et(t,n){var e=t[0]*B,r=t[1]*B,i=n[0]*B,o=n[1]*B,a=T(r),s=A(r),h=T(o),l=A(o),u=a*T(e),c=a*A(e),f=h*T(i),m=h*A(i),p=2*i1(_(Un(o-r)+a*h*Un(i-e))),b=A(p),g=p?function(M){var v=A(M*=p)/b,d=A(p-M)/b,y=d*u+v*f,E=d*c+v*m,x=d*s+v*l;return[u1(E,y)*Z,u1(x,_(y*y+E*E))*Z]}:function(){return[e*Z,r*Z]};return g.distance=p,g}var xn=t=>t,pn=new K,Pn=new K,Lt,xt,An,Rn,l1={point:W,lineStart:W,lineEnd:W,polygonStart:function(){l1.lineStart=Ee,l1.lineEnd=xe},polygonEnd:function(){l1.lineStart=l1.lineEnd=l1.point=W,pn.add(C(Pn)),Pn=new K},result:function(){var t=pn/2;return pn=new K,t}};function Ee(){l1.point=Le}function Le(t,n){l1.point=Pt,Lt=An=t,xt=Rn=n}function Pt(t,n){Pn.add(Rn*t-An*n),An=t,Rn=n}function xe(){Pt(Lt,xt)}var S1=1/0,_1=S1,N1=-S1,J1=N1,Q1={point:Pe,lineStart:W,lineEnd:W,polygonStart:W,polygonEnd:W,result:function(){var t=[[S1,_1],[N1,J1]];return N1=J1=-(_1=S1=1/0),t}};function Pe(t,n){t<S1&&(S1=t),t>N1&&(N1=t),n<_1&&(_1=n),n>J1&&(J1=n)}var $n=0,zn=0,P1=0,nn=0,tn=0,w1=0,Tn=0,In=0,A1=0,At,Rt,o1,s1,n1={point:d1,lineStart:ot,lineEnd:st,polygonStart:function(){n1.lineStart=$e,n1.lineEnd=ze},polygonEnd:function(){n1.point=d1,n1.lineStart=ot,n1.lineEnd=st},result:function(){var t=A1?[Tn/A1,In/A1]:w1?[nn/w1,tn/w1]:P1?[$n/P1,zn/P1]:[NaN,NaN];return $n=zn=P1=nn=tn=w1=Tn=In=A1=0,t}};function d1(t,n){$n+=t,zn+=n,++P1}function ot(){n1.point=Ae}function Ae(t,n){n1.point=Re,d1(o1=t,s1=n)}function Re(t,n){var e=t-o1,r=n-s1,i=_(e*e+r*r);nn+=i*(o1+t)/2,tn+=i*(s1+n)/2,w1+=i,d1(o1=t,s1=n)}function st(){n1.point=d1}function $e(){n1.point=Te}function ze(){$t(At,Rt)}function Te(t,n){n1.point=$t,d1(At=o1=t,Rt=s1=n)}function $t(t,n){var e=t-o1,r=n-s1,i=_(e*e+r*r);nn+=i*(o1+t)/2,tn+=i*(s1+n)/2,w1+=i,i=s1*t-o1*n,Tn+=i*(o1+t),In+=i*(s1+n),A1+=i*3,d1(o1=t,s1=n)}function zt(t){this._context=t}zt.prototype={_radius:4.5,pointRadius:function(t){return this._radius=t,this},polygonStart:function(){this._line=0},polygonEnd:function(){this._line=NaN},lineStart:function(){this._point=0},lineEnd:function(){this._line===0&&this._context.closePath(),this._point=NaN},point:function(t,n){switch(this._point){case 0:{this._context.moveTo(t,n),this._point=1;break}case 1:{this._context.lineTo(t,n);break}default:{this._context.moveTo(t+this._radius,n),this._context.arc(t,n,this._radius,0,t1);break}}},result:W};var kn=new K,mn,Tt,It,R1,$1,F1={point:W,lineStart:function(){F1.point=Ie},lineEnd:function(){mn&&kt(Tt,It),F1.point=W},polygonStart:function(){mn=!0},polygonEnd:function(){mn=null},result:function(){var t=+kn;return kn=new K,t}};function Ie(t,n){F1.point=kt,Tt=R1=t,It=$1=n}function kt(t,n){R1-=t,$1-=n,kn.add(_(R1*R1+$1*$1)),R1=t,$1=n}var at,en,lt,ut,rn=class{constructor(n){this._append=n==null?Nt:ke(n),this._radius=4.5,this._=""}pointRadius(n){return this._radius=+n,this}polygonStart(){this._line=0}polygonEnd(){this._line=NaN}lineStart(){this._point=0}lineEnd(){this._line===0&&(this._+="Z"),this._point=NaN}point(n,e){switch(this._point){case 0:{this._append`M${n},${e}`,this._point=1;break}case 1:{this._append`L${n},${e}`;break}default:{if(this._append`M${n},${e}`,this._radius!==lt||this._append!==en){let r=this._radius,i=this._;this._="",this._append`m0,${r}a${r},${r} 0 1,1 0,${-2*r}a${r},${r} 0 1,1 0,${2*r}z`,lt=r,en=this._append,ut=this._,this._=i}this._+=ut;break}}}result(){let n=this._;return this._="",n.length?n:null}};function Nt(t){let n=1;this._+=t[0];for(let e=t.length;n<e;++n)this._+=arguments[n]+t[n]}function ke(t){let n=Math.floor(t);if(!(n>=0))throw new RangeError(`invalid digits: ${t}`);if(n>15)return Nt;if(n!==at){let e=10**n;at=n,en=function(i){let o=1;this._+=i[0];for(let a=i.length;o<a;++o)this._+=Math.round(arguments[o]*e)/e+i[o]}}return en}function Ft(t,n){let e=3,r=4.5,i,o;function a(s){return s&&(typeof r=="function"&&o.pointRadius(+r.apply(this,arguments)),h1(s,i(o))),o.result()}return a.area=function(s){return h1(s,i(l1)),l1.result()},a.measure=function(s){return h1(s,i(F1)),F1.result()},a.bounds=function(s){return h1(s,i(Q1)),Q1.result()},a.centroid=function(s){return h1(s,i(n1)),n1.result()},a.projection=function(s){return arguments.length?(i=s==null?(t=null,xn):(t=s).stream,a):t},a.context=function(s){return arguments.length?(o=s==null?(n=null,new rn(e)):new zt(n=s),typeof r!="function"&&o.pointRadius(r),a):n},a.pointRadius=function(s){return arguments.length?(r=typeof s=="function"?s:(o.pointRadius(+s),+s),a):r},a.digits=function(s){if(!arguments.length)return e;if(s==null)e=null;else{let h=Math.floor(s);if(!(h>=0))throw new RangeError(`invalid digits: ${s}`);e=h}return n===null&&(o=new rn(e)),a},a.projection(t).digits(e).context(n)}function Fn(t){return function(n){var e=new Nn;for(var r in t)e[r]=t[r];return e.stream=n,e}}function Nn(){}Nn.prototype={constructor:Nn,point:function(t,n){this.stream.point(t,n)},sphere:function(){this.stream.sphere()},lineStart:function(){this.stream.lineStart()},lineEnd:function(){this.stream.lineEnd()},polygonStart:function(){this.stream.polygonStart()},polygonEnd:function(){this.stream.polygonEnd()}};function Cn(t,n,e){var r=t.clipExtent&&t.clipExtent();return t.scale(150).translate([0,0]),r!=null&&t.clipExtent(null),h1(e,t.stream(Q1)),n(Q1.result()),r!=null&&t.clipExtent(r),t}function Ct(t,n,e){return Cn(t,function(r){var i=n[1][0]-n[0][0],o=n[1][1]-n[0][1],a=Math.min(i/(r[1][0]-r[0][0]),o/(r[1][1]-r[0][1])),s=+n[0][0]+(i-a*(r[1][0]+r[0][0]))/2,h=+n[0][1]+(o-a*(r[1][1]+r[0][1]))/2;t.scale(150*a).translate([s,h])},e)}function Ne(t,n,e){return Ct(t,[[0,0],n],e)}function Fe(t,n,e){return Cn(t,function(r){var i=+n,o=i/(r[1][0]-r[0][0]),a=(i-o*(r[1][0]+r[0][0]))/2,s=-o*r[0][1];t.scale(150*o).translate([a,s])},e)}function Ce(t,n,e){return Cn(t,function(r){var i=+n,o=i/(r[1][1]-r[0][1]),a=-o*r[0][0],s=(i-o*(r[1][1]+r[0][1]))/2;t.scale(150*o).translate([a,s])},e)}var ct=16,Oe=T(30*B);function ft(t,n){return+n?De(t,n):qe(t)}function qe(t){return Fn({point:function(n,e){n=t(n,e),this.stream.point(n[0],n[1])}})}function De(t,n){function e(r,i,o,a,s,h,l,u,c,f,m,p,b,g){var M=l-r,v=u-i,d=M*M+v*v;if(d>4*n&&b--){var y=a+f,E=s+m,x=h+p,I=_(y*y+E*E+x*x),R=i1(x/=I),L=C(C(x)-1)<k||C(o-c)<k?(o+c)/2:u1(E,y),$=t(L,R),P=$[0],j=$[1],O=P-r,F=j-i,w=v*O-M*F;(w*w/d>n||C((M*O+v*F)/d-.5)>.3||a*f+s*m+h*p<Oe)&&(e(r,i,o,a,s,h,P,j,L,y/=I,E/=I,x,b,g),g.point(P,j),e(P,j,L,y,E,x,l,u,c,f,m,p,b,g))}}return function(r){var i,o,a,s,h,l,u,c,f,m,p,b,g={point:M,lineStart:v,lineEnd:y,polygonStart:function(){r.polygonStart(),g.lineStart=E},polygonEnd:function(){r.polygonEnd(),g.lineStart=v}};function M(R,L){R=t(R,L),r.point(R[0],R[1])}function v(){c=NaN,g.point=d,r.lineStart()}function d(R,L){var $=M1([R,L]),P=t(R,L);e(c,f,u,m,p,b,c=P[0],f=P[1],u=R,m=$[0],p=$[1],b=$[2],ct,r),r.point(c,f)}function y(){g.point=M,r.lineEnd()}function E(){v(),g.point=x,g.lineEnd=I}function x(R,L){d(i=R,L),o=c,a=f,s=m,h=p,l=b,g.point=d}function I(){e(c,f,u,m,p,b,o,a,i,s,h,l,ct,r),g.lineEnd=y,y()}return g}}var Be=Fn({point:function(t,n){this.stream.point(t*B,n*B)}});function je(t){return Fn({point:function(n,e){var r=t(n,e);return this.stream.point(r[0],r[1])}})}function We(t,n,e,r,i){function o(a,s){return a*=r,s*=i,[n+t*a,e-t*s]}return o.invert=function(a,s){return[(a-n)/t*r,(e-s)/t*i]},o}function ht(t,n,e,r,i,o){if(!o)return We(t,n,e,r,i);var a=T(o),s=A(o),h=a*t,l=s*t,u=a/t,c=s/t,f=(s*e-a*n)/t,m=(s*n+a*e)/t;function p(b,g){return b*=r,g*=i,[h*b-l*g+n,e-l*b-h*g]}return p.invert=function(b,g){return[r*(u*b-c*g+f),i*(m-c*b-u*g)]},p}function Ge(t){return He(function(){return t})()}function He(t){var n,e=150,r=480,i=250,o=0,a=0,s=0,h=0,l=0,u,c=0,f=1,m=1,p=null,b=et,g=null,M,v,d,y=xn,E=.5,x,I,R,L,$;function P(w){return R(w[0]*B,w[1]*B)}function j(w){return w=R.invert(w[0],w[1]),w&&[w[0]*Z,w[1]*Z]}P.stream=function(w){return L&&$===w?L:L=Be(je(u)(b(x(y($=w)))))},P.preclip=function(w){return arguments.length?(b=w,p=void 0,F()):b},P.postclip=function(w){return arguments.length?(y=w,g=M=v=d=null,F()):y},P.clipAngle=function(w){return arguments.length?(b=+w?de(p=w*B):(p=null,et),F()):p*Z},P.clipExtent=function(w){return arguments.length?(y=w==null?(g=M=v=d=null,xn):pe(g=+w[0][0],M=+w[0][1],v=+w[1][0],d=+w[1][1]),F()):g==null?null:[[g,M],[v,d]]},P.scale=function(w){return arguments.length?(e=+w,O()):e},P.translate=function(w){return arguments.length?(r=+w[0],i=+w[1],O()):[r,i]},P.center=function(w){return arguments.length?(o=w[0]%360*B,a=w[1]%360*B,O()):[o*Z,a*Z]},P.rotate=function(w){return arguments.length?(s=w[0]%360*B,h=w[1]%360*B,l=w.length>2?w[2]%360*B:0,O()):[s*Z,h*Z,l*Z]},P.angle=function(w){return arguments.length?(c=w%360*B,O()):c*Z},P.reflectX=function(w){return arguments.length?(f=w?-1:1,O()):f<0},P.reflectY=function(w){return arguments.length?(m=w?-1:1,O()):m<0},P.precision=function(w){return arguments.length?(x=ft(I,E=w*w),F()):_(E)},P.fitExtent=function(w,z){return Ct(P,w,z)},P.fitSize=function(w,z){return Ne(P,w,z)},P.fitWidth=function(w,z){return Fe(P,w,z)},P.fitHeight=function(w,z){return Ce(P,w,z)};function O(){var w=ht(e,0,0,f,m,c).apply(null,n(o,a)),z=ht(e,r-w[0],i-w[1],f,m,c);return u=oe(s,h,l),I=yn(n,z),R=yn(u,I),x=ft(I,E),F()}function F(){return L=$=null,P}return function(){return n=t.apply(this,arguments),P.invert=n.invert&&j,O()}}function Ot(t){return function(n,e){var r=T(n),i=T(e),o=t(r*i);return o===1/0?[2,0]:[o*i*A(n),o*A(e)]}}function O1(t){return function(n,e){var r=_(n*n+e*e),i=t(r),o=A(i),a=T(i);return[u1(n*o,r*a),i1(r&&e*o/r)]}}var Xe=Ot(function(t){return _(2/(1+t))});Xe.invert=O1(function(t){return 2*i1(t/2)});var Ye=Ot(function(t){return(t=wt(t))&&t/A(t)});Ye.invert=O1(function(t){return t});function Ue(t,n){return[t,mt(vt((Y+n)/2))]}Ue.invert=function(t,n){return[t,2*C1(pt(n))-Y]};function dt(t,n){return[t,n]}dt.invert=dt;var z1=1.340264,T1=-.081106,I1=893e-6,k1=.003796,on=_(3)/2,Ve=12;function Ke(t,n){var e=i1(on*A(n)),r=e*e,i=r*r*r;return[t*T(e)/(on*(z1+3*T1*r+i*(7*I1+9*k1*r))),e*(z1+T1*r+i*(I1+k1*r))]}Ke.invert=function(t,n){for(var e=n,r=e*e,i=r*r*r,o=0,a,s,h;o<Ve&&(s=e*(z1+T1*r+i*(I1+k1*r))-n,h=z1+3*T1*r+i*(7*I1+9*k1*r),e-=a=s/h,r=e*e,i=r*r*r,!(C(a)<gt));++o);return[on*t*(z1+3*T1*r+i*(7*I1+9*k1*r))/T(e),i1(A(e)/on)]};function Ze(t,n){var e=T(n),r=T(t)*e;return[e*A(t)/r,A(n)/r]}Ze.invert=O1(C1);function _e(t,n){var e=n*n,r=e*e;return[t*(.8707-.131979*e+r*(-.013791+r*(.003971*e-.001529*r))),n*(1.007226+e*(.015085+r*(-.044475+.028874*e-.005916*r)))]}_e.invert=function(t,n){var e=n,r=25,i;do{var o=e*e,a=o*o;e-=i=(e*(1.007226+o*(.015085+a*(-.044475+.028874*o-.005916*a)))-n)/(1.007226+o*(.015085*3+a*(-.044475*7+.028874*9*o-.005916*11*a)))}while(C(i)>k&&--r>0);return[t/(.8707+(o=e*e)*(-.131979+o*(-.013791+o*o*o*(.003971-.001529*o)))),e]};function qt(t,n){return[T(n)*A(t),A(n)]}qt.invert=O1(i1);function Dt(){return Ge(qt).scale(249.5).clipAngle(90+k)}function Je(t,n){var e=T(n),r=1+T(t)*e;return[e*A(t)/r,A(n)/r]}Je.invert=O1(function(t){return 2*C1(t)});function Qe(t,n){return[mt(vt((Y+n)/2)),-t]}Qe.invert=function(t,n){return[-n,2*C1(pt(t))-Y]};var Bt=[[-67.8,-53.8,-66.5,-54.5,-65.1,-54.7,-65.5,-55.2,-66.5,-55.2,-67,-54.9,-67.3,-55.3,-68.1,-55.6,-69.2,-55.5,-70,-55.2,-71,-55.1,-72.3,-54.5,-73.3,-54,-74.7,-52.8,-73.8,-53,-72.4,-53.7,-71.1,-54.1,-70.6,-53.6,-70.3,-52.9,-69.3,-52.5,-68.6,-52.6,-68.3,-53.1,-67.8,-53.8],[-58.5,-51.1,-57.7,-51.5,-58,-51.9,-59.4,-52.2,-59.8,-51.8,-60.7,-52.3,-61.2,-51.8,-60,-51.3,-59.2,-51.5,-58.5,-51.1],[70.3,-49.7,68.7,-49.8,68.7,-49.2,68.9,-48.8,69.6,-48.9,70.5,-49.1,70.3,-49.7],[145.4,-40.8,146.4,-41.1,146.9,-41,147.7,-40.8,148.3,-40.9,148.4,-42.1,147.9,-43.2,146.9,-43.6,146,-43.5,145.4,-42.7,145.3,-42,144.7,-41.2,144.7,-40.7,145.4,-40.8],[173,-40.9,173.2,-41.3,174,-40.9,174.2,-41.3,174.2,-41.8,173.9,-42.2,173.2,-43,172.7,-43.4,173.1,-43.9,172.3,-43.9,171.5,-44.2,171.2,-44.9,170.6,-45.9,169.8,-46.4,169.3,-46.6,168.4,-46.6,167.8,-46.3,166.7,-46.2,166.5,-45.9,167,-45.1,168.3,-44.1,168.9,-43.9,169.7,-43.6,170.5,-43,171.1,-42.5,171.6,-41.8,172,-41.5,172.1,-41,172.8,-40.5,173,-40.9],[174.6,-36.2,175.3,-37.2,175.4,-36.5,175.8,-36.8,176,-37.6,176.8,-37.9,177.4,-38,178,-37.6,178.5,-37.7,178.3,-38.6,178,-39.2,177.2,-39.1,177,-39.9,176.5,-40.6,176,-41.3,175.2,-41.7,174.7,-41.3,175.2,-40.5,174.9,-39.9,173.8,-39.5,173.9,-39.1,174.6,-38.8,174.7,-38,174.7,-37.4,174.3,-36.7,173.8,-36.1,173.1,-35.2,172.6,-34.5,173,-34.5,173.6,-35,174.3,-35.3,174.6,-36.2],[167.1,-22.2,166.7,-22.4,166.2,-22.1,165.5,-21.7,164.8,-21.1,164.2,-20.4,165,-20.5,165.5,-20.8,166.6,-21.7,167.1,-22.2],[178.4,-17.3,178.6,-18.2,177.9,-18.3,177.4,-18.2,177.3,-17.7,177.7,-17.4,178.1,-17.5],[180,-16.6,179.4,-16.8,178.7,-17,178.6,-16.6,179.1,-16.4,180,-16.1,180.1,-16.4],[167.1,-14.9,167.3,-15.7,166.8,-15.7,166.6,-14.6,167.1,-14.9],[50.1,-13.6,50.2,-14.8,50.5,-15.2,50.4,-15.7,49.9,-15.4,49.9,-16.4,49.8,-16.9,49.4,-18,49,-19.1,48.5,-20.5,47.9,-22.4,47.5,-23.8,47.1,-24.9,46.3,-25.2,45.4,-25.6,44.8,-25.3,44,-25,43.8,-24.5,43.7,-23.6,43.3,-22.8,43.3,-22.1,43.4,-21.3,43.9,-21.2,44.4,-20.1,44.5,-19.4,44.2,-19,44,-18.3,44,-17.4,44.3,-16.9,44.4,-16.2,44.9,-16.2,45.5,-16,45.9,-15.8,46.3,-15.8,46.9,-15.2,47.7,-14.6,48,-14.1,47.9,-13.7,48.3,-13.8,48.8,-13.1,48.9,-12.5,49.2,-12,49.5,-12.5,49.8,-12.9,50.1,-13.6],[143.6,-13.8,143.9,-14.5,144.6,-14.2,144.9,-14.6,145.4,-15,145.3,-15.4,145.5,-16.3,145.6,-16.8,146.2,-17.8,146.1,-18.3,146.4,-19,147.5,-19.5,148.2,-20,148.8,-20.4,149.3,-21.3,149.7,-22.3,150.1,-22.1,150.5,-22.6,150.9,-23.5,151.6,-24.1,152.1,-24.5,152.9,-25.3,153.1,-26.1,153.2,-26.6,153.1,-27.3,153.6,-28,153.5,-29,153.3,-29.5,153.1,-30.4,153.1,-30.9,152.9,-31.6,152.4,-32.6,151.7,-33,151.3,-33.8,151,-34.3,150.7,-35.2,150.3,-35.7,150.1,-36.4,149.9,-37.1,149.4,-37.8,148.3,-37.8,147.4,-38.2,146.9,-38.6,146.3,-39,145.5,-38.6,144.9,-38.4,145,-37.9,144.5,-38.1,143.6,-38.8,142.7,-38.5,142.2,-38.4,141.6,-38.3,140.6,-38,140,-37.4,139.8,-36.6,139.6,-36.1,139.1,-35.7,138.1,-35.6,138.4,-35.1,138.2,-34.4,137.7,-35.1,136.8,-35.3,137.4,-34.7,137.5,-34.1,137.9,-33.6,137.8,-32.9,137,-33.8,136.4,-34.1,136,-34.9,135.2,-34.5,135.2,-33.9,134.6,-33.2,134.1,-32.8,133,-32,132.3,-32,131.3,-31.5,129.5,-31.6,128.2,-31.9,127.1,-32.3,126.1,-32.2,125.1,-32.7,124.2,-33,124,-33.5,123.7,-33.9,122.8,-33.9,122.2,-34,121.3,-33.8,120.6,-33.9,119.9,-34,119.3,-34.5,118.5,-34.7,118,-35.1,117.3,-35,116.6,-35,115.6,-34.4,115,-34.2,115,-33.6,115.5,-33.5,115.7,-32.9,115.8,-32.2,115.7,-31.6,115.2,-30.6,115,-30,115,-29.5,114.6,-28.8,114.2,-28,114,-27.3,113.5,-26.5,113.3,-26.1,113.8,-26.5,113.4,-25.6,113.9,-25.9,114.2,-26.3,114.2,-25.8,113.7,-25,113.4,-24.4,113.5,-23.8,113.8,-23.1,113.7,-22.5,114.1,-21.8,114.2,-22.5,114.6,-21.8,115.5,-21.5,115.9,-21.1,116.7,-20.7,117.2,-20.6,118.2,-20.4,118.8,-20.3,119.3,-20,119.8,-20,120.9,-19.7,121.4,-19.2,121.7,-18.7,122.2,-18.2,122.3,-17.8,122.3,-17.3,123,-16.4,123.4,-17.3,123.9,-17.1,123.5,-16.6,123.8,-16.1,124.3,-16.3,124.4,-15.6,124.9,-15.1,125.2,-14.7,125.7,-14.5,126.1,-14.3,126.6,-14,127.1,-13.8,127.8,-14.3,128.4,-14.9,129,-14.9,129.6,-15,129.4,-14.4,129.9,-13.6,130.3,-13.4,130.6,-12.5,131.2,-12.2,131.7,-12.3,132.6,-12.1,132.6,-11.6,131.8,-11.2,132.4,-11.1,133,-11.3,133.6,-11.8,134.4,-12,135.3,-12.2,135.9,-12,136.3,-12,137,-12.4,136.7,-12.9,136.3,-13.3,136.1,-13.7,135.8,-14.2,135.4,-14.7,136.3,-15.6,137.1,-15.9,137.6,-16.2,138.3,-16.8,139.1,-17.1,140.2,-17.7,140.9,-17.4,141.1,-16.8,141.3,-16.4,141.4,-15.8,141.7,-15,141.6,-14.6,141.5,-13.7,141.7,-12.9,141.7,-12.4,141.9,-11.9,142.1,-11.2,142.5,-10.7,142.8,-11.1,142.9,-11.8,143.2,-12.3,143.5,-12.8,143.6,-13.4,143.6,-13.8],[162.1,-10.5,161.7,-10.8,161.3,-10.2,161.9,-10.4],[120.7,-10.2,120.3,-10.3,119,-9.6,119.9,-9.4,120.4,-9.7,120.7,-10.2],[160.9,-9.9,160.5,-9.9,159.9,-9.8,159.7,-9.2,160.4,-9.4,160.9,-9.9],[161.7,-9.6,160.8,-8.9,160.6,-8.3,161.3,-9.1,161.7,-9.6],[124.4,-10.1,123.6,-10.4,123.6,-9.9,124,-9.3,125,-8.9,125.9,-8.4,126.6,-8.4,127.3,-8.4,127,-8.7,125.9,-9.1,125.1,-9.4,124.4,-10.1],[117.9,-8.1,118.3,-8.4,118.9,-8.3,119.1,-8.7,118,-8.9,117.3,-9,116.7,-9,117.1,-8.5,117.6,-8.4,117.9,-8.1],[122.9,-8.1,122.8,-8.7,121.3,-8.9,119.9,-8.8,119.9,-8.4,120.7,-8.2,121.3,-8.5,122,-8.5,122.9,-8.1],[159.9,-8.3,159.1,-8.1,158.6,-7.8,158.2,-7.4,158.8,-7.6,159.6,-8],[157.5,-7.3,156.9,-7.2,156.5,-6.8,157.1,-7,157.5,-7.3],[108.6,-6.8,110.5,-6.9,110.8,-6.5,112.6,-6.9,113,-7.6,114.5,-7.8,115.7,-8.4,114.6,-8.8,113.5,-8.3,112.6,-8.4,111.5,-8.3,110.6,-8.1,109.4,-7.7,108.7,-7.6,108.3,-7.8,106.5,-7.4,106.3,-6.9,105.4,-6.9,106.1,-5.9,107.3,-6,108.1,-6.3,108.5,-6.4,108.6,-6.8],[134.7,-6.2,134.2,-6.9,134.1,-6.1,134.3,-5.8,134.7,-5.7,134.7,-6.2],[155.9,-6.8,155.2,-6.5,154.7,-5.9,154.5,-5.1,155.1,-5.6,155.5,-6.2,156,-6.5],[152,-5.5,151.5,-5.6,150.8,-6.1,150.2,-6.3,149.7,-6.3,148.9,-6,148.3,-5.7,149.3,-5.6,149.8,-5.5,150,-5,150.2,-5.5,150.8,-5.5,151.6,-4.8,151.5,-4.2,152.1,-4.1,152.3,-4.9,152,-5.5],[127.2,-3.5,126.9,-3.8,126.2,-3.6,126,-3.2,127,-3.1],[130.5,-3.1,130.8,-3.9,130,-3.4,129.2,-3.4,128.6,-3.4,127.9,-3.4,128.1,-2.8,129.4,-2.8,130.5,-3.1],[153.1,-4.5,152.6,-4.2,152.4,-3.8,152,-3.5,151.4,-3,150.7,-2.7,151.5,-2.8,152.2,-3.2,152.6,-3.7,153,-4,153.1,-4.5],[134.1,-1.2,134.4,-2.8,135.5,-3.4,136.3,-2.3,137.4,-1.7,138.3,-1.7,139.2,-2.1,139.9,-2.4,141,-2.6,142.7,-3.3,144.6,-3.9,145.3,-4.4,145.8,-4.9,146,-5.5,147.6,-6.1,147.9,-6.6,147,-6.7,147.2,-7.4,148.1,-8,148.7,-9.1,149.3,-9.1,149.3,-9.5,150,-9.7,150.8,-10.3,150,-10.7,148.9,-10.3,147.9,-10.1,147.1,-9.5,146.6,-8.9,146,-8.1,144.7,-7.6,143.9,-7.9,143.3,-8.2,143.4,-9,142.6,-9.3,142.1,-9.2,141,-9.1,140.1,-8.3,139.1,-8.1,137.6,-8.4,138,-7.6,138.7,-7.3,138.4,-6.2,137.9,-5.4,136,-4.5,135.2,-4.5,133.7,-3.5,133.4,-4,133,-4.1,132.8,-3.7,132.8,-3.3,132,-2.8,133.1,-2.5,133.8,-2.5,132.2,-2.2,131.8,-1.6,130.9,-1.4,130.5,-.9,131.9,-.7,132.4,-.4,134,-.8,134.1,-1.2],[125.2,1.4,124.4,.4,123.7,.2,122.7,.4,121.1,.4,120.2,.2,120,-.5,120.9,-1.4,121.5,-1,123.3,-.6,123.3,-1.1,122.8,-.9,122.4,-1.5,121.5,-1.9,122.5,-3.2,123.2,-4.7,123.2,-5.3,122.6,-5.6,122.2,-5.3,122.7,-4.5,121.7,-4.9,121.6,-4.2,120.9,-3.6,121,-2.6,120.3,-2.9,120.4,-4.1,120.4,-5.5,119.8,-5.7,119.4,-5.4,119.7,-4.5,119.5,-3.5,119.1,-3.5,118.8,-2.8,119.2,-2.1,119.3,-1.4,119.8,.2,120,.6,120.9,1.3,121.7,1,122.9,.9,124.1,.9,125.1,1.6],[128.7,1.1,128.6,.3,128.1,.4,128,-.3,128.4,-.8,127.7,-.3,127.4,1,127.6,1.8,127.9,2.2,128,1.6,128.6,1.5,128.7,1.1],[105.8,-5.9,104.7,-5.9,103.9,-5,102.6,-4.2,102.2,-3.6,101.4,-2.8,100.9,-2.1,100.1,-.7,99.3,.2,99,1,98.6,1.8,97.7,2.5,97.2,3.3,96.4,3.9,95.4,5,95.3,5.5,95.9,5.4,97.5,5.2,98.4,4.3,99.1,3.6,99.7,3.2,100.6,2.1,101.7,2.1,102.5,1.4,103.1,.6,103.8,.1,103.4,-.7,104,-1.1,104.4,-1.1,104.5,-1.8,104.9,-2.3,105.6,-2.4,106.1,-3.1,105.9,-4.3,105.8,-5.9],[117.9,1.8,119,.9,117.8,.8,117.5,.1,117.5,-.8,116.6,-1.5,116.5,-2.5,116.1,-4,116,-3.7,114.9,-4.1,114.5,-3.5,113.8,-3.4,113.3,-3.1,112.1,-3.5,111.7,-3,111,-3,110.2,-2.9,110.1,-1.6,109.6,-1.3,109.1,-.5,109,.4,109.1,1.3,109.7,2,110.4,1.7,111.2,1.9,111.4,2.7,111.8,2.9,113,3.1,113.7,3.9,114.2,4.5,114.6,4.9,115.5,5.4,116.2,6.1,116.7,6.9,117.1,6.9,117.6,6.4,117.7,6,118.3,5.7,119.2,5.4,119.1,5,118.4,5,118.6,4.5,117.9,4.1,117.3,3.2,118,2.3,117.9,1.8],[126.4,8.4,126.5,7.8,126.5,7.2,126.2,6.3,125.8,7.3,125.4,6.8,125.7,6,125.4,5.6,124.2,6.2,123.9,6.9,124.2,7.4,123.6,7.8,123.3,7.4,122.8,7.5,122.1,6.9,122.3,8,122.9,8.3,123.5,8.7,123.8,8.2,124.6,8.5,124.8,9,125.5,9,125.4,9.8,126.2,9.3,126.3,8.8,126.4,8.4],[81.2,6.2,80.3,6,79.9,6.8,79.7,8.2,80.1,9.8,80.8,9.3,81.3,8.6,81.8,7.5,81.6,6.5,81.2,6.2],[-60.9,10.1,-61.8,10,-61.7,10.4,-61.7,10.8,-61.1,10.9,-60.9,10.1],[124,10.3,123.6,9.9,123.3,9.3,122.4,9.7,122.8,10.3,122.9,10.9,123.5,10.9,123.3,10.3,124.1,11.2,124,10.3],[118.5,9.3,117.2,8.4,117.7,9.1,118.4,9.7,119,10.4,119.5,11.4,119.7,10.6,119,10,118.5,9.3],[121.9,11.9,122.5,11.7,123.1,11.7,123.1,11.2,122.6,10.7,122,10.4,122,10.9,122,11.4,121.9,11.9],[125.5,12.2,125.8,11,125,11.3,125.3,10.4,124.8,10.1,124.8,10.8,124.3,11.5,124.9,11.4,124.9,11.9,124.3,12.6,125.2,12.5,125.5,12.2],[121.5,13.1,121.3,12.2,120.8,12.7,120.3,13.5,121.2,13.4,121.5,13.1],[121.3,18.5,121.9,18.2,122.3,18.2,122.2,17.8,122.5,17.1,122.3,16.3,121.7,15.9,121.5,15.1,121.7,14.3,122.3,14.2,122.7,14.3,124,13.8,123.9,13.2,124.1,12.5,123.3,13,122.9,13.6,122.7,13.2,122,13.8,121.1,13.6,120.6,13.9,120.7,14.3,120.7,14.8,120.6,14.4,120.1,15,119.9,15.4,119.9,16.4,120.3,16,120.4,17.6,120.7,18.5,121.3,18.5],[-65.6,18.2,-66.6,18,-67.2,17.9,-67.2,18.4,-66.3,18.5,-65.8,18.4],[-76.9,17.9,-77.8,17.9,-78.3,18.2,-77.8,18.5,-76.9,18.4,-76.4,18.2,-76.9,17.9],[-72.6,19.9,-71.7,19.8,-70.8,19.9,-70.2,19.6,-69.8,19.3,-69.2,19.3,-68.8,19,-68.3,18.6,-68.7,18.2,-69.2,18.4,-69.6,18.4,-70.1,18.2,-70.5,18.2,-71,18.3,-71.4,17.6,-71.7,18,-72.4,18.2,-72.8,18.1,-73.5,18.2,-73.9,18,-74.5,18.3,-73.4,18.5,-72.7,18.4,-72.3,18.7,-72.8,19.1,-72.8,19.5,-73.4,19.6,-72.6,19.9],[110.3,18.7,109.5,18.2,108.7,18.5,108.6,19.4,109.1,19.8,110.2,20.1,110.8,20.1,111,19.8,110.6,19.3,110.3,18.7],[-155.5,19.1,-155.9,19.1,-156.1,19.8,-155.9,20.2,-155.4,20.1,-154.8,19.5,-155.2,19.2],[-157.7,21.3,-158.1,21.3,-158,21.7,-157.7,21.3],[-79.7,22.8,-79.3,22.4,-78.3,22.5,-78,22.3,-77.1,21.7,-76.5,21.2,-75.6,21,-74.9,20.7,-74.2,20.3,-75,19.9,-75.6,19.9,-76.3,20,-77.8,19.9,-77.1,20.4,-77.5,20.7,-78.1,20.7,-78.7,21.6,-79.3,21.6,-80.2,21.8,-81.8,22.2,-81.8,22.6,-82.8,22.7,-83.5,22.2,-83.9,22.2,-84.5,21.8,-85,21.9,-84.4,22.2,-84.2,22.6,-83.8,22.8,-83.3,23,-82.5,23.1,-81.4,23.1,-80.6,23.1,-79.7,22.8],[-77.5,23.9,-78,24.3,-78.4,24.6,-78.2,25.2,-77.5,24.3,-77.5,23.9],[121.2,22.8,120.7,22,120.2,22.8,120.1,23.6,120.7,24.5,121.5,25.3,122,25,121.8,24.4,121.2,22.8],[-77.8,26.6,-78.9,26.4,-79,26.8,-78.5,26.9,-77.8,26.8],[-77,26.6,-77.2,25.9,-77.3,26.5,-77.8,26.9,-77,26.6],[134.6,34.1,134.2,33.2,133.8,33.5,133.3,33.3,133,32.7,132.4,33,132.4,33.5,132.9,34.1,133.5,33.9,133.9,34.4,134.6,34.1],[34.6,35.7,33.9,35.2,33,34.6,32.5,34.7,32.3,35.1,32.7,35.1,33.7,35.4,34.6,35.7],[23.7,35.7,24.2,35.4,25,35.4,25.8,35.4,26.3,35.3,24.7,34.9,23.5,35.3,23.7,35.7],[15.5,38.2,15.2,37.4,15.1,36.6,14.3,37,13.8,37.1,12.4,37.6,12.6,38.1,13.7,38,14.8,38.1,15.5,38.2],[9.2,41.2,9.8,40.5,9.7,39.2,9.2,39.2,8.8,38.9,8.4,39.2,8.4,40.4,8.2,41,8.7,40.9,9.2,41.2],[141,37.1,140.6,36.3,140.8,35.8,140.3,35.1,139,34.7,137.2,34.6,135.8,33.5,135.1,33.8,135.1,34.6,133.3,34.4,132.2,33.9,131,33.9,132,33.1,131.3,31.5,130.7,31,130.2,31.4,130.4,32.3,129.8,32.6,129.4,33.3,130.4,33.6,130.9,34.2,131.9,34.8,132.6,35.4,134.6,35.7,135.7,35.5,136.7,37.3,137.4,36.8,138.9,37.8,139.4,38.2,140.1,39.4,139.9,40.6,140.3,41.2,141.4,41.4,141.9,40,141.9,39.2,141,38.2,141,37.1],[9.6,42.2,9.2,41.4,8.8,41.6,8.5,42.3,8.7,42.6,9.4,43,9.6,42.2],[143.9,44.2,144.6,44,145.3,44.4,145.5,43.3,144.1,43,143.2,42,141.6,42.7,141.1,41.6,140,41.6,139.8,42.6,140.3,43.3,141.4,43.4,141.7,44.8,142,45.6,143.1,44.5,143.9,44.2],[-63.7,46.5,-62.9,46.4,-62,46.4,-62.5,46,-62.9,46,-64.1,46.4,-64,47,-63.7,46.5],[-61.8,49.1,-62.3,49.1,-63.6,49.4,-64.5,49.9,-62.9,49.7,-61.8,49.3],[-123.5,48.5,-124,48.4,-125.7,48.8,-126,49.2,-126.8,49.5,-128.1,50,-128.4,50.5,-127.3,50.6,-126.7,50.4,-125.8,50.3,-124.9,49.5,-123.9,49.1,-123.5,48.5],[-56.1,50.7,-56.8,49.8,-56.1,50.1,-55.5,49.9,-55.8,49.6,-54.9,49.3,-54.5,49.6,-53.5,49.2,-53.8,48.5,-53.1,48.7,-53,48.2,-52.6,47.5,-53.1,46.7,-53.5,46.6,-54.2,46.8,-54,47.6,-55.4,46.9,-56,46.9,-55.3,47.4,-56.3,47.6,-57.3,47.6,-59.3,47.6,-58.8,48.3,-59.2,48.5,-58.4,49.1,-57.4,50.7,-56.7,51.3,-55.9,51.6,-55.4,51.6,-56.1,50.7],[-132.7,54,-131.7,54.1,-132.1,53,-131.2,52.2,-131.6,52.2,-132.2,52.6,-132.6,53.1,-133.1,53.4,-133.2,53.9,-132.7,54],[143.6,50.7,144.7,49,143.2,49.3,142.6,47.9,143.5,46.8,143.5,46.1,142.7,46.7,142.1,46,141.9,46.8,142,47.8,141.9,48.9,142.1,49.6,142.2,51,141.6,51.9,141.7,53.3,142.6,53.8,142.2,54.2,142.7,54.4,142.9,53.7,143.3,52.7,143.2,51.8,143.6,50.7],[-6.8,52.3,-8.6,51.7,-10,51.8,-9.2,52.9,-9.7,53.9,-8.3,54.7,-7.6,55.1,-6.7,55.2,-5.7,54.6,-6.2,53.9,-6,53.2,-6.8,52.3],[12.7,55.6,12.1,54.8,11,55.4,10.9,55.8,12.4,56.1,12.7,55.6],[-153,57.1,-154,56.7,-154.5,57,-154.7,57.5,-153.8,57.8,-153.2,58,-152.6,57.9,-152.1,57.6,-153,57.1],[-3,58.6,-4.1,57.6,-3.1,57.7,-2,57.7,-2.2,56.9,-3.1,56,-2.1,55.9,-1.1,54.6,-.4,54.5,.2,53.3,.5,52.9,1.7,52.7,1.6,52.1,1,51.8,1.4,51.3,.5,50.8,-.8,50.8,-2.5,50.5,-3,50.7,-3.6,50.2,-4.5,50.3,-5.2,50,-5.8,50.2,-4.3,51.2,-3.4,51.4,-5,51.6,-5.3,52,-4.2,52.3,-4.8,52.8,-4.6,53.5,-3.1,53.4,-2.9,54,-3.6,54.6,-4.8,54.8,-4.7,55.5,-5.6,55.3,-5.6,56.3,-6.2,56.8,-5.8,57.8,-5,58.6,-4.2,58.6,-3,58.6],[-165.6,59.9,-166.2,59.8,-166.8,59.9,-167.5,60.2,-166.5,60.4,-165.7,60.3,-165.6,59.9],[-79.3,62.2,-79.7,61.6,-80.1,61.7,-80.3,62.1,-79.9,62.4,-79.5,62.4],[-81.9,62.7,-83.1,62.2,-83.8,62.2,-83.2,62.9,-81.9,62.9],[-171.7,63.8,-171.1,63.6,-170.5,63.7,-169.7,63.4,-168.7,63.3,-169.5,63,-170.3,63.2,-170.7,63.4,-171.6,63.3,-171.7,63.8],[-85.2,65.7,-85,65.2,-84.5,65.4,-83.9,65.1,-82.8,64.8,-81.6,64.5,-81.6,64,-80.8,64.1,-80.1,63.7,-81,63.4,-82.5,63.7,-83.1,64.1,-84.1,63.6,-85.5,63.1,-85.9,63.6,-87.2,63.5,-86.4,64,-86.2,64.8,-85.9,65.7,-85.2,65.7],[-14.5,66.5,-14.7,65.8,-13.6,65.1,-14.9,64.4,-17.8,63.7,-18.7,63.5,-20,63.6,-22.8,64,-21.8,64.4,-24,64.9,-22.2,65.1,-24.3,65.6,-23.7,66.3,-22.1,66.4,-20.6,65.7,-19.1,66.3,-17.8,66,-16.2,66.5,-14.5,66.5],[-75.9,67.1,-77,67.1,-77.2,67.6,-76.8,68.1,-75.9,68.3,-75.1,68,-75.1,67.6,-75.9,67.1],[180,69,182.5,68.2,185.1,67.2,185,66.6,185.7,66.3,185.4,67.1,188.1,66.9,190.1,66,189.1,65.5,187.5,65.4,187.4,64.5,187,64.3,186.1,64.3,185.3,64.6,184,64.9,183.8,65.4,182.8,65.5,181.6,65.4,181.1,65.7,181.3,66.1,180.1,65.9,180.6,65.4,180,65,180,65,178.7,64.5,177.4,64.6,178.3,64.1,178.9,63.3,179.4,63,179.5,62.6,177.4,62.5,174.6,61.8,173.7,61.7,172.1,60.9,170.7,60.3,170.3,59.9,168.9,60.6,166.3,59.8,165.8,60.2,164.9,59.7,163.5,59.9,163.2,59.2,162,58.2,162.1,57.8,163.2,57.6,163.1,56.2,162.1,56.1,161.7,55.3,162.1,54.9,160.4,54.3,160,53.2,158.5,53,158.2,51.9,156.8,51,156.4,51.7,156,53.2,155.4,55.4,155.9,56.8,156.8,57.4,156.8,57.8,158.4,58.1,160.1,59.3,161.9,60.3,163.7,61.1,164.5,62.6,163.3,62.5,162.7,61.6,160.1,60.5,159.3,61.8,156.7,61.4,154.2,59.8,155,59.1,152.8,58.9,151.3,58.8,151.3,59.5,149.8,59.7,148.5,59.2,145.5,59.3,142.2,59,139,57.1,135.1,54.7,136.7,54.6,137.2,54,138.2,53.8,138.8,54.3,139.9,54.2,141.3,53.1,141.4,52.2,140.6,51.2,140.5,50,140.1,48.4,138.6,47,138.2,46.3,136.9,45.1,135.5,44,134.9,43.4,133.5,42.8,132.9,42.8,132.3,43.3,130.9,42.6,130.4,42.3,130,41.9,129.7,40.9,129.2,40.7,128.6,40.2,128,40,127.5,39.8,127.5,39.3,128.4,38.6,129.2,37.4,129.5,36.8,129.5,35.6,129.1,35.1,128.2,34.9,127.4,34.5,126.5,34.4,126.4,34.9,126.6,35.7,126.1,36.7,126.9,36.9,126.2,37.7,125.7,37.9,125.3,37.7,124.7,38.1,125,38.5,125.4,39.4,124.7,39.7,124.3,39.9,122.9,39.6,122.1,39.2,121.1,38.9,121.6,39.4,121.4,39.8,122.2,40.4,121.6,40.9,120.8,40.6,119.6,39.9,119,39.3,118,39.2,117.5,38.7,118.1,38.1,118.9,37.9,118.9,37.4,119.7,37.2,120.8,37.9,121.7,37.5,122.4,37.5,122.5,36.9,121.1,36.7,120.6,36.1,119.7,35.6,119.2,34.9,120.2,34.4,120.6,33.4,121.2,32.5,121.9,31.7,121.9,30.9,121.3,30.7,121.5,30.1,122.1,29.8,121.9,29,121.7,28.2,121.1,28.1,120.4,27.1,119.6,25.7,118.7,24.5,117.3,23.6,115.9,22.8,114.8,22.7,114.2,22.2,113.2,22.1,111.8,21.6,110.8,21.4,110.4,20.3,109.9,20.3,109.6,21,109.9,21.4,108.5,21.7,108,21.6,106.7,20.7,105.9,19.8,105.7,19.1,106.4,18,107.4,16.8,108.3,16.1,108.9,15.3,109.3,13.4,109.2,11.8,108.4,11,107.2,10.4,106.4,9.5,105.2,8.6,104.8,9.2,105.1,9.9,104.3,10.5,103.5,10.6,103.1,11.2,102.6,12.2,101.7,12.6,100.8,12.6,101,13.4,100.1,13.4,100,12.3,99.5,10.8,99.2,10,99.2,9.2,99.9,9.2,100.3,8.3,100.5,7.4,101,6.9,101.6,6.7,102.1,6.2,103,5.5,103.4,4.9,103.4,4.2,103.3,3.7,103.5,2.8,103.9,2.5,104.2,1.6,103.5,1.2,102.6,2,101.4,2.8,101.3,3.3,100.7,3.9,100.6,4.8,100.2,5.3,100.3,6,100.1,6.5,99.7,6.8,99.5,7.3,99,7.9,98.5,8.4,98.3,7.8,98.1,8.3,98.3,9,98.6,9.9,98.5,10.7,98.8,11.4,98.4,12,98.5,13.1,98.1,13.6,97.8,14.8,97.6,16.1,97.2,16.9,96.5,16.4,95.4,15.7,94.8,15.8,94.2,16,94.5,17.3,94.3,18.2,93.5,19.4,93.7,19.8,93.1,19.9,92.4,20.7,92.1,21.2,92,21.7,91.8,22.2,91.4,22.8,90.5,22.8,90.6,22.4,90.3,21.8,89.8,22,89.4,22,89,22.1,88.9,21.7,88.2,21.7,87,21.5,87,20.7,86.5,20.2,85.1,19.5,83.9,18.3,83.2,17.7,82.2,17,82.2,16.7,81.7,16.3,80.8,16,80.3,15.9,80,15.1,80.2,13.8,80.3,13,79.9,12.1,79.9,10.4,79.3,10.3,78.9,9.5,78.3,8.9,77.9,8.3,77.5,8,76.6,8.9,76.1,10.3,75.7,11.3,75.4,11.9,74.9,12.7,74.6,14,74.4,14.6,73.5,16,73.1,17.9,72.8,19.2,72.8,20.4,72.6,21.4,71.2,20.8,70.5,20.9,69.2,22.1,69.6,22.5,69.3,22.8,68.2,23.7,67.4,23.9,67.1,24.7,66.4,25.4,64.5,25.2,62.9,25.2,61.5,25.1,59.6,25.4,58.5,25.6,57.4,25.7,57,27,56.5,27.1,55.7,27,54.7,26.5,53.5,26.8,52.5,27.6,51.5,27.9,50.9,28.8,50.1,30.1,49.6,30,48.9,30.3,48.6,29.9,48,30,48.2,29.5,48.4,28.6,48.8,27.7,49.3,27.5,49.5,27.1,50.2,26.7,50.2,26.3,50.2,25.6,50.7,25,50.7,25.5,51,26,51.6,25.8,51.6,25.2,51.4,24.6,51.6,24.2,52.6,24.2,53.4,24.2,54,24.1,54.7,24.8,55.4,25.4,56.1,26.1,56.5,26.3,56.4,25.9,56.4,24.9,56.8,24.2,57.4,23.9,58.1,23.7,58.7,23.6,59.2,23,59.8,22.5,59.4,21.7,58.9,21.1,58.5,20.4,58,20.5,57.7,19.8,57.8,19.1,57.2,18.9,56.6,18.6,56.5,18.1,55.7,17.9,55.3,17.6,55.3,17.2,54.8,16.9,54.2,17,53.6,16.8,53.1,16.8,52.4,16.4,52.2,15.9,51.2,15.2,49.6,14.7,48.7,14,48.2,13.9,47.4,13.6,46.7,13.4,45.9,13.3,45.4,13,45,12.7,44.5,12.7,43.5,12.6,43.2,13.2,43.3,13.8,42.9,14.8,42.6,15.2,42.7,15.7,42.8,16.3,42.7,16.8,42.3,17.5,41.8,17.8,41.2,18.7,40.9,19.5,40.2,20.2,39.8,20.3,39.1,21.3,39,22,39.1,22.6,38.5,23.7,38,24.1,37.5,24.3,37.2,24.9,36.9,25.6,36.3,26.6,35.6,27.4,35.1,28.1,34.6,28.1,34.8,28.6,35,29.4,34.4,28.3,34.2,27.8,33.6,28,33.1,28.4,32.4,29.9,32.7,28.7,33.3,27.7,34.1,26.1,34.5,25.6,34.8,25,35.7,23.9,35.5,23.1,36.7,22.2,37.2,21,37.1,19.8,37.5,18.6,37.9,18.4,38.4,18,39,16.8,39.3,15.9,39.8,15.4,41.2,14.5,41.7,13.9,42.3,13.3,43.1,12.7,43.3,12,42.7,11.8,43.1,11.5,43.7,10.9,44.1,10.4,44.6,10.4,45.6,10.7,46.6,10.8,47.5,11.1,48,11.2,48.4,11.4,48.9,11.4,49.7,11.7,50.3,11.8,50.7,12,51.1,12,51,11.2,51,10.6,50.8,10.3,50.6,9.2,50.1,8.1,49.5,6.8,48.6,5.3,47.7,4.2,46.6,2.9,45.6,2,44.1,1.1,43.1,.3,42,-.9,41.8,-1.4,40.9,-2.1,40.6,-2.5,40.3,-2.6,40.1,-3.3,39.8,-3.7,39.6,-4.3,39.2,-4.7,38.7,-5.9,38.8,-6.5,39.4,-6.8,39.2,-7.7,39.2,-8.5,39.5,-9.1,40,-10.1,40.3,-10.3,40.5,-10.8,40.4,-11.8,40.6,-12.6,40.6,-14.2,40.8,-14.7,40.5,-15.4,40.1,-16.1,39.5,-16.7,38.5,-17.1,37.4,-17.6,36.3,-18.7,35.9,-18.8,35.2,-19.5,34.8,-19.8,34.7,-20.5,35.2,-21.3,35.4,-21.8,35.5,-23.1,35.4,-23.5,35.5,-24.1,35,-24.5,34.2,-24.8,33,-25.3,32.6,-25.7,32.7,-26.1,32.8,-26.7,32.6,-27.5,32.5,-28.3,32.2,-28.8,31.5,-29.3,30.9,-29.9,30.6,-30.4,30.1,-31.1,28.9,-32.2,28.2,-32.8,27.5,-33.2,26.4,-33.6,25.9,-33.7,25.2,-33.8,24.7,-34,23.6,-33.8,23,-33.9,22.6,-33.9,21.5,-34.3,20.7,-34.4,20.1,-34.8,19.6,-34.8,19.2,-34.5,18.4,-34,18.3,-33.3,17.9,-32.6,18.2,-31.7,17.6,-30.7,17.1,-29.9,16.3,-28.6,15.6,-27.8,15.2,-27.1,15,-26.1,14.7,-25.3,14.4,-23.9,14.4,-22.7,14.3,-22.1,13.9,-21.7,13.4,-20.9,12.8,-19.7,12.6,-19,11.8,-18.1,11.7,-17.3,11.6,-16.7,11.8,-15.8,12.1,-14.9,12.2,-14.4,12.5,-13.5,12.7,-13.1,13.3,-12.5,13.6,-12,13.7,-11.2,13.7,-10.7,13.4,-10.4,13.1,-9.8,12.9,-9.2,13.2,-8.6,12.9,-7.6,12.7,-6.9,12.2,-6.3,12.2,-5.8,11.9,-5,11.1,-4,10.1,-3,9.4,-2.1,8.8,-1.1,9,-.5,9.3,.3,9.5,1,9.6,2.3,9.8,3.1,9.4,3.7,8.9,3.9,8.7,4.4,8.5,4.8,7.5,4.4,7.1,4.5,6.7,4.2,5.9,4.3,5.4,4.9,5,5.6,4.3,6.3,3.6,6.3,2.7,6.3,1.9,6.1,1.1,5.9,-.5,5.3,-1.1,5,-2,4.7,-2.9,5,-3.3,5,-4,5.2,-4.6,5.2,-5.8,5,-6.5,4.7,-7.5,4.3,-8,4.4,-9,4.8,-9.9,5.6,-10.8,6.1,-11.4,6.8,-12.4,7.3,-12.9,7.8,-13.1,8.2,-13.2,8.9,-13.7,9.5,-14.1,9.9,-14.6,10.2,-14.7,10.7,-15.1,11,-15.7,11.5,-16.1,11.5,-16.3,12,-16.7,12.4,-16.8,13.2,-16.7,13.6,-17.1,14.4,-17.6,14.7,-17.2,14.9,-16.7,15.6,-16.5,16.1,-16.6,16.8,-16.3,17.2,-16.1,18.1,-16.3,19.1,-16.4,19.6,-16.3,20.1,-16.5,20.6,-17.1,21,-17,21.4,-17,21.9,-16.6,22.2,-16.3,22.7,-16,23.7,-15.4,24.4,-14.8,25.1,-14.8,25.6,-14.4,26.3,-13.8,26.6,-13.1,27.6,-12.6,28,-11.7,28.1,-10.9,28.8,-10.4,29.1,-9.6,29.9,-9.8,31.2,-9.4,32,-9.3,32.6,-8.7,33.2,-7.7,33.7,-6.9,34.1,-6.2,35.1,-5.9,35.8,-5.2,35.8,-4.6,35.3,-3.6,35.4,-2.6,35.2,-2.2,35.2,-1.2,35.7,-.1,35.9,.5,36.3,1.5,36.6,3.2,36.8,4.8,36.9,5.3,36.7,6.3,37.1,7.3,37.1,7.7,36.9,8.4,36.9,9.5,37.4,10.2,37.2,10.2,36.7,11,37.1,10.6,36.4,10.6,35.9,10.8,34.8,10.2,34.3,10.3,33.8,10.9,33.8,11.1,33.3,11.5,33.1,12.7,32.8,13.1,32.9,13.9,32.7,15.2,32.3,15.7,31.4,16.6,31.2,18,30.8,19.1,30.3,19.6,30.5,20.1,31,19.8,31.8,20.1,32.2,20.9,32.7,21.5,32.8,22.9,32.6,23.2,32.2,23.6,32.2,24.9,31.9,26.5,31.6,27.5,31.3,28.4,31,28.9,30.9,29.7,31.2,30.1,31.5,31,31.6,31.7,31.4,32,30.9,33,31,33.8,31,34.3,31.2,34.5,31.6,34.8,32.1,35,32.8,35.5,33.9,36,34.6,35.9,35.4,36.1,35.8,35.8,36.3,36.2,36.7,35.6,36.6,34.7,36.8,34,36.2,32.5,36.1,31.7,36.6,30.6,36.7,30.4,36.3,29.7,36.1,28.7,36.7,27.6,36.7,27,37.7,26.3,38.2,26.8,39,26.2,39.5,27.3,40.4,28.8,40.5,29.2,41.2,31.1,41.1,32.3,41.7,33.5,42,35.2,42,36.9,41.3,38.3,40.9,39.5,41.1,40.4,41,41.6,41.5,41.7,42,41.5,42.6,40.9,43,40.3,43.1,40,43.4,38.7,44.3,37.5,44.7,36.7,45.2,37.4,45.4,38.2,46.2,37.7,46.6,39.1,47,38.2,47.1,37.4,47,36.8,46.7,35.8,46.6,35,46.3,35,45.7,35.5,45.4,36.5,45.5,36.3,45.1,35.2,44.9,33.9,44.4,33.3,44.6,33.5,45,32.5,45.3,33.6,45.9,31.7,46.3,31.7,46.7,30.7,46.6,30.4,46,29.6,45.3,29.1,44.8,28.6,43.7,28,43.3,27.7,42.6,28,42,28.1,41.6,29,41.3,27.6,41,27.2,40.7,26.4,40.2,26,40.6,25.4,40.9,24.9,40.9,23.7,40.7,24.4,40.1,23.9,40,23.3,40,22.8,40.5,22.9,39.7,23.4,39.2,23,39,23.5,38.5,24,38.2,24,37.7,23.1,37.9,23.4,37.4,22.8,37.3,23.2,36.4,22.5,36.4,21.7,36.8,21.3,37.6,21.1,38.3,20.7,38.8,20.2,39.3,20,39.7,19.4,40.3,19.3,40.7,19.4,41.4,19.4,41.9,18.9,42.3,18.4,42.5,17.5,42.8,16.9,43.2,16,43.5,15.2,44.2,14.9,44.7,14.3,45.2,14,44.8,13.7,45.5,13.1,45.7,12.3,45.4,12.4,44.9,12.6,44.1,13.5,43.6,14,42.8,15.1,42,15.9,42,15.9,41.5,16.8,41.2,17.5,40.9,18.4,40.4,18.3,39.8,17.7,40.3,16.9,40.4,16.5,39.8,17.2,39.4,17.1,38.9,16.6,38.8,16.1,38,15.7,37.9,15.9,38.8,15.7,39.5,15.4,40,15,40.2,14.7,40.6,14.1,40.8,13.6,41.2,12.9,41.3,12.1,41.7,11.2,42.4,10.5,42.9,10.2,43.9,9.7,44,8.9,44.4,8.4,44.2,7.8,43.8,7.4,43.7,6.5,43.1,4.6,43.4,3.1,43.1,3,42.5,3,41.9,2.1,41.2,.8,41,.1,40.1,-.3,39.3,.1,38.7,-.5,38.3,-.7,37.6,-1.4,37.4,-2.1,36.7,-3.4,36.7,-4.4,36.7,-5,36.3,-5.4,35.9,-5.9,36,-6.2,36.4,-6.5,36.9,-7.5,37.1,-7.9,36.8,-8.4,37,-8.9,36.9,-8.7,37.7,-8.8,38.3,-9.3,38.4,-9.5,38.7,-9.4,39.4,-9,39.8,-9,40.2,-8.8,40.8,-8.8,41.2,-9,41.5,-9,42.6,-9.4,43,-8,43.7,-6.8,43.6,-5.4,43.6,-4.3,43.4,-3.5,43.5,-1.9,43.4,-1.4,44,-1.2,46,-2.2,47.1,-3,47.6,-4.5,48,-4.6,48.7,-3.3,48.9,-1.6,48.6,-1.9,49.8,-1,49.3,1.3,50.1,1.6,50.9,2.5,51.1,3.3,51.3,3.8,51.6,4.7,53.1,6.1,53.5,6.9,53.5,7.9,53.7,8.8,54,8.6,54.4,8.5,55,8.1,55.5,8.1,56.5,8.5,57.1,9.4,57.2,9.8,57.4,10.6,57.7,10.5,57.2,10.4,56.6,10.9,56.5,10.7,56.1,9.6,55.5,9.9,55,9.9,54.6,10.9,54.4,10.9,54,12,54.2,12.5,54.5,13.6,54.1,14.1,53.8,14.8,54.1,16.4,54.5,17.6,54.9,18.6,54.7,19.7,54.4,19.9,54.9,21.3,55.2,21.1,56,21.1,56.8,21.6,57.4,22.5,57.8,23.3,57,24.1,57,24.3,57.8,24.4,58.4,24.1,58.3,23.4,58.6,23.3,59.2,24.6,59.5,25.9,59.6,26.9,59.4,28,59.5,29.1,60,28.1,60.5,26.3,60.4,24.5,60.1,22.9,59.8,22.3,60.4,21.3,60.7,21.5,61.7,21.1,62.6,21.5,63.2,22.4,63.8,24.7,64.9,25.4,65.1,25.3,65.5,23.9,66,22.2,65.7,21.2,65,21.4,64.4,19.8,63.6,17.8,62.7,17.1,61.3,17.8,60.6,18.8,60.1,17.9,59,16.8,58.7,16.4,57,15.9,56.1,14.7,56.2,14.1,55.4,12.9,55.4,12.6,56.3,11.8,57.4,11,58.9,10.4,59.5,8.4,58.3,7.1,58.1,5.7,58.6,5.3,59.7,5,62,5.9,62.6,8.6,63.5,10.5,64.5,12.4,65.9,14.8,67.8,16.4,68.6,19.2,69.8,21.4,70.3,23,70.2,24.5,71,26.4,71,28.2,71.2,31.3,70.5,30,70.2,31.1,69.6,32.1,69.9,33.8,69.3,36.5,69.1,40.3,67.9,41.1,67.5,41.1,66.8,40,66.3,38.4,66,33.9,66.8,33.2,66.6,34.8,65.9,34.9,64.4,36.2,64.1,37,63.9,37.1,64.3,36.5,64.8,37.2,65.1,39.6,64.5,40.4,64.8,39.8,65.5,42.1,66.5,43,66.4,44,66.1,44.5,66.8,43.7,67.4,44.2,68,43.5,68.6,46.3,68.2,46.8,67.7,45.6,67.6,45.6,67,46.3,66.7,47.9,66.9,48.1,67.5,50.2,68,53.7,68.9,54.5,68.8,53.5,68.2,54.7,68.1,55.4,68.4,57.3,68.5,58.8,68.9,59.9,68.3,61.1,68.9,60,69.5,60.6,69.9,63.5,69.5,64.9,69.2,68.5,68.1,69.2,68.6,68.2,69.1,66.9,69.5,67.3,69.9,66.7,70.7,68.5,71.9,69.2,72.8,69.9,73,72.6,72.8,72.8,72.2,71.8,71.4,72.5,71.1,72.8,70.4,72.6,69,73.7,68.4,73.2,67.7,71.3,66.3,72.4,66.2,72.8,66.5,73.9,66.8,74.2,67.3,75.1,67.8,74.5,68.3,74.9,69,73.8,69.1,73.6,69.6,74.4,70.6,73.1,71.4,74.9,72.1,74.7,72.8,75.2,72.9,75.7,72.3,75.3,71.3,76.4,71.2,75.9,71.9,77.6,72.3,79.7,72.3,81.5,71.7,80.6,72.6,80.5,73.6,82.3,73.9,84.7,73.8,86.8,73.9,86,74.5,87.2,75.1,88.3,75.1,90.3,75.6,92.9,75.8,95.9,76.1,96.7,75.9,98.9,76.4,100.8,76.4,101,76.9,102,77.3,104.4,77.7,106.1,77.4,104.7,77.1,107,77,107.2,76.5,108.2,76.7,111.1,76.7,113.3,76.2,114.1,75.8,113.9,75.3,112.8,75,110.2,74.5,109.4,74.2,110.6,74,112.1,73.8,113,74,113.5,73.3,114,73.6,115.6,73.8,118.8,73.6,119,73.1,123.2,73,123.3,73.7,125.4,73.6,127,73.6,128.6,73,129.1,72.4,128.5,72,129.7,71.2,131.3,70.8,132.3,71.8,133.9,71.4,135.6,71.7,137.5,71.3,138.2,71.6,139.9,71.5,139.1,72.4,140.5,72.8,149.5,72.2,150.4,71.6,153,70.8,157,71,159,70.9,159.8,70.5,159.7,69.7,160.9,69.4,162.3,69.6,164.1,69.7,165.9,69.5,167.8,69.6,169.6,68.7,170.8,69,170,69.7,170.5,70.1,173.6,69.8,175.7,69.9,178.6,69.4,180,69],[49.1,41.3,49.1,41.3,48.6,41.8,47.5,43,47.6,43.7,46.7,44.6,47.7,45.6,48.6,45.8,49.1,46.4,50,46.6,51.2,47,52,46.8,53,46.9,53.2,46.2,53,45.3,52.2,45.4,51.3,45.2,51.3,44.5,50.3,44.3,50.9,44,51.3,43.1,52.7,42.4,52.5,41.8,52.8,41.1,52.9,41.9,53.7,42.1,54,41.6,54.7,41,53.9,40.6,52.9,40.9,52.7,40,53.4,40,53.1,39.3,53.9,39,53.7,37.9,53.8,37,52.3,36.7,50.8,36.9,50.1,37.4,49.2,37.6,48.9,38.3,48.9,38.8,49.2,39,49.4,39.4,49.6,40.2,50.1,40.5,49.6,40.6],[-95.6,69.1,-96.3,68.8,-97.6,69.1,-98.4,69,-99.8,69.4,-98.9,69.7,-98.2,70.1,-97.2,69.9,-96.6,69.7,-95.6,69.1],[180,71.5,180,70.8,178.9,70.8,180,71.5],[-180,71.5,-179,71.6,-177.6,71.3,-178.7,70.9,-180,70.8,-180,71.5],[-90.5,69.5,-90.5,68.5,-89.2,69.3,-88,68.6,-88.3,67.9,-87.3,67.2,-86.3,67.9,-85.6,68.8,-85.5,69.9,-84.1,69.8,-82.6,69.7,-81.3,69.2,-81.2,68.7,-82,68.1,-81.3,67.6,-81.4,67.1,-83.3,66.4,-84.7,66.3,-85.8,66.6,-86.1,66.1,-87,65.2,-87.3,64.8,-88.5,64.1,-89.9,64,-90.7,63.6,-90.8,63,-91.9,62.8,-93.2,62,-94.2,60.9,-94.6,60.1,-94.7,58.9,-93.2,58.8,-92.8,57.8,-92.3,57.1,-90.9,57.3,-89,56.9,-88,56.5,-87.3,56,-86.1,55.7,-85,55.3,-83.4,55.2,-82.3,55.1,-82.4,54.3,-82.1,53.3,-81.4,52.2,-79.9,51.2,-79.1,51.5,-78.6,52.6,-79.1,54.1,-79.8,54.7,-78.2,55.1,-77.1,55.8,-76.5,56.5,-76.6,57.2,-77.3,58.1,-78.5,58.8,-77.3,59.9,-77.8,60.8,-78.1,62.3,-77.4,62.6,-75.7,62.3,-74.7,62.2,-73.8,62.4,-72.9,62.1,-71.7,61.5,-71.4,61.1,-69.6,61.1,-69.6,60.2,-69.3,59,-68.4,58.8,-67.7,58.2,-66.2,58.8,-65.2,59.9,-64.6,60.3,-63.8,59.4,-62.5,58.2,-61.4,57,-61.8,56.3,-60.5,55.8,-59.6,55.2,-58,54.9,-57.3,54.6,-56.9,53.8,-56.2,53.6,-55.8,53.3,-55.7,52.1,-56.4,51.8,-57.1,51.4,-58.8,51.1,-60,50.2,-61.7,50.1,-63.9,50.3,-65.4,50.3,-66.4,50.2,-67.2,49.5,-68.5,49.1,-70,47.7,-71.1,46.8,-70.3,47,-68.7,48.3,-66.6,49.1,-65.1,49.2,-64.2,48.7,-65.1,48.1,-64.8,47,-64.5,46.2,-63.2,45.7,-61.5,45.9,-60.5,47,-60.5,46.3,-59.8,45.9,-61,45.3,-63.3,44.7,-64.2,44.3,-65.4,43.5,-66.1,43.6,-66.2,44.5,-64.4,45.3,-66,45.3,-67.1,45.1,-68,44.3,-69.1,44,-70.1,43.7,-70.7,43,-70.8,42.3,-70.5,41.8,-70.1,41.8,-70.2,42.1,-70,41.6,-70.6,41.5,-71.1,41.5,-71.9,41.3,-72.3,41.3,-72.9,41.2,-73.7,40.9,-72.2,41.1,-73.3,40.6,-74,40.6,-74.2,39.7,-74.9,38.9,-75.5,39.5,-75.3,39,-75.1,38.4,-75.4,38,-75.9,37.2,-75.7,37.9,-76.2,38.3,-76.4,39.1,-76.5,38.7,-76.3,38.1,-77,38.2,-76.3,37.9,-76.3,37,-75.9,36.6,-75.7,35.6,-76.4,34.8,-77.4,34.5,-78.1,33.9,-78.6,33.9,-79.1,33.5,-80.3,32.5,-80.9,32,-81.3,31.4,-81.5,30.7,-81.3,30,-81,29.2,-80.5,28.5,-80.5,28,-80.1,26.9,-80.1,26.2,-80.1,25.8,-80.4,25.2,-81.2,25.2,-81.3,25.6,-81.7,25.9,-82.2,26.7,-82.7,27.5,-82.9,27.9,-82.7,28.6,-82.9,29.1,-83.7,29.9,-84.1,30.1,-85.1,29.6,-85.8,30.2,-86.4,30.4,-87.5,30.3,-88.4,30.4,-89.2,30.3,-89.6,30.2,-89.4,29.5,-90.2,29.1,-90.9,29.1,-91.6,29.7,-92.5,29.6,-93.2,29.8,-93.8,29.7,-94.7,29.5,-95.6,28.7,-96.6,28.3,-97.1,27.8,-97.4,27.4,-97.4,26.7,-97.3,26.2,-97.5,25,-97.7,24.3,-97.8,22.9,-97.9,22.4,-97.7,21.9,-97.4,21.4,-97.2,20.6,-96.5,19.9,-96.3,19.3,-95.9,18.8,-94.8,18.6,-94.4,18.1,-93.5,18.4,-92.8,18.5,-92,18.7,-91.4,18.9,-90.8,19.3,-90.5,19.9,-90.5,20.7,-89.6,21.3,-88.5,21.5,-87.7,21.5,-87.1,21.5,-86.8,20.8,-87.4,20.3,-87.6,19.6,-87.6,19,-87.8,18.3,-88.3,18.5,-88.1,18.1,-88.3,17.6,-88.3,17.1,-88.4,16.5,-88.7,16.2,-88.6,15.7,-88.2,15.7,-87.6,15.9,-86.9,15.8,-86.4,15.8,-86,16,-85.4,15.9,-85,16,-84.5,15.9,-84.1,15.6,-83.4,15.3,-83.2,14.9,-83.2,14.3,-83.5,13.6,-83.6,13.1,-83.5,12.4,-83.7,11.9,-83.9,11.4,-83.7,10.9,-83.4,10.4,-83,10,-82.5,9.6,-82.2,9.2,-81.8,9,-81.4,8.8,-80.9,8.9,-80.5,9.1,-79.9,9.3,-79,9.6,-78.5,9.4,-78.1,9.2,-77.4,8.7,-76.8,8.6,-76.1,9.3,-75.7,9.4,-75.5,10.6,-74.9,11.1,-74.3,11.1,-73.4,11.2,-72.6,11.8,-72.2,12,-71.8,12.4,-71.4,12.4,-71.3,11.9,-71.9,11.4,-71.6,11,-71.6,10.4,-72.1,9.9,-71.7,9.1,-71.3,9.1,-71,9.9,-71.4,10.2,-71.4,11,-70.2,11.4,-70.3,11.9,-69.6,11.5,-68.9,11.4,-68.2,10.9,-67.3,10.5,-66.2,10.6,-65.7,10.2,-64.9,10.1,-64.3,10.4,-63.1,10.7,-61.9,10.7,-62.7,10.4,-62.4,9.9,-61.6,9.9,-60.8,9.4,-60.7,8.6,-60.2,8.6,-59.8,8.4,-59.1,8,-58.5,7.3,-58.5,6.8,-58.1,6.8,-57.5,6.3,-57.1,6,-55.9,5.8,-55,6,-54,5.8,-52.9,5.4,-51.8,4.6,-51.7,4.2,-51.1,3.6,-50.5,1.9,-50,1.7,-49.9,1,-50.7,.2,-48.6,-.2,-48.6,-1.2,-47.8,-.6,-46.6,-.9,-44.9,-1.6,-44.4,-2.1,-44.6,-2.7,-43.4,-2.4,-41.5,-2.9,-40,-2.9,-38.5,-3.7,-37.2,-4.8,-36.5,-5.1,-35.6,-5.1,-35.2,-5.5,-34.9,-6.7,-34.7,-7.3,-35.1,-9,-35.6,-9.6,-37,-11,-37.7,-12.2,-38.4,-13,-39,-13.8,-38.9,-15.7,-39.2,-17.2,-39.3,-17.9,-39.6,-18.3,-39.8,-19.5,-40.8,-20.9,-40.9,-21.8,-41.8,-22.4,-42,-23,-43.1,-23,-44.6,-23.4,-45.4,-23.8,-46.5,-24.1,-47.6,-24.9,-48.5,-25.9,-48.6,-26.6,-48.5,-27.2,-48.7,-28.2,-48.9,-28.7,-49.6,-29.2,-50.7,-31,-51.6,-31.8,-52.3,-32.2,-52.7,-33.2,-53.4,-33.8,-53.8,-34.4,-54.9,-35,-55.7,-34.8,-56.2,-34.9,-57.1,-34.4,-57.8,-34.5,-58.4,-33.9,-58.5,-34.4,-57.2,-35.3,-57.4,-36,-56.7,-36.4,-56.8,-36.9,-57.7,-38.2,-59.2,-38.7,-61.2,-38.9,-62.3,-38.8,-62.1,-39.4,-62.3,-40.2,-62.1,-40.7,-62.7,-41,-63.8,-41.2,-64.7,-40.8,-65.1,-41.1,-65,-42.1,-64.3,-42.4,-63.8,-42,-63.5,-42.6,-64.4,-42.9,-65.2,-43.5,-65.3,-44.5,-65.6,-45,-66.5,-45,-67.3,-45.6,-67.6,-46.3,-66.6,-47,-65.6,-47.2,-66,-48.1,-67.2,-48.7,-67.8,-49.9,-68.7,-50.3,-69.1,-50.7,-68.8,-51.8,-68.2,-52.4,-68.6,-52.3,-69.5,-52.3,-69.9,-52.5,-70.8,-52.9,-71,-53.8,-71.4,-53.9,-72.6,-53.5,-73.7,-52.8,-74.9,-52.3,-75.3,-51.6,-75,-51,-75.5,-50.4,-75.6,-48.7,-75.2,-47.7,-74.1,-46.9,-75.6,-46.6,-74.7,-45.8,-74.4,-44.1,-73.2,-44.5,-72.7,-42.4,-73.4,-42.1,-73.7,-43.4,-74.3,-43.2,-74,-41.8,-73.7,-39.9,-73.2,-39.3,-73.5,-38.3,-73.6,-37.2,-73.2,-37.1,-72.6,-35.5,-71.9,-33.9,-71.4,-32.4,-71.7,-30.9,-71.4,-30.1,-71.5,-28.9,-70.9,-27.6,-70.7,-25.7,-70.4,-23.6,-70.1,-21.4,-70.2,-19.8,-70.4,-18.3,-71.4,-17.8,-71.5,-17.4,-73.4,-16.4,-75.2,-15.3,-76,-14.6,-76.4,-13.8,-77.1,-12.2,-78.1,-10.4,-79,-8.4,-79.4,-7.9,-79.8,-7.2,-80.5,-6.5,-81.3,-6.1,-80.9,-5.7,-81.4,-4.7,-81.1,-4,-80.3,-3.4,-79.8,-2.7,-80,-2.2,-80.4,-2.7,-81,-2.2,-80.9,-1.1,-80.4,-.3,-80,.4,-80.1,.8,-79.5,1,-78.9,1.4,-78.6,1.8,-78.7,2.3,-78.4,2.6,-77.9,2.7,-77.5,3.3,-77.1,3.8,-77.5,4.1,-77.3,4.7,-77.5,5.6,-77.5,6.7,-77.9,7.2,-78.4,8.1,-78.6,8.7,-79.1,9,-79.6,8.9,-80.2,8.3,-80,7.5,-80.4,7.3,-80.9,7.2,-81.1,7.8,-81.5,7.7,-81.7,8.1,-82.1,8.2,-82.8,8.3,-83.5,8.4,-83.6,8.8,-83.9,9.3,-84.3,9.5,-84.7,9.9,-85.1,9.6,-85.7,9.9,-85.8,10.4,-85.9,10.9,-86.1,11.4,-86.5,11.9,-87.2,12.5,-87.7,12.9,-87.3,13,-87.8,13.4,-88.5,13.2,-88.8,13.3,-89.3,13.5,-89.8,13.5,-90.6,13.9,-91.2,13.9,-91.7,14.1,-92.2,14.5,-93.4,15.6,-93.9,15.9,-94.7,16.2,-95.3,16.1,-96.1,15.8,-96.6,15.7,-97.3,15.9,-98,16.1,-98.9,16.7,-99.7,16.8,-100.8,17.2,-101.7,17.6,-102.5,18,-103.5,18.3,-103.9,18.7,-105,19.3,-105.5,19.9,-105.7,20.4,-105.5,20.8,-105.3,21.4,-105.6,21.9,-105.7,22.3,-106,22.8,-106.9,23.9,-107.9,24.5,-108.4,25.2,-109.3,25.6,-109.3,26.4,-109.8,26.7,-110.4,27.2,-110.6,27.9,-111.2,27.9,-111.8,28.5,-112.2,29,-112.8,30,-113.2,30.8,-113.1,31.2,-113.9,31.6,-114.8,31.8,-114.9,31.4,-114.8,30.9,-114.7,30.2,-114.3,29.8,-113.6,29.1,-113.1,28.4,-112.8,27.8,-112.2,27.2,-111.6,26.7,-111.3,25.7,-111,25.3,-110.7,24.8,-110.7,24.3,-110.2,24.3,-109.8,23.9,-109.4,23.4,-109.9,22.8,-110.3,23.4,-111,24,-111.7,24.5,-112.2,24.7,-112.2,25.5,-112.3,26,-112.8,26.3,-113.5,26.8,-113.8,26.9,-114.5,27.1,-115.1,27.7,-114.6,27.7,-114.2,28.1,-114.2,28.6,-114.9,29.3,-115.5,29.6,-115.9,30.2,-116.3,30.8,-116.7,31.6,-117.1,32.5,-117.3,33,-117.9,33.6,-118.4,33.7,-119.1,34.1,-119.4,34.3,-120.4,34.4,-120.7,35.2,-121.7,36.2,-122.5,37.6,-123,38.1,-123.7,39,-123.9,39.8,-124.4,40.3,-124.2,41.1,-124.2,42,-124.5,42.8,-124.1,43.7,-123.9,45.5,-124.1,46.9,-124.4,47.7,-124.7,48.2,-123.1,48,-122.6,47.1,-122.5,48.2,-122.8,49,-124.9,50,-125.6,50.4,-127.4,50.8,-128,51.7,-127.8,52.3,-129.1,52.8,-129.3,53.6,-130.5,54.3,-130.5,54.8,-131.1,55.2,-132,55.5,-132.2,56.4,-133.5,57.2,-134.1,58.1,-135,58.2,-136.6,58.2,-137.8,58.5,-139.9,59.5,-140.8,59.7,-142.6,60.1,-144,60,-145.9,60.5,-147.1,60.9,-148.2,60.7,-148,60,-148.6,59.9,-149.7,59.7,-150.6,59.4,-151.7,59.2,-151.9,59.7,-151.4,60.7,-150.3,61,-151.9,60.7,-152.6,60.1,-154,59.4,-153.3,58.9,-154.2,58.1,-155.3,57.7,-156.3,57.4,-156.6,57,-158.1,56.5,-158.4,56,-159.6,55.6,-160.3,55.6,-161.2,55.4,-162.2,55,-163.1,54.7,-164.8,54.4,-163.8,55,-162.9,55.3,-161.8,55.9,-160.6,56,-160.1,56.4,-158.7,57,-157.7,57.6,-157.6,58.3,-157,58.9,-158.2,58.6,-159.1,58.4,-159.7,58.9,-160,58.6,-160.4,59.1,-161.4,58.7,-162,58.7,-162.1,59.3,-161.9,59.6,-162.5,60,-163.8,59.8,-164.7,60.3,-165.3,60.5,-165.4,61.1,-166.1,61.5,-165.7,62.1,-164.9,62.6,-164.6,63.1,-163.8,63.2,-163.1,63.1,-162.3,63.5,-161.5,63.5,-160.8,63.8,-161,64.2,-161.5,64.4,-160.8,64.8,-161.4,64.8,-162.5,64.6,-163.5,64.6,-165,64.4,-166.4,64.7,-166.8,65.1,-168.1,65.7,-166.7,66.1,-164.5,66.6,-163.7,66.6,-163.8,66.1,-161.7,66.1,-162.5,66.7,-163.7,67.1,-164.4,67.6,-165.4,68,-166.8,68.4,-166.2,68.9,-164.4,68.9,-163.2,69.4,-162.9,69.9,-161.9,70.3,-160.9,70.4,-159,70.9,-158.1,70.8,-156.6,71.4,-155.1,71.1,-154.3,70.7,-153.9,70.9,-152.2,70.8,-150.7,70.4,-149.7,70.5,-147.6,70.2,-145.7,70.1,-144.9,70,-143.6,70.2,-142.1,69.9,-141,69.7,-139.1,69.5,-137.5,69,-136.5,68.9,-135.6,69.3,-134.4,69.6,-132.9,69.5,-131.4,69.9,-129.8,70.2,-129.1,69.8,-128.4,70,-128.1,70.5,-127.4,70.4,-125.8,69.5,-124.4,70.2,-124.3,69.4,-123.1,69.6,-122.7,69.9,-121.5,69.8,-119.9,69.4,-117.6,69,-116.2,68.8,-115.2,68.9,-113.9,68.4,-115.3,67.9,-113.5,67.7,-110.8,67.8,-109.9,68,-108.9,67.4,-107.8,67.9,-108.8,68.3,-108.2,68.7,-107,68.7,-106.1,68.8,-105.3,68.6,-104.3,68,-103.2,68.1,-101.5,67.6,-99.9,67.8,-98.4,67.8,-98.6,68.4,-97.7,68.6,-96.1,68.2,-96.1,67.3,-95.5,68.1,-94.7,68.1,-94.2,69.1,-95.3,69.7,-96.5,70.1,-96.4,71.2,-95.2,71.9,-93.9,71.8,-92.9,71.3,-91.5,70.2,-92.4,69.7,-90.5,69.5],[-114.2,73.1,-114.7,72.7,-112.4,73,-111.1,72.5,-109.9,73,-109,72.6,-108.2,71.7,-107.7,72.1,-108.4,73.1,-107.5,73.2,-106.5,73.1,-105.4,72.7,-104.8,71.7,-104.5,71,-102.8,70.5,-101,70,-101.1,69.6,-102.7,69.5,-102.1,69.1,-102.4,68.8,-104.2,68.9,-106,69.2,-107.1,69.1,-109,68.8,-112,68.6,-113.3,68.5,-113.9,69,-115.2,69.3,-116.1,69.2,-117.3,70,-116.7,70.1,-115.1,70.2,-113.7,70.2,-112.4,70.4,-114.3,70.6,-116.5,70.5,-117.9,70.5,-118.4,70.9,-116.1,71.3,-117.7,71.3,-119.4,71.6,-118.6,72.3,-117.9,72.7,-115.2,73.3,-114.2,73.1],[-104.5,73.4,-105.4,72.8,-106.9,73.5,-105.3,73.6,-104.5,73.4],[-76.3,73.1,-77.3,72.9,-78.4,72.9,-79.5,72.7,-80.9,73.3,-80.8,73.7,-80.4,73.8,-78.1,73.7,-76.3,73.1],[-86.6,73.2,-85.8,72.5,-84.9,73.3,-82.3,73.8,-80.6,72.7,-80.8,72.1,-78.8,72.4,-77.8,72.8,-75.6,72.2,-74.2,71.8,-74.1,71.3,-72.2,71.6,-71.2,70.9,-68.8,70.5,-67.9,70.1,-67,69.2,-68.8,68.7,-66.5,68.1,-64.9,67.8,-63.4,66.9,-61.9,66.9,-62.2,66.2,-63.9,65,-65.1,65.4,-66.7,66.4,-68,66.3,-68.1,65.7,-67.1,65.1,-65.7,64.6,-65.3,64.4,-64.7,63.4,-65,62.7,-66.3,62.9,-68.8,63.7,-67.4,62.9,-66.3,62.3,-68.9,62.3,-71,62.9,-72.2,63.4,-73.4,64.2,-74.8,64.7,-77.7,64.2,-78.6,64.6,-77.9,65.3,-76,65.3,-74,65.5,-74.3,65.8,-73.9,66.3,-72.7,67.3,-72.9,67.7,-73.3,68.1,-74.8,68.6,-76.9,68.9,-76.2,69.1,-77.3,69.8,-78.2,69.8,-79,70.2,-79.5,69.9,-81.3,69.7,-84.9,70,-87.1,70.3,-88.7,70.4,-89.5,70.8,-88.5,71.2,-89.9,71.2,-90.2,72.2,-89.4,73.1,-88.4,73.5,-85.8,73.8,-86.6,73.2],[-100.4,73.8,-99.2,73.6,-97.4,73.8,-98.1,73,-96.5,72.6,-96.7,71.7,-98.4,71.3,-99.3,71.4,-100,71.7,-102.5,72.5,-100.4,72.7,-101.5,73.4,-100.4,73.8],[143.6,73.2,142.1,73.2,140,73.3,140.8,73.8,142.1,73.9,143.5,73.5],[-93.2,72.8,-94.3,72,-95.4,72.1,-96,72.9,-96,73.4,-95.5,73.9,-94.5,74.1,-92.4,74.1,-90.5,73.9,-92,73,-93.2,72.8],[-120.5,71.4,-123.1,70.9,-123.6,71.3,-125.9,71.9,-124.8,73,-123.9,73.7,-124.9,74.3,-121.5,74.4,-120.1,74.2,-117.6,74.2,-116.6,73.9,-115.5,73.5,-116.8,73.2,-119.2,72.5,-120.5,71.8,-120.5,71.4],[150.7,75.1,149.6,74.7,148,74.8,146.1,75.2,148.2,75.3,150.7,75.1],[-93.6,75,-94.2,74.6,-95.6,74.7,-96.8,74.9,-96.3,75.4,-94.9,75.6,-94,75.3,-93.6,75],[145.1,75.6,144.3,74.8,140.6,74.8,139,74.6,137,75.3,137.5,75.9,138.8,76.1,141.5,76.1,145.1,75.6],[-98.5,76.7,-97.7,76.3,-97.7,75.7,-98.2,75,-99.8,74.9,-100.9,75.1,-100.9,75.6,-102.5,75.6,-102.6,76.3,-101.5,76.3,-100,76.6,-98.6,76.6],[-108.2,76.2,-107.8,75.8,-106.9,76,-105.9,76,-105.7,75.5,-106.3,75,-109.7,74.9,-112.2,74.4,-113.7,74.4,-111.8,75.2,-116.3,75,-117.7,75.2,-116.3,76.2,-115.4,76.5,-112.6,76.1,-110.8,75.5,-109.1,75.5,-110.5,76.4,-109.6,76.8,-108.6,76.7,-108.2,76.2],[57.5,70.7,56.9,70.6,53.7,70.8,53.4,71.2,51.6,71.5,51.5,72,52.5,72.2,52.4,72.8,54.4,73.6,53.5,73.8,55.9,74.6,55.6,75.1,57.9,75.6,61.2,76.3,64.5,76.4,66.2,76.8,68.2,76.9,68.9,76.5,68.2,76.2,64.6,75.7,61.6,75.3,58.5,74.3,57,73.3,55.4,72.4,55.6,71.5,57.5,70.7],[-94.7,77.1,-93.6,76.8,-91.6,76.8,-90.7,76.5,-91,76.1,-89.8,75.8,-89.2,75.6,-87.8,75.6,-86.4,75.5,-84.8,75.7,-82.8,75.8,-81.1,75.7,-80.1,75.3,-79.8,74.9,-80.5,74.7,-81.9,74.4,-83.2,74.6,-86.1,74.4,-88.1,74.4,-89.8,74.5,-92.4,74.8,-92.8,75.4,-92.9,75.9,-93.9,76.3,-96,76.4,-97.1,76.8,-96.7,77.2,-94.7,77.1],[-116.2,77.6,-116.3,76.9,-117.1,76.5,-118,76.5,-119.9,76.1,-121.5,75.9,-122.9,76.1,-121.2,76.9,-119.1,77.5,-117.6,77.5,-116.2,77.6],[-93.8,77.5,-94.3,77.5,-96.2,77.6,-94.4,77.8,-93.7,77.6],[-110.2,77.7,-112.1,77.4,-113.5,77.7,-112.7,78.1,-111.3,78.2,-109.9,78],[24.7,77.9,22.5,77.4,20.7,77.7,21.4,77.9,20.8,78.3,22.9,78.5,23.3,78.1,24.7,77.9],[-109.7,78.6,-110.9,78.4,-112.5,78.4,-111.5,78.9,-111,78.8,-109.7,78.6],[-95.8,78.1,-97.3,77.8,-98.1,78.1,-98.6,78.5,-98.6,78.9,-97.3,78.8,-96.8,78.8,-95.6,78.4,-95.8,78.1],[-100.1,78.3,-99.7,77.9,-101.3,78,-102.9,78.3,-105.2,78.4,-104.2,78.7,-105.4,78.9,-105.5,79.3,-103.5,79.2,-100.8,78.8,-100.1,78.3],[105.1,78.3,99.4,77.9,101.3,79.2,102.1,79.3,102.8,79.3,105.4,78.7,105.1,78.3],[18.3,79.7,21.5,79,19,78.6,18.5,77.8,17.6,77.6,17.1,76.8,15.9,76.8,13.8,77.4,14.7,77.7,13.2,78,11.2,78.9,10.4,79.7,13.2,80,13.7,79.7,15.1,79.7,15.5,80,17,80.1,18.3,79.7],[25.4,80.4,27.4,80.1,25.9,79.5,23,79.4,20.1,79.6,18.5,79.9,17.4,80.3,20.5,80.6,21.9,80.4,22.9,80.7,25.4,80.4],[51.1,80.5,49.8,80.4,48.9,80.3,47.6,80,46.5,80.2,47.1,80.6,44.8,80.6,46.8,80.8,48.3,80.8,49.1,80.8,50,80.9,51.5,80.7,51.1,80.5],[99.9,78.9,97.8,78.8,95,79,93.3,79.4,92.5,80.1,91.2,80.3,93.8,81,95.9,81.3,97.9,80.7,100.2,79.8,99.9,78.9],[-87,79.7,-85.8,79.3,-87.2,79,-89,78.3,-90.8,78.2,-92.9,78.3,-94,78.8,-93.9,79.1,-93.1,79.4,-95,79.4,-96.1,79.7,-96.7,80.2,-96,80.6,-95.3,80.9,-94.3,81,-94.7,81.2,-92.4,81.3,-91.1,80.7,-89.4,80.5,-87.8,80.3,-87,79.7],[-68.5,83.1,-65.8,83,-63.7,82.9,-61.9,82.6,-64.3,81.9,-66.8,81.7,-67.7,81.5,-65.5,81.5,-67.8,80.9,-69.5,80.6,-71.2,79.8,-73.2,79.6,-73.9,79.4,-76.9,79.3,-75.5,79.2,-76.2,79,-75.4,78.5,-76.3,78.2,-77.9,77.9,-78.4,77.5,-79.8,77.2,-77.9,77,-80.6,76.2,-83.2,76.5,-86.1,76.3,-87.6,76.4,-89.5,76.5,-89.6,77,-87.8,77.2,-88.3,77.9,-87.6,78,-85,77.5,-86.3,78.2,-88,78.4,-87.2,78.8,-85.4,79,-86.5,79.7,-86.9,80.3,-84.2,80.2,-83.4,80.1,-81.8,80.5,-84.1,80.6,-87.6,80.5,-89.4,80.9,-90.2,81.3,-91.4,81.6,-90.1,82.1,-88.9,82.1,-87,82.3,-85.5,82.7,-84.3,82.6,-83.2,82.3,-82.4,82.9,-81.1,83,-79.3,83.1,-76.3,83.2,-75.7,83.1,-72.8,83.2,-70.7,83.2,-68.5,83.1],[-27.1,83.5,-20.8,82.7,-22.7,82.3,-26.5,82.3,-31.9,82.2,-31.4,82,-27.9,82.1,-24.8,81.8,-22.9,82.1,-22.1,81.7,-23.2,81.2,-20.6,81.5,-15.8,81.9,-12.8,81.7,-12.2,81.3,-16.3,80.6,-16.8,80.3,-20,80.2,-17.7,80.1,-18.9,79.4,-19.7,78.8,-19.7,77.6,-18.5,77,-20,76.9,-21.7,76.6,-19.8,76.1,-19.6,75.2,-20.7,75.2,-19.4,74.3,-21.6,74.2,-20.4,73.8,-20.8,73.5,-22.2,73.3,-23.6,73.3,-22.3,72.6,-22.3,72.2,-24.3,72.6,-24.8,72.3,-23.4,72.1,-22.1,71.5,-21.8,70.7,-23.5,70.5,-24.3,70.9,-25.5,71.4,-25.2,70.8,-26.4,70.2,-23.7,70.2,-22.3,70.1,-25,69.3,-27.7,68.5,-30.7,68.1,-31.8,68.1,-32.8,67.7,-34.2,66.7,-36.4,66,-37,65.9,-38.4,65.7,-39.8,65.5,-40.7,64.8,-40.7,64.1,-41.2,63.5,-42.8,62.7,-42.4,61.9,-42.9,61.1,-43.4,60.1,-44.8,60,-46.3,60.9,-48.3,60.9,-49.2,61.4,-49.9,62.4,-51.6,63.6,-52.1,64.3,-52.3,65.2,-53.7,66.1,-53.3,66.8,-54,67.2,-53,68.4,-51.5,68.7,-51.1,69.1,-50.9,69.9,-52,69.6,-52.6,69.4,-53.5,69.3,-54.7,69.6,-54.8,70.3,-54.4,70.8,-53.4,70.8,-51.4,70.6,-53.1,71.2,-54,71.5,-55,71.4,-55.8,71.7,-54.7,72.6,-55.3,73,-56.1,73.7,-57.3,74.7,-58.6,75.1,-58.6,75.5,-61.3,76.1,-63.4,76.2,-66.1,76.1,-68.5,76.1,-69.7,76.4,-71.4,77,-68.8,77.3,-66.8,77.4,-71,77.6,-73.3,78,-73.2,78.4,-69.4,78.9,-65.7,79.4,-65.3,79.8,-68,80.1,-67.1,80.5,-63.7,81.2,-62.2,81.3,-62.6,81.8,-60.3,82,-57.2,82.2,-54.1,82.2,-53,81.9,-50.4,82.4,-48,82.1,-46.6,82,-44.5,81.7,-46.9,82.2,-46.8,82.6,-43.4,83.2,-39.9,83.2,-38.6,83.5,-35.1,83.6,-27.1,83.5]];var sn=()=>matchMedia("(prefers-reduced-motion: reduce)").matches||document.documentElement.classList.contains("rm"),an=6371,jt=(t,n,e)=>{let r=Math.max(0,Math.min(1,(t-n)/(e-n)));return r*r*(3-2*r)},ni={type:"MultiPolygon",coordinates:Bt.map(t=>{let n=[];for(let e=0;e<t.length;e+=2)n.push([t[e],t[e+1]]);return n.push(n[0]),[n]})},ti=bt(),On={type:"Sphere"},ln=1,Wt=14e3,ei=.4,Gt=18,ii=6,ri=2e3,qn=2.5,oi=380,si=2.5,Dn=6,ai=new Path2D("M0,-10 L1.5,-6.5 L1.5,-2.2 L9,2.2 L9,4 L1.5,2 L1.2,6.6 L4,8.6 L4,10 L0,9 L-4,10 L-4,8.6 L-1.2,6.6 L-1.5,2 L-9,4 L-9,2.2 L-1.5,-2.2 L-1.5,-6.5Z"),e1=(t,n)=>[n,t];function li(t,n,e,r=.6){let i=Math.PI/180,[o,a,s,h]=[t*i,n*i,e*i,r*i],l=Math.asin(Math.sin(o)*Math.cos(h)+Math.cos(o)*Math.sin(h)*Math.cos(s));return[(a+Math.atan2(Math.sin(s)*Math.sin(h)*Math.cos(o),Math.cos(h)-Math.sin(o)*Math.sin(l)))/i,l/i]}var un=class{constructor(n,e){q(this,"canvas",n);q(this,"opts",e);q(this,"ctx");q(this,"projection",Dt().clipAngle(90).precision(.4));q(this,"path");q(this,"rotation",[-150,-25]);q(this,"zoom",1);q(this,"size",{w:1,h:1,dpr:1});q(this,"insets",{top:0,bottom:0});q(this,"flights",[]);q(this,"selected",null);q(this,"hits",[]);q(this,"frame",0);q(this,"lift",0);q(this,"anim",null);q(this,"drag",null);q(this,"lastInteraction",0);q(this,"spinning",!1);q(this,"spinVel",0);q(this,"lastTick",0);q(this,"coast",null);q(this,"moves",[]);q(this,"airports",[]);q(this,"layouts",new Map);this.ctx=n.getContext("2d"),this.path=Ft(this.projection,this.ctx);let{signal:r}=e,i=new ResizeObserver(()=>this.resize());i.observe(n),r.addEventListener("abort",()=>{i.disconnect(),cancelAnimationFrame(this.frame)});let o=new MutationObserver(()=>this.redraw());o.observe(document.documentElement,{attributes:!0,attributeFilter:["data-theme"]}),r.addEventListener("abort",()=>o.disconnect()),matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>this.redraw(),{signal:r}),this.bindInput(r),this.resize()}setFlights(n,e){this.flights=n,this.selected=e,this.redraw()}frameFlight(n,e=!0){if(n.ground){let l=.8*Math.min(this.size.w,this.size.h-this.insets.top-this.insets.bottom)/3.5;this.flyTo(e1(n.lat,n.lon),Math.min(Wt,l*an/this.baseRadius),e);return}let r=[e1(n.lat,n.lon)];n.dep&&r.push(e1(n.dep.lat,n.dep.lon)),n.arr&&r.push(e1(n.arr.lat,n.arr.lon));let i=r.length===1?r[0]:this.midpoint(r),o=Math.max(...r.map(h=>b1(i,h)))+.06,s=.8*Math.min(this.size.w,this.size.h-this.insets.top-this.insets.bottom)/2/(this.baseRadius*Math.sin(Math.min(o,Math.PI/2)));this.flyTo(i,Math.max(ln,Math.min(4,s)),e)}get centre(){return[-this.rotation[0],-this.rotation[1]]}pose(n,e,r=0){this.anim=null,this.rotation=[-n[0],-n[1]],this.zoom=e,this.lift=r,this.redraw()}glide(n,e,r,i){if(sn())return this.pose(n,e,r);this.anim={from:[-this.rotation[0],-this.rotation[1]],to:n,z0:this.zoom,z1:e,l0:this.lift,l1:r,t0:performance.now(),ms:i,pull:!1,easeOut:!0},this.redraw()}overview(n=!0){this.flyTo([-this.rotation[0],-this.rotation[1]],ln,n)}setInsets(n,e){n===this.insets.top&&e===this.insets.bottom||(this.insets={top:n,bottom:e},this.redraw())}zoomBy(n){this.zoomAt(n)}zoomAt(n,e,r){this.anim=null,this.coast=null,this.lift=0;let i=Math.max(ln,Math.min(Wt,this.zoom*n));this.place();let o=e==null||r==null?null:this.projection.invert([e,r]);if(this.zoom=i,o&&isFinite(o[0]))for(let a=0;a<3;a++){this.place();let s=this.projection.invert([e,r]);if(!s||!isFinite(s[0]))break;let h=o[0]-s[0];h>180?h-=360:h<-180&&(h+=360),this.rotation=[this.rotation[0]-h,Math.max(-85,Math.min(85,this.rotation[1]-(o[1]-s[1])))]}this.touch(),this.redraw()}setAirports(n){this.airports=n.filter(e=>isFinite(e.lat)&&isFinite(e.lon))}setIdleSpin(n){this.spinning=n&&!sn(),this.spinning&&this.redraw()}get baseRadius(){return Math.min(this.size.w,this.size.h)*ei}midpoint(n){let e=Math.PI/180,[r,i,o]=[0,0,0];for(let[a,s]of n)r+=Math.cos(s*e)*Math.cos(a*e),i+=Math.cos(s*e)*Math.sin(a*e),o+=Math.sin(s*e);return[Math.atan2(i,r)/e,Math.atan2(o,Math.hypot(r,i))/e]}flyTo(n,e,r){let i=[-n[0],-n[1]];if(!r||sn()){this.rotation=i,this.zoom=e,this.lift=0,this.anim=null,this.redraw();return}let o=[-this.rotation[0],-this.rotation[1]],a=b1(o,n),s=700+Math.min(900,a*500)+Math.min(1100,Math.abs(Math.log(e/this.zoom))*130)+(this.lift?500:0);this.coast=null,this.anim={from:o,to:n,z0:this.zoom,z1:e,l0:this.lift,l1:0,t0:performance.now(),ms:s,pull:!0},this.redraw()}resize(){let n=this.canvas.getBoundingClientRect(),e=Math.min(2,window.devicePixelRatio||1);this.size={w:Math.max(1,n.width),h:Math.max(1,n.height),dpr:e},this.canvas.width=Math.round(this.size.w*e),this.canvas.height=Math.round(this.size.h*e),this.draw()}redraw(){cancelAnimationFrame(this.frame),this.frame=requestAnimationFrame(n=>this.tick(n))}tick(n){let e=this.lastTick?Math.min(100,n-this.lastTick):16;this.lastTick=n;let r=!1;if(this.anim){this.spinVel=0;let i=this.anim,o=Math.min(1,(n-i.t0)/i.ms),a=i.easeOut?1-Math.pow(1-o,3):o<.5?4*o*o*o:1-Math.pow(-2*o+2,3)/2,s=Et(i.from,i.to)(a);this.rotation=[-s[0],-s[1]];let h=i.pull?Math.sin(Math.PI*a)*Math.min(.35,b1(i.from,i.to)/4):0;this.zoom=Math.max(ln,Math.exp(Math.log(i.z0)+(Math.log(i.z1)-Math.log(i.z0))*a)*(1-h)),this.lift=i.l0+(i.l1-i.l0)*a,o<1?r=!0:(this.anim=null,r=this.spinning&&this.zoom<qn)}else if(this.coast&&!this.drag){let i=this.coast,o=Math.exp(-e/oi);this.rotation=[this.rotation[0]+i.vx*e,Math.max(-85,Math.min(85,this.rotation[1]+i.vy*e))],i.vx*=o,i.vy*=o,Math.hypot(i.vx,i.vy)/this.degPerPx()<.015&&(this.coast=null,this.lastInteraction=n),r=!0}else this.spinning&&this.zoom<qn&&!this.drag&&n-this.lastInteraction>ri?(this.spinVel+=(ii-this.spinVel)*Math.min(1,e/500),this.rotation=[this.rotation[0]+this.spinVel*e/1e3,this.rotation[1]],r=!0):this.spinning&&this.zoom<qn&&(this.spinVel=0,r=!0);this.draw(),r?this.frame=requestAnimationFrame(i=>this.tick(i)):this.lastTick=0}css(n,e){return getComputedStyle(this.canvas).getPropertyValue(n).trim()||e}degPerPx(){return 180/Math.PI/(this.baseRadius*this.zoom)}place(){let{w:n,h:e}=this.size,r=this.baseRadius*this.zoom,[i,o]=[n/2,this.insets.top+(e-this.insets.top-this.insets.bottom)/2+this.lift*r];return this.projection.translate([i,o]).scale(r).rotate([this.rotation[0],this.rotation[1],0]),this.projection.clipExtent(this.zoom>3?[[-40,-40],[n+40,e+40]]:null),{r,cx:i,cy:o}}draw(){let{ctx:n}=this,{w:e,h:r,dpr:i}=this.size,{r:o,cx:a,cy:s}=this.place(),h=o/an,l=jt(h,1.2,5);n.setTransform(i,0,0,i,0,0),n.clearRect(0,0,e,r);let u=n.createRadialGradient(a,s,o*.92,a,s,o*1.35);u.addColorStop(0,this.css("--g-glow","rgba(124,194,201,.14)")),u.addColorStop(1,"rgba(0,0,0,0)"),n.fillStyle=u,n.fillRect(0,0,e,r),n.beginPath(),this.path(On),n.fillStyle=this.css("--g-sphere","#12161B"),n.fill(),n.beginPath(),this.path(ti),n.strokeStyle=this.css("--g-grat","rgba(255,255,255,.05)"),n.lineWidth=.7,n.stroke(),n.beginPath(),this.path(ni),n.fillStyle=this.css("--g-land","#1E242B"),n.fill("evenodd"),n.strokeStyle=this.css("--g-edge","#2E3740"),n.lineWidth=.8,n.stroke(),l>0&&(n.save(),n.globalAlpha=l,n.beginPath(),this.path(On),n.fillStyle=this.css("--g-ground",this.css("--g-land","#1E242B")),n.fill(),n.restore()),h>=si&&this.drawAirports(h),n.beginPath(),this.path(On),n.strokeStyle=this.css("--g-rim","rgba(255,255,255,.08)"),n.lineWidth=1,n.stroke(),this.drawFlights(o)}fetchLayout(n){let e=this.opts.layout;if(!e)return;let r=0;for(let o of this.layouts.values())o==="loading"&&r++;if(r>=2)return;this.layouts.set(n,"loading");let i=()=>{this.layouts.set(n,null),setTimeout(()=>this.layouts.delete(n),6e4)};e(n).then(o=>{o&&(o.runways&&o.runways.length||o.taxiways&&o.taxiways.length)?(this.layouts.set(n,o),this.redraw()):i()},i)}drawAirports(n){let{ctx:e}=this,{w:r,h:i}=this.size,o=[-this.rotation[0],-this.rotation[1]],a=Math.hypot(r,i)/2/n+8,s=this.airports.filter(u=>b1(o,[u.lon,u.lat])*an<a);for(let u of s)this.layouts.has(u.icao)||this.fetchLayout(u.icao);if(n<Dn)return;let h=jt(n,Dn,Dn*2.2),l=!1;for(let u of s){let c=this.layouts.get(u.icao);!c||c==="loading"||(this.drawLayout(c,n/1e3,h),l=!0)}l&&(e.save(),e.font=\'10px "Jost", system-ui, sans-serif\',e.textAlign="right",e.fillStyle=this.css("--g-label","rgba(255,255,255,.7)"),e.globalAlpha=.6*h,e.fillText("Airport diagrams \\xA9 OpenStreetMap contributors",r-12,18),e.restore())}drawLayout(n,e,r){var b;let{ctx:i}=this,{w:o,h:a}=this.size,s=g=>this.projection(g),h=(g,M=!1)=>{for(let v=0;v<g.length;v++){let[d,y]=s(g[v]);v?i.lineTo(d,y):i.moveTo(d,y)}M&&i.closePath()},l=(g,M)=>Math.max(M,g*e);i.save(),i.globalAlpha=r,i.lineJoin="round",i.beginPath();for(let g of n.aprons||[])h(g,!0);for(let g of n.apronHoles||[])h(g,!0);i.fillStyle=this.css("--g-apron","#262E36"),i.fill("evenodd"),i.lineCap="round",i.strokeStyle=this.css("--g-twy","#313B44");for(let g of n.taxiways||[])i.beginPath(),h(g.pts),i.lineWidth=l(g.width||(g.kind==="taxilane"?15:23),1.2),i.stroke();let u=this.css("--g-rwy","#56616D");for(let g of n.runways||[])i.beginPath(),h(g.pts),i.lineCap="butt",i.strokeStyle=u,i.lineWidth=l(g.width||45,2.2),i.stroke(),e>.22&&(i.setLineDash([36*e,24*e]),i.strokeStyle=this.css("--g-rwy-mark","rgba(255,255,255,.8)"),i.lineWidth=l(.9,1),i.stroke(),i.setLineDash([]));if(e>.4){i.lineCap="round",i.strokeStyle=this.css("--g-cl","#C9A13A"),i.lineWidth=l(.3,1);for(let g of n.taxiways||[])i.beginPath(),h(g.pts),i.stroke()}i.beginPath();for(let g of n.buildings||[])h(g.pts,!0);i.fillStyle=this.css("--g-bldg","#2D3842"),i.fill();let c=[],f=g=>g[2]>0&&g[0]<o&&g[3]>0&&g[1]<a&&!c.some(M=>g[0]<M[2]&&g[2]>M[0]&&g[1]<M[3]&&g[3]>M[1]),m=(g,M,v,d,y,E,x=3)=>{i.font=E;let I=i.measureText(g).width,R=I+x*2,L=15,$=[M-R/2,v-L/2,M+R/2,v+L/2];return f($)?(c.push($),i.fillStyle=d,i.beginPath(),i.roundRect($[0],$[1],R,L,2.5),i.fill(),i.fillStyle=y,i.textAlign="center",i.textBaseline="middle",i.fillText(g,M,v+.5),!0):!1},p=\'600 10.5px "IBM Plex Mono", ui-monospace, monospace\';if(e>.05){let g=d=>d.trim().toUpperCase().replace(/^0+(?=\\d)/,"").replace(/^(\\d)(?!\\d)/,"0$1"),M=new Map;for(let d of n.runways||[]){let y=String(d.ref||"").split("/").map(g).filter(Boolean);if(!y.length||d.pts.length<2)continue;let E=[...y].sort().join("/"),x=M.get(E)||{ends:y,pts:[]};x.pts.push(d.pts[0],d.pts[d.pts.length-1]),M.set(E,x)}let v=Math.PI/180;for(let d of M.values()){let y=d.pts[0],E=d.pts[1],x=-1;for(let r1=0;r1<d.pts.length;r1++)for(let U=r1+1;U<d.pts.length;U++){let Q=d.pts[r1],V=d.pts[U],c1=(Q[0]-V[0])**2*Math.cos(Q[1]*v)**2+(Q[1]-V[1])**2;c1>x&&(x=c1,y=Q,E=V)}let I=(Math.atan2(Math.sin((E[0]-y[0])*v)*Math.cos(E[1]*v),Math.cos(y[1]*v)*Math.sin(E[1]*v)-Math.sin(y[1]*v)*Math.cos(E[1]*v)*Math.cos((E[0]-y[0])*v))/v+360)%360,R=parseInt(d.ends[0],10)*10,L=Math.abs((I-R+540)%360-180),[$,P]=L<=90?[d.ends[0],d.ends[1]]:[d.ends[1],d.ends[0]],[j,O]=s(y),[F,w]=s(E),z=Math.hypot(F-j,w-O)||1,D=(F-j)/z,H=(w-O)/z,X=16;$&&m($,j-D*X,O-H*X,this.css("--g-rwy-tag","#1D1F22"),"#FFFFFF",p),P&&m(P,F+D*X,w+H*X,this.css("--g-rwy-tag","#1D1F22"),"#FFFFFF",p)}}if(e>.28){let g={};for(let v of n.taxiways||[]){if(!v.ref||v.pts.length<2)continue;let d=v.pts.map(s),y=0;for(let L=1;L<d.length;L++)y+=Math.hypot(d[L][0]-d[L-1][0],d[L][1]-d[L-1][1]);if(y<45)continue;let E=y/2,x=d[0][0],I=d[0][1];for(let L=1;L<d.length;L++){let $=Math.hypot(d[L][0]-d[L-1][0],d[L][1]-d[L-1][1]);if(E<=$){let P=E/($||1);x=d[L-1][0]+(d[L][0]-d[L-1][0])*P,I=d[L-1][1]+(d[L][1]-d[L-1][1])*P;break}E-=$}let R=g[b=v.ref]||(g[b]=[]);R.some(([L,$])=>Math.hypot(L-x,$-I)<170)||m(v.ref,x,I,this.css("--g-twy-tag","#F2C230"),"#111111",\'700 10.5px "Jost", system-ui, sans-serif\')&&R.push([x,I])}}if(e>.85){i.fillStyle=this.css("--g-stand","#9AA7AE");for(let g of n.stands||[]){if(!g.ref)continue;let[M,v]=s(g.pt);M<-20||v<-20||M>o+20||v>a+20||(i.beginPath(),i.arc(M,v,1.8,0,Math.PI*2),i.fillStyle=this.css("--g-stand","#9AA7AE"),i.fill(),m(g.ref,M,v-9,"rgba(0,0,0,0)",this.css("--g-stand","#9AA7AE"),\'500 9.5px "Jost", system-ui, sans-serif\',1))}}i.restore()}drawFlights(n){let{ctx:e}=this,r=this.css("--g-route","#D9B98F"),i=this.css("--g-plane","#C9B39F"),o=this.css("--g-trail","rgba(201,179,159,.35)"),a=this.css("--g-label","rgba(255,255,255,.7)"),s=[-this.rotation[0],-this.rotation[1]],h=f=>b1(s,f)<Math.PI/2-.01,l=this.flights.find(f=>f.callsign===this.selected);e.lineCap="round",e.lineJoin="round";for(let f of this.flights)f===l||f.trail.length<2||(e.beginPath(),this.path({type:"LineString",coordinates:f.trail.map(m=>e1(m[0],m[1]))}),e.strokeStyle=o,e.lineWidth=1,e.stroke());if(l){let f=e1(l.lat,l.lon);l.arr&&(e.beginPath(),this.path({type:"LineString",coordinates:[f,e1(l.arr.lat,l.arr.lon)]}),e.setLineDash([2,5]),e.strokeStyle=r,e.globalAlpha=.55,e.lineWidth=1.2,e.stroke(),e.setLineDash([]),e.globalAlpha=1);let m=l.trail.length>1?l.trail.map(p=>e1(p[0],p[1])):l.dep?[e1(l.dep.lat,l.dep.lon),f]:[];m.length>1&&(e.beginPath(),this.path({type:"LineString",coordinates:m}),e.strokeStyle=r,e.lineWidth=2,e.shadowColor=r,e.shadowBlur=10,e.stroke(),e.shadowBlur=0);for(let p of[l.dep,l.arr]){if(!p||!h(e1(p.lat,p.lon)))continue;let[b,g]=this.projection(e1(p.lat,p.lon));e.beginPath(),e.arc(b,g,3.5,0,Math.PI*2),e.fillStyle=this.css("--g-sphere","#12161B"),e.fill(),e.strokeStyle=r,e.lineWidth=1.5,e.stroke(),e.font=\'600 11px "IBM Plex Mono", monospace\',e.fillStyle=a,e.textAlign="center",e.fillText(p.iata??p.icao,b,g+17)}}this.hits=[];let u=Math.max(.75,Math.min(1.25,.75+n/900)),c=n/an/1e3;for(let f of this.flights){let m=e1(f.lat,f.lon);if(!h(m))continue;let[p,b]=this.projection(m),[g,M]=this.projection(li(f.lat,f.lon,f.heading))??[p,b-1],v=Math.atan2(g-p,-(M-b)),d=f===l;e.save(),e.translate(p,b),e.rotate(v);let y=Math.max(u*(d?1.25:.85),(f.span||36)*c/18);e.scale(y,y),d&&(e.shadowColor=r,e.shadowBlur=14),e.fillStyle=d?r:i,e.globalAlpha=d||!l?1:.75,e.fill(ai),e.restore(),this.hits.push({callsign:f.callsign,x:p,y:b})}}touch(){this.lastInteraction=performance.now(),this.opts.onUserMove?.()}bindInput(n){let e=this.canvas;e.addEventListener("pointerdown",i=>{this.anim=null,this.coast=null,this.drag={x:i.clientX,y:i.clientY,rot:[...this.rotation],moved:!1},this.moves=[{t:performance.now(),x:i.clientX,y:i.clientY}],e.setPointerCapture(i.pointerId)},{signal:n}),e.addEventListener("pointermove",i=>{if(!this.drag)return;let o=i.clientX-this.drag.x,a=i.clientY-this.drag.y;if(Math.abs(o)+Math.abs(a)>3&&(this.drag.moved=!0,e.classList.add("dragging")),!this.drag.moved)return;let s=this.degPerPx(),h=Math.max(.2,Math.cos(-this.rotation[1]*Math.PI/180));this.rotation=[this.drag.rot[0]+o*s/h,Math.max(-85,Math.min(85,this.drag.rot[1]-a*s))];let l=performance.now();for(this.moves.push({t:l,x:i.clientX,y:i.clientY});this.moves.length>2&&l-this.moves[0].t>100;)this.moves.shift();this.touch(),this.redraw()},{signal:n});let r=i=>{if(!this.drag)return;let o=this.drag.moved;if(this.drag=null,e.classList.remove("dragging"),o){let u=performance.now(),c=this.moves,f=c[0],m=c[c.length-1];if(f&&m&&m.t>f.t&&u-m.t<60&&!sn()){let p=(m.x-f.x)/(m.t-f.t),b=(m.y-f.y)/(m.t-f.t);if(Math.hypot(p,b)>.08){let g=this.degPerPx(),M=Math.max(.2,Math.cos(-this.rotation[1]*Math.PI/180)),d=Math.min(1,4/Math.hypot(p,b));this.coast={vx:p*d*g/M,vy:-b*d*g},this.redraw()}}return}let a=e.getBoundingClientRect(),[s,h]=[i.clientX-a.left,i.clientY-a.top],l=null;for(let u of this.hits){let c=Math.hypot(u.x-s,u.y-h);c<Gt&&(!l||c<l.d)&&(l={callsign:u.callsign,d:c})}l&&this.opts.onPick(l.callsign)};e.addEventListener("pointerup",r,{signal:n}),e.addEventListener("pointercancel",()=>this.drag=null,{signal:n}),e.addEventListener("wheel",i=>{i.preventDefault();let o=i.deltaMode===1?i.deltaY*33:i.deltaY,a=e.getBoundingClientRect();this.zoomAt(Math.exp(-Math.max(-300,Math.min(300,o))*.0022),i.clientX-a.left,i.clientY-a.top)},{passive:!1,signal:n}),e.addEventListener("dblclick",i=>{let o=e.getBoundingClientRect();this.zoomAt(2.2,i.clientX-o.left,i.clientY-o.top)},{signal:n}),e.addEventListener("pointermove",i=>{if(this.drag)return;let o=e.getBoundingClientRect(),[a,s]=[i.clientX-o.left,i.clientY-o.top];e.classList.toggle("over-plane",this.hits.some(h=>Math.hypot(h.x-a,h.y-s)<Gt))},{signal:n})}};var ui={A359:64.8,A35K:64.8,A388:79.8,A339:64,A333:60.3,A332:60.3,B77W:64.8,B77L:64.8,B772:60.9,B789:60.1,B788:60.1,B78X:60.1,B744:64.4,B748:68.4,A21N:35.8,A321:35.8,A20N:35.8,A320:35.8,A319:35.8,A19N:35.8,B738:35.8,B38M:35.9,B739:35.8,B39M:35.9,E75L:26,CRJ9:24.9},E1=[["gate","At gate"],["taxiout","Taxi out"],["takeoff","Takeoff"],["cruise","Cruise"],["descent","Descent"],["taxiin","Taxi in"],["arrived","Arrived"]],ci=Object.fromEntries(E1),fi=15e3,a1=t=>document.querySelector(t),G=t=>String(t??"").replace(/[&<>"\']/g,n=>({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\'":"&#39;"})[n]),J=Math.PI/180;function Bn(t,n){let[e,r]=[t[0]*J,n[0]*J],i=r-e,o=(n[1]-t[1])*J,a=Math.sin(i/2)**2+Math.cos(e)*Math.cos(r)*Math.sin(o/2)**2;return 3440.065*2*Math.asin(Math.min(1,Math.sqrt(a)))}function jn(t,n,e){let[r,i,o,a]=[t[0]*J,t[1]*J,n[0]*J,n[1]*J],s=2*Math.asin(Math.sqrt(Math.sin((o-r)/2)**2+Math.cos(r)*Math.cos(o)*Math.sin((a-i)/2)**2));if(s<1e-9)return t;let h=Math.sin((1-e)*s)/Math.sin(s),l=Math.sin(e*s)/Math.sin(s),u=h*Math.cos(r)*Math.cos(i)+l*Math.cos(o)*Math.cos(a),c=h*Math.cos(r)*Math.sin(i)+l*Math.cos(o)*Math.sin(a),f=h*Math.sin(r)+l*Math.sin(o);return[Math.atan2(f,Math.hypot(u,c))/J,Math.atan2(c,u)/J]}function hi(t,n){let[e,r,i]=[t[0]*J,n[0]*J,(n[1]-t[1])*J];return(Math.atan2(Math.sin(i)*Math.cos(r),Math.cos(e)*Math.sin(r)-Math.sin(e)*Math.cos(r)*Math.cos(i))/J+360)%360}var S={apts:{},flights:[],sel:null,upd:"",fetched:0,sample:!1,error:"",loaded:!1,hist:{},trails:{},last:{},timer:0,globe:null,follow:!1};try{S.trails=JSON.parse(sessionStorage.getItem("pmTrails")||"{}")}catch{}function di(t,n,e,r,i){let o=r!=null&&(e==null||r<e);if(t.gs<45&&t.alt<15e3)return o&&r<25||i==="taxiin"||i==="arrived"||i==="descent"?t.gs<3?"arrived":"taxiin":t.gs<3?"gate":"taxiout";let a=t.cruise,s=t.alt>24e3&&(e==null||e>300)&&(r==null||r>250);return n!=null&&n>500?s||a&&t.alt>=a-400?"cruise":"takeoff":n!=null&&n<-500?s?"cruise":"descent":a&&t.alt>=a-1500?"cruise":i==="descent"&&!s?"descent":i==="takeoff"&&!s?"takeoff":r!=null&&r<t.alt/1e3*3.2*1.3+30&&(e==null||r<e)?"descent":e!=null&&e<150+t.alt/1e3*2&&(r==null||e<r)?"takeoff":"cruise"}function Xt(t,n){var o,a,s,h;let e=[],r=new Set;for(let l of t){r.add(l.cs);let u=S.apts[l.dep]??null,c=S.apts[l.arr]??null,f=l.vs??null;if(!l.sample){let v=(o=S.hist)[a=l.cs]||(o[a]=[]);if((!v.length||v[v.length-1].t!==n)&&(v.push({t:n,alt:l.alt}),v.length>3&&v.shift()),v.length>1){let E=v[0],x=v[v.length-1];x.t>E.t&&(f=Math.round((x.alt-E.alt)/(x.t-E.t)*6e4))}let d=(s=S.trails)[h=l.cs]||(s[h]=[]),y=d[d.length-1];(!y||Bn(y,[l.lat,l.lon])>.5)&&(d.push([l.lat,l.lon]),d.length>600&&d.splice(0,d.length-600))}let m=[l.lat,l.lon],p=u?Bn(m,[u.lat,u.lon]):null,b=c?Bn(m,[c.lat,c.lon]):null,g=di(l,f,p,b,S.last[l.cs]);S.last[l.cs]=g;let M=p!=null&&b!=null?Math.max(0,Math.min(1,p/Math.max(1,p+b))):null;e.push({callsign:l.cs,lat:l.lat,lon:l.lon,heading:l.hdg,span:ui[l.ac]||36,ground:l.gs<45&&l.alt<15e3,trail:l.sample?gi(l,u):S.trails[l.cs]||[],dep:u,arr:c,raw:l,phase:g,vs:f,dDep:p,dArr:b,pct:M})}if(!t.some(l=>l.sample)){for(let l of Object.keys(S.trails))r.has(l)||delete S.trails[l];try{sessionStorage.setItem("pmTrails",JSON.stringify(S.trails))}catch{}}let i=Object.fromEntries(E1.map(([l],u)=>[l,u]));return e.sort((l,u)=>i[l.phase]-i[u.phase]||l.callsign.localeCompare(u.callsign))}function gi(t,n){if(!n)return[];let e=[n.lat,n.lon],r=[t.lat,t.lon],i=40,o=[];for(let a=0;a<=i;a++)o.push(jn(e,r,a/i));return o}function Yt(){let t=S.apts,n=(r,i,o,a,s,h,l,u,c,f,m)=>{if(!t[i]||!t[o])return null;let p=[t[i].lat,t[i].lon],b=[t[o].lat,t[o].lon],g=jn(p,b,s),M=jn(p,b,Math.min(1,s+.01)),[v,d,y]=m||[g[0],g[1],s>=1?280:Math.round(hi(g,M))];return{cs:r,cid:0,name:f,lat:v,lon:d,alt:h,gs:l,hdg:y,sq:"2000",logon:Date.now()-(2+s*9)*36e5,ac:a,dep:i,arr:o,cruise:c,fl:"FL"+c/100,rules:"I",altn:"",tas:String(l>200?480:""),dt:"",ete:"",route:"Sample flight: made up for the preview",vs:u,sample:!0}},e=r=>!!r;return[n("PAW102","KSFO","KLAX","A21N",0,13,0,0,33e3,"Sample Pilot",[37.612402,-122.387937,300]),n("PAW810","KSFO","RCTP","A359",0,13,17,0,39e3,"Sample Pilot",[37.61353,-122.381705,28]),n("PAW130","KSFO","KJFK","A21N",.012,7400,245,2600,35e3,"Sample Pilot"),n("PAW806","KSFO","RJTT","A359",.46,37e3,488,0,37e3,"Sample Pilot"),n("PAW902","EGLL","KSFO","A359",.955,18600,360,-1900,39e3,"Sample Pilot"),n("PAW119","KSEA","KSFO","A21N",1,13,16,0,34e3,"Sample Pilot",[37.61901,-122.37933,220]),n("PAW127","KSFO","KBOS","A21N",1,20,0,0,36e3,"Sample Pilot")].filter(e)}async function fn(t=!1){if(clearTimeout(S.timer),!(!t&&(document.hidden||g1()!=="live"))){try{let n=await fetch("/admin/api/live",{credentials:"same-origin",cache:"no-store"}),e=await n.json().catch(()=>null);if(!n.ok||!e)throw new Error(e&&e.error||"HTTP "+n.status);S.apts=Object.fromEntries(Object.entries(e.apts||{}).map(([i,o])=>{let a=o;return[i,{icao:i,lat:a[0],lon:a[1],iata:a[2],city:a[3]}]})),S.upd=e.upd||"",S.fetched=Date.now(),S.error="",S.loaded=!0,S.globe?.setAirports(Object.values(S.apts));let r=e.flights||[];r.length&&(S.sample=!1),S.flights=Xt(r.length||!S.sample?r:Yt(),Date.parse(S.upd)||Date.now())}catch(n){S.error=n.message,S.loaded=!0}if(S.sel&&!S.flights.some(n=>n.callsign===S.sel)&&(S.sel=null),D1(),S.follow){let n=q1();n&&S.globe?.frameFlight(n)}S.timer=window.setTimeout(()=>{fn()},fi)}}var q1=()=>S.flights.find(t=>t.callsign===S.sel)||null,Ht=t=>t>=18e3?"FL"+String(Math.round(t/100)).padStart(3,"0"):t.toLocaleString("en-US")+" ft",pi=t=>{let n=Math.max(0,Math.round(t/6e4));return Math.floor(n/60)+"h "+String(n%60).padStart(2,"0")+"m"},cn=t=>t||"\\xB7\\xB7\\xB7\\xB7";function D1(){let t=S.flights.length,n=a1("#lvCount");if(n&&(n.textContent=S.sample||!t?"":String(t),n.hidden=S.sample||!t),g1()!=="live")return;S.globe?.setFlights(S.flights,S.sel),S.globe?.setIdleSpin(!S.sel);let e=Object.fromEntries(E1.map(([c])=>[c,0]));for(let c of S.flights)e[c.phase]++;a1("#lvSum").innerHTML=E1.map(([c,f])=>`<div class="lv-c ph-${c}${e[c]?"":" z"}"><b>${e[c]}</b><span>${f}</span></div>`).join("");let r=S.upd?Math.max(0,Math.round((Date.now()-Date.parse(S.upd))/1e3)):null;a1("#lvSrc").innerHTML=S.error?`<span class="lv-err">${G(S.error)}</span>`:S.sample?\'<span class="lv-tag">SAMPLE</span> Made-up flights to preview the page \\xB7 <button class="lv-link" data-lv="nosample">Back to live</button>\':`<span class="lv-dot"></span>VATSIM \\xB7 PAW callsigns${r!=null?` \\xB7 network data ${r} s old`:""}`;let i=a1("#lvList");S.loaded?t?i.innerHTML=S.flights.map(c=>{let f=c.raw;return`<button class="lv-f${c.callsign===S.sel?" on":""}" data-cs="${G(c.callsign)}">\n      <span class="lv-cs">${G(c.callsign)}</span><span class="lv-ph ph-${c.phase}">${ci[c.phase]}</span>\n      <span class="lv-rt">${G(cn(f.dep))} <i>\\u2192</i> ${G(cn(f.arr))}<em>${G(f.ac||"")}</em></span>\n      <span class="lv-al">${f.gs<45?f.gs<3?"Parked":f.gs+" kt":Ht(f.alt)+" \\xB7 "+f.gs+" kt"}</span></button>`}).join(""):i.innerHTML=\'<div class="lv-empty"><b>No Polaris flights on VATSIM right now.</b><span>Flights show here as soon as a pilot connects with a PAW callsign, for example PAW806.</span><button data-lv="sample">Preview with sample flights</button></div>\':i.innerHTML=\'<div class="lv-empty">Loading\\u2026</div>\';let o=q1(),a=a1("#lvDet");if(a.hidden=!o,!o){a.innerHTML="";return}let s=o.raw,h=E1.findIndex(([c])=>c===o.phase),l=o.vs==null?"\\u2014":(o.vs>0?"+":"")+o.vs.toLocaleString("en-US")+" fpm",u=o.dArr!=null&&s.gs>80?new Date(Date.now()+o.dArr/s.gs*36e5):null;a.innerHTML=`\n    <div class="lv-dh"><div><b>${G(s.cs)}</b>${s.sample?\'<span class="lv-tag">SAMPLE</span>\':""}<small>${G(s.name||"")}${s.cid?" \\xB7 CID "+s.cid:""}</small></div>\n      <div class="lv-dbtn"><button class="msg" data-lv="msg"${s.sample?\' disabled title="Sample flight: nobody to write to"\':\' title="Write a Polaris Mail message to this pilot"\'}><svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.8 7l8.2 6.2L20.2 7"/></svg>Message</button><button data-lv="follow" aria-pressed="${S.follow}" title="Keep this flight in view">Follow</button><button data-lv="close" aria-label="Close">\\u2715</button></div></div>\n    <div class="lv-od">\n      <div><b>${G(cn(s.dep))}</b><small>${G(o.dep?.city||(s.dep?"":"No flight plan"))}</small></div>\n      <div class="lv-bar"><span style="width:${o.pct==null?0:(o.pct*100).toFixed(1)}%"></span><i style="left:${o.pct==null?0:(o.pct*100).toFixed(1)}%"><svg viewBox="-10 -10 20 20"><path d="M0,-10 L1.5,-6.5 L1.5,-2.2 L9,2.2 L9,4 L1.5,2 L1.2,6.6 L4,8.6 L4,10 L0,9 L-4,10 L-4,8.6 L-1.2,6.6 L-1.5,2 L-9,4 L-9,2.2 L-1.5,-2.2 L-1.5,-6.5Z"/></svg></i></div>\n      <div class="r"><b>${G(cn(s.arr))}</b><small>${G(o.arr?.city||"")}</small></div>\n    </div>\n    <div class="lv-dist">${o.dDep!=null?Math.round(o.dDep).toLocaleString("en-US")+" nm flown":""}${o.dArr!=null?" \\xB7 "+Math.round(o.dArr).toLocaleString("en-US")+" nm to go":""}${u?" \\xB7 ETA "+u.toISOString().slice(11,16)+"Z":""}</div>\n    <ol class="lv-steps">${E1.map(([c,f],m)=>`<li class="${m<h?"done":m===h?"now":""}"><span></span><b>${f}</b></li>`).join("")}</ol>\n    <dl class="lv-kv">\n      <div><dt>Altitude</dt><dd>${s.gs<45?"On ground":Ht(s.alt)}</dd></div>\n      <div><dt>Vertical speed</dt><dd>${l}</dd></div>\n      <div><dt>Ground speed</dt><dd>${s.gs} kt</dd></div>\n      <div><dt>Heading</dt><dd>${String(Math.round(s.hdg)).padStart(3,"0")}\\xB0</dd></div>\n      <div><dt>Planned</dt><dd>${G(s.fl||"\\u2014")}${s.tas?" \\xB7 "+G(s.tas)+" kt":""}</dd></div>\n      <div><dt>Aircraft</dt><dd>${G(s.ac||"\\u2014")}</dd></div>\n      <div><dt>Squawk</dt><dd>${G(s.sq||"\\u2014")}</dd></div>\n      <div><dt>Online</dt><dd>${s.logon?pi(Date.now()-s.logon):"\\u2014"}</dd></div>\n    </dl>\n    ${s.route?`<details class="lv-route"><summary>Route${s.altn?" \\xB7 alternate "+G(s.altn):""}</summary><p>${G(s.route)}</p></details>`:""}`}function g1(){return location.hash==="#live"?"live":"mail"}function Ut(){if(document.querySelector(".deny"))return;let t=g1();document.querySelectorAll("[data-tab]").forEach(r=>r.setAttribute("aria-current",String(r.dataset.tab===t)));let n=a1("#app"),e=a1("#live");if(n&&(n.hidden=t!=="mail"),e&&(e.hidden=t!=="live"),document.body.classList.toggle("on-live",t==="live"),t==="live"){if(!S.globe){let r=a1("#lvGlobe"),i=new AbortController;S.globe=new un(r,{signal:i.signal,onPick:o=>L1(o),layout:mi,onUserMove:()=>{S.follow&&(S.follow=!1,D1())}}),S.globe.pose([-150,28],1)}D1(),fn(!0)}else clearTimeout(S.timer)}async function mi(t){let n=await fetch("/api/efb/airport-layout?icao="+encodeURIComponent(t),{cache:"default"});if(!n.ok)return null;let e=await n.json();return e&&!e.notFound?e:null}function L1(t){S.sel=t,D1();let n=q1();n?S.globe?.frameFlight(n):S.globe?.overview()}document.addEventListener("click",t=>{let n=t.target,e=n.closest("[data-cs]");if(e){L1(e.dataset.cs===S.sel?null:e.dataset.cs);return}let r=n.closest("[data-lv]");if(!r)return;let i=r.dataset.lv;if(i==="in")S.globe?.zoomBy(1.5);else if(i==="out")S.globe?.zoomBy(1/1.5);else if(i==="all")S.follow=!1,L1(null);else if(i==="close")S.follow=!1,L1(null);else if(i==="follow"){S.follow=!S.follow;let o=q1();S.follow&&o&&S.globe?.frameFlight(o),D1()}else if(i==="msg"){let o=q1(),a=window.pmCompose;o&&!o.raw.sample&&a&&a({cs:o.raw.cs,cid:o.raw.cid?String(o.raw.cid):"",name:o.raw.name||""})}else i==="sample"?(S.sample=!0,S.flights=Xt(Yt(),Date.now()),L1("PAW806")):i==="nosample"&&(S.sample=!1,S.sel=null,S.flights=[],S.globe?.overview(),fn(!0))});document.addEventListener("keydown",t=>{t.key==="Escape"&&S.sel&&g1()==="live"&&(S.follow=!1,L1(null))});window.addEventListener("hashchange",Ut);document.addEventListener("visibilitychange",()=>{!document.hidden&&g1()==="live"&&fn(!0)});setInterval(()=>{if(g1()==="live"&&!document.hidden){let t=a1("#lvSrc");if(t&&S.upd&&!S.error&&!S.sample){let n=Math.max(0,Math.round((Date.now()-Date.parse(S.upd))/1e3));t.innerHTML=`<span class="lv-dot"></span>VATSIM \\xB7 PAW callsigns \\xB7 network data ${n} s old`}}},1e3);setInterval(()=>{g1()==="mail"&&!document.hidden&&(async()=>{try{let n=await(await fetch("/admin/api/live",{credentials:"same-origin",cache:"no-store"})).json(),e=a1("#lvCount");if(e){let r=(n.flights||[]).length;e.textContent=r?String(r):"",e.hidden=!r}}catch{}})()},6e4);document.querySelector(".deny")||Ut();})();\n';

// src/mail.js
var MailError = class extends Error {
  static {
    __name(this, "MailError");
  }
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
};
var MAIL_MAX = 300;
var BODY_MAX = 2e4;
var ATT_MAX = 5 * 1024 * 1024;
var ATT_COUNT = 5;
var ATT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"];
var jsonRes = /* @__PURE__ */ __name((body, status, headers) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } }), "jsonRes");
var certs = null;
var b64urlBytes = /* @__PURE__ */ __name((s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}, "b64urlBytes");
var b64urlJson = /* @__PURE__ */ __name((s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s))), "b64urlJson");
async function accessKeys(team, fresh) {
  if (!fresh && certs && Date.now() - certs.at < 36e5) return certs.keys;
  const r = await fetch("https://" + team + "/cdn-cgi/access/certs");
  if (!r.ok) throw new MailError(502, "Could not read the Cloudflare Access keys");
  const j = await r.json();
  certs = { at: Date.now(), keys: j.keys || [] };
  return certs.keys;
}
__name(accessKeys, "accessKeys");
async function accessUser(req, env) {
  const team = String(env.ACCESS_TEAM_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, ""), aud = String(env.ACCESS_AUD || "").trim();
  if (!team || !aud) throw new MailError(503, "The admin is not set up yet: ACCESS_TEAM_DOMAIN and ACCESS_AUD are missing in wrangler.toml");
  const cookie = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const tok = req.headers.get("Cf-Access-Jwt-Assertion") || cookie && cookie[1];
  if (!tok) throw new MailError(401, "Not signed in through Cloudflare Access");
  const parts = tok.split(".");
  if (parts.length !== 3) throw new MailError(401, "Bad sign-in token");
  let head, pay;
  try {
    head = b64urlJson(parts[0]);
    pay = b64urlJson(parts[1]);
  } catch (e) {
    throw new MailError(401, "Bad sign-in token");
  }
  if (head.alg !== "RS256") throw new MailError(401, "Bad sign-in token");
  let jwk = (await accessKeys(team)).find((k) => k.kid === head.kid);
  if (!jwk) jwk = (await accessKeys(team, true)).find((k) => k.kid === head.kid);
  if (!jwk) throw new MailError(401, "Unknown sign-in key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) throw new MailError(401, "Sign-in token signature does not match");
  const auds = Array.isArray(pay.aud) ? pay.aud : [pay.aud];
  if (!auds.includes(aud)) throw new MailError(403, "Sign-in token is for another application");
  if (pay.iss && pay.iss !== "https://" + team) throw new MailError(403, "Sign-in token is from another team");
  if (!pay.exp || pay.exp * 1e3 < Date.now()) throw new MailError(401, "Sign-in has expired; reload the page");
  const email = String(pay.email || "").toLowerCase();
  const extra = String(env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (extra.length && !extra.includes(email)) throw new MailError(403, "This email is not on the admin list");
  return email || "unknown";
}
__name(accessUser, "accessUser");
var memIdx = null;
async function readIndex(kv) {
  const v = await kv.get("mail:v1:index", "json").catch(() => null);
  return Array.isArray(v) ? v : [];
}
__name(readIndex, "readIndex");
async function writeIndex(kv, list) {
  list.sort((a, b) => (b.sendAt || b.t) - (a.sendAt || a.t));
  await kv.put("mail:v1:index", JSON.stringify(list.slice(0, MAIL_MAX)));
  memIdx = null;
}
__name(writeIndex, "writeIndex");
var pub = /* @__PURE__ */ __name((m) => ({ id: m.id, t: m.sendAt || m.t, from: m.from, subject: m.subject, body: m.body, att: (m.att || []).map((a, i) => ({ n: i, name: a.name, type: a.type, size: a.size })), to: m.to ? { cs: m.to.cs || "", cid: m.to.cid || "" } : null, edited: m.edited || 0 }), "pub");
var CS_WINDOW = 24 * 36e5;
async function mailPublic(req, env, h) {
  const kv = env && env.STORE;
  if (!kv) throw new MailError(503, "Storage is not set up");
  if (!memIdx || Date.now() - memIdx.at > 2e4) memIdx = { at: Date.now(), list: await readIndex(kv) };
  const q = new URL(req.url).searchParams, cs = String(q.get("cs") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const cid = String(q.get("cid") || "").replace(/\D/g, "").slice(0, 9), have = new Set(String(q.get("ids") || "").split(",").slice(0, 60));
  const mine = /* @__PURE__ */ __name((m) => !m.to || have.has(m.id) || cid && m.to.cid === cid || cs && m.to.cs === cs && Date.now() - (m.sendAt || m.t) < CS_WINDOW, "mine");
  const now = Date.now(), list = memIdx.list.filter((m) => (m.sendAt || m.t) <= now && mine(m)).slice(0, 100).map(pub);
  let hsh = 2166136261;
  const raw = JSON.stringify(list);
  for (let i = 0; i < raw.length; i++) {
    hsh ^= raw.charCodeAt(i);
    hsh = Math.imul(hsh, 16777619) >>> 0;
  }
  const tag = '"m-' + hsh.toString(36) + '"';
  if ((req.headers.get("If-None-Match") || "") === tag) return new Response(null, { status: 304, headers: { ...h, ETag: tag, "Cache-Control": "no-cache" } });
  return new Response(JSON.stringify({ mails: list, at: (/* @__PURE__ */ new Date()).toISOString() }), { status: 200, headers: { ...h, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", ETag: tag } });
}
__name(mailPublic, "mailPublic");
async function mailAttachment(url, env, h) {
  const kv = env && env.STORE;
  if (!kv) throw new MailError(503, "Storage is not set up");
  const id = String(url.searchParams.get("id") || ""), n = +url.searchParams.get("n") || 0;
  const m = (await readIndex(kv)).find((x) => x.id === id);
  if (!m || (m.sendAt || m.t) > Date.now() || !m.att || !m.att[n]) throw new MailError(404, "No such attachment");
  const a = m.att[n], body = await kv.get("mail:v1:att:" + id + ":" + n, "arrayBuffer");
  if (!body) throw new MailError(404, "No such attachment");
  return new Response(body, { status: 200, headers: { ...h, "Content-Type": a.type, "Content-Disposition": 'inline; filename="' + a.name.replace(/[^\w.\- ]+/g, "_") + '"', "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
__name(mailAttachment, "mailAttachment");
var clean = /* @__PURE__ */ __name((s, n) => String(s == null ? "" : s).replace(/\r\n/g, "\n").slice(0, n), "clean");
async function mailAdmin(req, url, env, opts) {
  const path = url.pathname.replace(/\/+$/, "");
  let who;
  try {
    who = await accessUser(req, env);
  } catch (e) {
    if (path === "/admin") return new Response(ADMIN_HTML.replace("<!--DENIED-->", '<div class="deny"><b>The admin is locked.</b> ' + String(e.message).replace(/[<>&]/g, "") + "</div>"), { status: e.status || 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    return jsonRes({ error: e.message }, e.status || 401);
  }
  if (path === "/admin") return new Response(ADMIN_HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" } });
  if (path === "/admin/live.js") return new Response(LIVE_JS, { status: 200, headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" } });
  if (path === "/admin/api/live") {
    try {
      return jsonRes(opts && opts.live ? await opts.live() : { flights: [], apts: {} });
    } catch (e) {
      return jsonRes({ error: "Live flights are not available right now: " + e.message }, 502);
    }
  }
  const kv = env && env.STORE;
  if (!kv) return jsonRes({ error: "Storage is not set up" }, 503);
  try {
    if (path === "/admin/api/me") return jsonRes({ email: who });
    if (path === "/admin/api/mail" && req.method === "GET") return jsonRes({ mails: (await readIndex(kv)).map((m) => ({ ...pub(m), to: m.to || null, sendAt: m.sendAt || m.t, created: m.t, by: m.by || "" })), now: Date.now() });
    if (path === "/admin/api/mail" && req.method === "POST") {
      if (!/application\/json/.test(req.headers.get("Content-Type") || "")) throw new MailError(415, "Send JSON");
      let b;
      try {
        b = await req.json();
      } catch (e) {
        throw new MailError(400, "Bad body");
      }
      const list = await readIndex(kv), old = b.id ? list.find((m2) => m2.id === b.id) : null;
      if (b.id && !old) throw new MailError(404, "That mail no longer exists");
      const from = clean(b.from, 60).trim(), subject = clean(b.subject, 160).trim(), body = clean(b.body, BODY_MAX).trim();
      if (!from || !subject || !body) throw new MailError(400, "From, subject and message are all needed");
      let to = null;
      if (b.to) {
        const tcs = String(b.to.cs || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10), tcid = String(b.to.cid || "").replace(/\D/g, "").slice(0, 9);
        if (!tcs && !tcid) throw new MailError(400, "Add the pilot's callsign or VATSIM CID");
        to = { cs: tcs, cid: tcid, name: clean(b.to.name, 60).trim() };
      }
      let sendAt = b.sendAt ? Date.parse(b.sendAt) : Date.now();
      if (!isFinite(sendAt)) throw new MailError(400, "The send time is not a date");
      if (old && (old.sendAt || old.t) <= Date.now() && sendAt > Date.now()) sendAt = old.sendAt || old.t;
      const id = old ? old.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const keep = (old && old.att || []).map((a, i) => ({ a, i })).filter((x) => (b.keepAtt || []).includes(x.i));
      const add = Array.isArray(b.newAtt) ? b.newAtt : [];
      if (keep.length + add.length > ATT_COUNT) throw new MailError(400, "At most " + ATT_COUNT + " attachments");
      const files = [];
      for (const x of keep) files.push({ meta: x.a, bytes: await kv.get("mail:v1:att:" + id + ":" + x.i, "arrayBuffer") });
      for (const f of add) {
        const type = String(f.type || ""), name = clean(f.name, 120).trim() || "attachment";
        if (!ATT_TYPES.includes(type)) throw new MailError(400, name + ": only PDF, PNG, JPG, WebP or text files");
        let bin;
        try {
          bin = Uint8Array.from(atob(String(f.data || "")), (c) => c.charCodeAt(0));
        } catch (e) {
          throw new MailError(400, name + ": could not read the file");
        }
        if (bin.length > ATT_MAX) throw new MailError(400, name + ": larger than 5 MB");
        files.push({ meta: { name, type, size: bin.length }, bytes: bin.buffer });
      }
      for (let i = 0; i < files.length; i++) if (files[i].bytes) await kv.put("mail:v1:att:" + id + ":" + i, files[i].bytes);
      for (let i = files.length; i < (old && old.att || []).length; i++) await kv.delete("mail:v1:att:" + id + ":" + i);
      const m = { id, t: old ? old.t : Date.now(), sendAt, from, subject, body, att: files.filter((f) => f.bytes).map((f) => f.meta), to, by: old ? old.by : who };
      if (old) {
        m.edited = Date.now();
        m.editedBy = who;
      }
      await writeIndex(kv, [m, ...list.filter((x) => x.id !== id)]);
      return jsonRes({ ok: true, mail: pub(m) });
    }
    if (path === "/admin/api/mail" && req.method === "DELETE") {
      const id = String(url.searchParams.get("id") || ""), list = await readIndex(kv), old = list.find((m) => m.id === id);
      if (!old) throw new MailError(404, "That mail no longer exists");
      for (let i = 0; i < (old.att || []).length; i++) await kv.delete("mail:v1:att:" + id + ":" + i);
      await writeIndex(kv, list.filter((m) => m.id !== id));
      return jsonRes({ ok: true });
    }
    return jsonRes({ error: "Not found" }, 404);
  } catch (e) {
    return jsonRes({ error: e.message || "Error" }, e.status || 500);
  }
}
__name(mailAdmin, "mailAdmin");

// src/index.js
var API = "https://vamsys.io/api/v3/operations";
var TOKEN_URL = "https://vamsys.io/oauth/token";
var TTL = { pilot: 6e4, pireps: 6e4, bookings: 3e4, stats: 3e5, lookup: 36e5 };
var token = null;
var cache = /* @__PURE__ */ new Map();
function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value);
  return fn().then((value) => {
    cache.set(key, { at: Date.now(), value });
    return value;
  });
}
__name(cached, "cached");
async function getToken(env) {
  if (token && Date.now() < token.expires) return token.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.VAMSYS_CLIENT_ID || "",
    client_secret: env.VAMSYS_CLIENT_SECRET || "",
    scope: env.VAMSYS_SCOPE || "ops:read"
  });
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
  if (!res.ok) throw new HttpError(502, `vAMSYS token request failed (HTTP ${res.status})`);
  const j = await res.json();
  token = { value: j.access_token, expires: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1e3 };
  return token.value;
}
__name(getToken, "getToken");
var HttpError = class extends Error {
  static {
    __name(this, "HttpError");
  }
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
};
async function vget(env, path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") url.searchParams.set(k, String(v));
  let res = await fetch(url, { headers: { Authorization: `Bearer ${await getToken(env)}`, Accept: "application/json" } });
  if (res.status === 401) {
    token = null;
    res = await fetch(url, { headers: { Authorization: `Bearer ${await getToken(env)}`, Accept: "application/json" } });
  }
  if (res.status === 429) throw new HttpError(503, "vAMSYS rate limit reached, try again in a minute");
  if (!res.ok) throw new HttpError(502, `vAMSYS ${path} failed (HTTP ${res.status})`);
  return res.json();
}
__name(vget, "vget");
async function all(env, path, params = {}, maxPages = 20) {
  const out = [];
  let cursor = null;
  for (let i = 0; i < maxPages; i++) {
    const j = await vget(env, path, { ...params, "page[size]": 100, "page[cursor]": cursor });
    out.push(...j.data || []);
    cursor = j.meta?.next_cursor || null;
    if (!cursor) break;
  }
  return out;
}
__name(all, "all");
var airports = /* @__PURE__ */ __name((env) => cached("airports", TTL.lookup, async () => new Map((await all(env, "/airports")).map((a) => [a.id, { icao: a.icao || a.iata || "", name: a.name || "" }]))), "airports");
var ranks = /* @__PURE__ */ __name((env) => cached("ranks", TTL.lookup, async () => new Map((await all(env, "/ranks")).map((r) => [r.id, { name: r.name, abbr: r.abbreviation, level: r.level }]))), "ranks");
var fleets = /* @__PURE__ */ __name((env) => cached("fleet", TTL.lookup, async () => {
  const list = await all(env, "/fleet");
  const out = [];
  for (const f of list) {
    const ac = await all(env, `/fleet/${f.id}/aircraft`);
    out.push({ id: f.id, code: f.code, name: f.name, maxPax: f.max_pax ?? null, aircraft: ac.map((a) => ({ id: a.id, registration: a.registration, name: a.name, selcal: a.selcal ?? null })) });
  }
  return out;
}), "fleets");
async function aircraftIndex(env) {
  const m = /* @__PURE__ */ new Map();
  for (const f of await fleets(env)) for (const a of f.aircraft) m.set(a.id, { registration: a.registration, fleet: f.code });
  return m;
}
__name(aircraftIndex, "aircraftIndex");
async function findPilot(env, username) {
  const u = String(username || "").trim();
  if (!u) throw new HttpError(400, "username is required");
  return cached("pilot:" + u.toLowerCase(), TTL.pilot, async () => {
    const j = await vget(env, "/pilots", { "filter[username]": u, "page[size]": 1 });
    const p = (j.data || [])[0];
    if (!p) throw new HttpError(404, `No pilot with username ${u}`);
    return p;
  });
}
__name(findPilot, "findPilot");
var iso = /* @__PURE__ */ __name((s) => s ? String(s) : null, "iso");
async function pilotRoute(env, username) {
  const p = await findPilot(env, username);
  const [rk, ap, ac, stats, pireps] = await Promise.all([
    ranks(env).catch(() => /* @__PURE__ */ new Map()),
    airports(env).catch(() => /* @__PURE__ */ new Map()),
    aircraftIndex(env).catch(() => /* @__PURE__ */ new Map()),
    cached("stats:" + p.id, TTL.stats, () => vget(env, `/statistics/pilot/${p.id}`)).then((j) => j.data ?? j).catch(() => null),
    cached("pireps:" + p.id, TTL.pireps, () => vget(env, "/pireps", { "filter[pilot_id]": p.id, sort: "-id", "page[size]": 30 })).then((j) => j.data || [])
  ]);
  const rank = rk.get(p.rank_id) || null;
  return {
    pilot: { id: p.id, username: p.username, name: p.name ?? null, rank: rank && rank.name, rankAbbr: rank && rank.abbr, since: iso(p.created_at) },
    stats: stats && {
      pireps: stats.pireps?.total ?? null,
      accepted: stats.pireps?.accepted ?? null,
      avgLandingRate: stats.pireps?.averageLandingRate ?? null,
      avgLandingG: stats.pireps?.averageLandingG ?? null,
      flightSeconds: stats.flightTime?.seconds ?? null,
      flightTime: stats.flightTime?.formatted ?? null,
      points: stats.points?.total ?? null,
      distanceNm: stats.transport?.distanceFlown ?? null,
      passengers: stats.transport?.passengers ?? null,
      fuelUsed: stats.transport?.fuelUsed ?? null
    },
    pireps: pireps.map((r) => {
      const a = ac.get(r.aircraft_id) || {};
      return {
        id: r.id,
        date: iso(r.on_blocks_time || r.landing_time || r.created_at),
        flight: r.flight_number || r.callsign || "",
        callsign: r.callsign || "",
        from: ap.get(r.departure_airport_id)?.icao || "",
        to: ap.get(r.arrival_airport_id)?.icao || "",
        registration: a.registration || "",
        type: a.fleet || "",
        blockMinutes: r.block_length != null ? Math.round(r.block_length / 60) : null,
        flightMinutes: r.flight_length != null ? Math.round(r.flight_length / 60) : null,
        landingRate: r.landing_rate ?? null,
        landingG: r.landing_g ?? null,
        fuelUsed: r.fuel_used ?? null,
        distanceNm: r.flight_distance ?? null,
        points: r.points ?? null,
        status: r.status || "",
        network: r.network || null
      };
    })
  };
}
__name(pilotRoute, "pilotRoute");
async function bookingsRoute(env, username) {
  const p = await findPilot(env, username);
  const [ap, ac, list] = await Promise.all([
    airports(env).catch(() => /* @__PURE__ */ new Map()),
    aircraftIndex(env).catch(() => /* @__PURE__ */ new Map()),
    cached("bookings:" + p.id, TTL.bookings, () => vget(env, "/bookings", { "filter[pilot_id]": p.id, "filter[status]": "current", sort: "id", "page[size]": 10 })).then((j) => j.data || [])
  ]);
  return {
    bookings: list.map((b) => {
      const a = ac.get(b.aircraft_id) || {};
      return {
        id: b.id,
        flight: b.flight_number || "",
        callsign: b.callsign || "",
        from: ap.get(b.departure_id)?.icao || "",
        to: ap.get(b.arrival_id)?.icao || "",
        fromName: ap.get(b.departure_id)?.name || "",
        toName: ap.get(b.arrival_id)?.name || "",
        registration: a.registration || "",
        type: a.fleet || "",
        departureTime: iso(b.departure_time),
        arrivalTime: iso(b.estimated_arrival_time || b.arrival_time),
        altitude: b.altitude ?? null,
        costIndex: b.cost_index ?? null,
        route: b.user_route ?? null,
        passengers: b.passengers ?? null,
        cargo: b.cargo ?? null,
        network: b.network ?? null,
        validTo: iso(b.valid_to)
      };
    })
  };
}
__name(bookingsRoute, "bookingsRoute");
async function liveRoute(env) {
  return cached("live", 15e3, async () => {
    const j = await vget(env, "/flight-map");
    const num = /* @__PURE__ */ __name((v) => v == null || v === "" || isNaN(+v) ? null : +v, "num");
    const icao = /* @__PURE__ */ __name((a) => a && (a.icao || a.identifier || a.iata) || "", "icao");
    const flights = (j.data || []).flatMap((f) => {
      const b = f.booking || {}, pr = f.progress || {}, ac = f.aircraft || {};
      const lat = num(pr.latitude ?? pr.location?.lat), lon = num(pr.longitude ?? pr.location?.lon);
      if (lat == null || lon == null) return [];
      return [{
        callsign: b.callsign || b.flightNumber || `#${f.bookingId ?? "?"}`,
        flight: b.flightNumber || "",
        pilot: f.pilot?.username || "",
        network: b.network || null,
        type: ac.code || ac.type || ac.name || "",
        registration: ac.registration || "",
        from: icao(f.departureAirport),
        to: icao(f.arrivalAirport),
        lat,
        lon,
        altitude: num(pr.altitude) ?? num(b.altitude) ?? 0,
        groundspeed: num(pr.groundSpeed) ?? 0,
        heading: num(pr.magneticHeading) ?? num(pr.heading) ?? 0,
        phase: pr.currentPhase || "",
        distanceRemaining: num(pr.distanceRemaining)
      }];
    });
    return { flights };
  });
}
__name(liveRoute, "liveRoute");
async function firRoute() {
  return cached("fir", 24 * 36e5, () => edgeCache("fir/v1", 7 * 86400, async () => {
    const r = await fetch("https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson", { headers: { "User-Agent": "PolarisEFB/1.0" } });
    if (!r.ok) throw new Error("Boundary data unavailable (HTTP " + r.status + ")");
    const j = await r.json();
    const round = /* @__PURE__ */ __name((c) => Array.isArray(c[0]) ? c.map(round) : [Math.round(c[0] * 1e3) / 1e3, Math.round(c[1] * 1e3) / 1e3], "round");
    return {
      type: "FeatureCollection",
      features: (j.features || []).map((f) => ({ type: "Feature", properties: { id: f.properties?.id, oceanic: f.properties?.oceanic, label_lon: f.properties?.label_lon, label_lat: f.properties?.label_lat }, geometry: f.geometry ? { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } : null }))
    };
  }));
}
__name(firRoute, "firRoute");
async function radarRoute() {
  return cached("radar", 12e4, async () => {
    const r = await fetch("https://api.rainviewer.com/public/weather-maps.json", { headers: { "User-Agent": "PolarisEFB/1.0" } });
    if (!r.ok) throw new Error("Radar unavailable (HTTP " + r.status + ")");
    const j = await r.json();
    return { host: j.host, radar: { past: j.radar && j.radar.past || [] }, generated: j.generated };
  });
}
__name(radarRoute, "radarRoute");
async function sigmetRoute() {
  return cached("sigmets3", 3e5, async () => {
    const opt = { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)", Accept: "application/json" } };
    const get = /* @__PURE__ */ __name((u) => fetch(u, opt).then((r) => r.ok ? r.json() : []).catch(() => []), "get");
    const [intl, us, ga, cwa] = await Promise.all([
      get("https://aviationweather.gov/api/data/isigmet?format=json"),
      get("https://aviationweather.gov/api/data/airsigmet?format=json"),
      get("https://aviationweather.gov/api/data/gairmet?format=json"),
      get("https://aviationweather.gov/api/data/cwa?format=json")
    ]);
    const coords = /* @__PURE__ */ __name((c) => (Array.isArray(c) ? c : []).map((p) => [+p.lat, +p.lon]).filter((p) => isFinite(p[0]) && isFinite(p[1])), "coords");
    const out = [];
    for (const s of Array.isArray(intl) ? intl : []) {
      const c = coords(s.coords);
      if (c.length >= 3) out.push({ kind: "SIGMET", fir: s.firId || s.icaoId || "", hazard: s.hazard || "", qualifier: s.qualifier || "", base: s.base ?? null, top: s.top ?? null, from: s.validTimeFrom ?? null, to: s.validTimeTo ?? null, coords: c, raw: s.rawSigmet || "" });
    }
    for (const s of Array.isArray(us) ? us : []) {
      const c = coords(s.coords);
      if (c.length >= 3) out.push({ kind: s.airSigmetType || "AIRMET", fir: s.icaoId || "", hazard: s.hazard || "", qualifier: s.severity != null ? String(s.severity) : "", base: s.altitudeLow1 ?? null, top: s.altitudeHi1 ?? null, from: s.validTimeFrom ?? null, to: s.validTimeTo ?? null, coords: c, raw: s.rawAirSigmet || "" });
    }
    const hft = /* @__PURE__ */ __name((v) => {
      if (v == null || v === "") return null;
      if (/SFC/i.test(v)) return 0;
      const n = +v;
      return isFinite(n) ? n < 1e3 ? n * 100 : n : null;
    }, "hft");
    const gaL = (Array.isArray(ga) ? ga : []).filter((g) => coords(g.coords).length >= 3 && !/LINE/i.test(g.geometryType || "") && !/FZLVL/i.test(g.hazard || ""));
    const tv = /* @__PURE__ */ __name((g) => {
      const t = g.validTime != null ? typeof g.validTime === "number" ? g.validTime * 1e3 : Date.parse(g.validTime) : NaN;
      return isFinite(t) ? t : NaN;
    }, "tv");
    const bestT = {};
    gaL.forEach((g) => {
      const t = tv(g), k = g.product || g.hazard || "";
      if (!isFinite(t)) return;
      if (bestT[k] == null || Math.abs(t - Date.now()) < Math.abs(bestT[k] - Date.now())) bestT[k] = t;
    });
    for (const g of gaL) {
      const t = tv(g), k = g.product || g.hazard || "";
      if (isFinite(t) && bestT[k] != null && t !== bestT[k]) continue;
      const hz = String(g.hazard || "").toUpperCase();
      out.push({ kind: "G-AIRMET", fir: (g.product || "") + (g.tag ? " " + g.tag : ""), hazard: hz.replace(/_/g, " "), qualifier: [g.severity, g.due_to || g.dueTo].filter(Boolean).join(" \xB7 "), base: hft(g.base), top: hft(g.top), from: isFinite(t) ? Math.round(t / 1e3) : null, to: g.expireTime ?? null, coords: coords(g.coords), raw: "" });
    }
    for (const c of Array.isArray(cwa) ? cwa : []) {
      const cc = coords(c.coords);
      if (cc.length >= 3) out.push({ kind: "CWA", fir: c.cwsu || c.icaoId || "", hazard: c.hazard || "", qualifier: c.qualifier || "", base: c.base ?? null, top: c.top ?? null, from: c.validTimeFrom ?? null, to: c.validTimeTo ?? null, coords: cc, raw: c.cwaText || c.rawCwa || "" });
    }
    return { sigmets: out };
  });
}
__name(sigmetRoute, "sigmetRoute");
async function airportRoute(icaoIn, ctx) {
  const icao = String(icaoIn || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(icao)) throw new HttpError(400, "Enter a 4 letter ICAO code");
  const opt = { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)", Accept: "application/json" } };
  const get = /* @__PURE__ */ __name(async (u, ms) => {
    const r = await fetchT(u, ms || 9e3, opt);
    if (r.status === 204 || r.status === 404) return null;
    if (!r.ok) throw new Error("AWC " + r.status);
    const t = await r.text();
    if (!t.trim()) return null;
    return JSON.parse(t);
  }, "get");
  const edge = caches.default, ek = new Request("https://apt-cache.local/v2/" + icao);
  const infoP = cached("apt:" + icao, 12 * 36e5, async () => {
    const hit = await edge.match(ek);
    if (hit) return await hit.json();
    let j;
    try {
      j = await get(`https://aviationweather.gov/api/data/airport?ids=${icao}&format=json`);
    } catch (e) {
      try {
        j = await get(`https://aviationweather.gov/api/data/airport?ids=${icao}&format=json`, 12e3);
      } catch (e2) {
        throw new HttpError(504, "The airport service is slow right now, try again");
      }
    }
    const a = Array.isArray(j) ? j[0] : null;
    let out = null;
    if (a) {
      const freqs = Array.isArray(a.freqs) ? a.freqs.map((f) => ({ type: f.type || "", freq: String(f.freq || "") })) : typeof a.freqs === "string" ? a.freqs.split(";").map((p) => {
        const [type, freq] = p.split(",");
        return { type: (type || "").trim(), freq: (freq || "").trim() };
      }).filter((f) => f.freq) : [];
      out = {
        icao: a.icaoId || icao,
        iata: a.iataId || "",
        faa: a.faaId || "",
        name: a.name || "",
        state: a.state || "",
        country: a.country || "",
        lat: +a.lat,
        lon: +a.lon,
        elevM: a.elev != null ? +a.elev : null,
        magdec: a.magdec || "",
        owner: a.owner || "",
        tower: a.tower || "",
        freqs,
        runways: (Array.isArray(a.runways) ? a.runways : []).map((r) => {
          const [l, w] = String(r.dimension || "").split("x").map(Number);
          return { id: r.id || "", lengthFt: isFinite(l) ? l : null, widthFt: isFinite(w) ? w : null, surface: r.surface || "", alignment: r.alignment ?? null };
        })
      };
    }
    const res = new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + (out ? 43200 : 3600) } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(edge.put(ek, res));
    else await edge.put(ek, res);
    return out;
  });
  const wxP = cached("aptwx:" + icao, 5 * 6e4, async () => {
    const [m, t] = await Promise.all([get(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`, 8e3).catch(() => void 0), get(`https://aviationweather.gov/api/data/taf?ids=${icao}&format=json`, 8e3).catch(() => void 0)]);
    if (m === void 0 && t === void 0) throw new Error("weather unavailable");
    const mm = Array.isArray(m) ? m[0] : null, tt = Array.isArray(t) ? t[0] : null;
    return { metar: mm ? { raw: mm.rawOb || "", time: mm.reportTime || mm.obsTime || null, cat: mm.fltCat || mm.fltcat || "" } : null, taf: tt ? { raw: tt.rawTAF || "", time: tt.issueTime || null } : null };
  });
  const [info, wx] = await Promise.all([infoP, wxP.catch(() => ({ metar: null, taf: null, wxErr: "Weather service is slow right now" }))]);
  return { airport: info, notFound: !info, ...wx };
}
__name(airportRoute, "airportRoute");
var DAY = 864e5;
function airac(t = Date.now()) {
  const ref = Date.UTC(2024, 0, 25, 9, 1), period = 28 * DAY;
  const k = Math.floor((t - ref) / period), eff = ref + k * period;
  const y = new Date(eff).getUTCFullYear();
  const first = ref + Math.ceil((Date.UTC(y, 0, 1) - ref) / period) * period;
  const n = Math.round((eff - first) / period) + 1;
  return { cycle: String(y % 100).padStart(2, "0") + String(n).padStart(2, "0"), from: new Date(eff).toISOString(), to: new Date(eff + period).toISOString() };
}
__name(airac, "airac");
var CHART_GROUP = { APD: "Airport diagram", HOT: "Hot spots", LAH: "LAHSO", DP: "Departures", ODP: "Departures", STR: "Arrivals", IAP: "Approaches", MIN: "Minimums", DAU: "Other" };
var xmlField = /* @__PURE__ */ __name((rec, k) => {
  const m = rec.match(new RegExp("<" + k + ">([^<]*)</" + k + ">"));
  return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : "";
}, "xmlField");
async function edgeCache(key, ttlSec, fn, keep) {
  const req = new Request("https://polaris-efb-cache/" + key);
  const c = caches.default;
  const hit = await c.match(req);
  if (hit) return hit.json();
  const val = await fn();
  if (keep && !keep(val)) return val;
  await c.put(req, new Response(JSON.stringify(val), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttlSec}` } }));
  return val;
}
__name(edgeCache, "edgeCache");
async function chartsRoute(icaoIn, env, ctx) {
  const icao = String(icaoIn || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(icao)) throw new HttpError(400, "Enter a 3 or 4 letter airport code");
  const ac = airac();
  return cached("charts:" + ac.cycle + ":" + icao, 6 * 36e5, () => kvStore(env, ctx, "charts:" + ac.cycle + ":" + icao, 40 * 864e5, () => edgeCache(`charts/${ac.cycle}/${icao}`, 86400, async () => {
    const res = await fetch(`https://aeronav.faa.gov/d-tpp/${ac.cycle}/xml_data/d-TPP_Metafile.xml`, { cf: { cacheTtl: 86400, cacheEverything: true } });
    if (!res.ok || !res.body) throw new HttpError(502, `FAA chart index for cycle ${ac.cycle} is not available (HTTP ${res.status})`);
    const keys = [`icao_ident="${icao}"`];
    if (icao.length === 3) keys.push(`apt_ident="${icao}"`);
    else if (icao[0] === "K") keys.push(`apt_ident="${icao.slice(1)}"`);
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", block = null, found = false;
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      if (!found) {
        let i = -1;
        for (const k of keys) {
          i = buf.indexOf(k);
          if (i >= 0) break;
        }
        if (i < 0) {
          if (buf.length > 4e3) buf = buf.slice(-1500);
          continue;
        }
        const st = buf.lastIndexOf("<airport_name", i);
        buf = buf.slice(st >= 0 ? st : 0);
        found = true;
      }
      const e = buf.indexOf("</airport_name>");
      if (e >= 0) {
        block = buf.slice(0, e);
        try {
          await reader.cancel();
        } catch (_) {
        }
        break;
      }
    }
    if (!block) return { cycle: ac.cycle, from: ac.from, to: ac.to, airport: { icao, name: "" }, charts: [], notFound: true };
    const name = (block.match(/ID="([^"]*)"/) || [])[1] || "";
    const charts = [...block.matchAll(/<record>([\s\S]*?)<\/record>/g)].map((m) => ({
      code: xmlField(m[1], "chart_code"),
      name: xmlField(m[1], "chart_name"),
      pdf: xmlField(m[1], "pdf_name"),
      action: xmlField(m[1], "useraction")
    })).filter((c) => c.pdf && c.action !== "D").map((c) => ({ code: c.code, group: CHART_GROUP[c.code] || "Other", name: c.name, pdf: c.pdf, changed: c.action === "C", url: `https://aeronav.faa.gov/d-tpp/${ac.cycle}/${c.pdf}` }));
    return { cycle: ac.cycle, from: ac.from, to: ac.to, airport: { icao, name }, charts };
  }), (v) => v && !v.notFound));
}
__name(chartsRoute, "chartsRoute");
async function chartPdfRoute(url, h) {
  const cycle = url.searchParams.get("cycle") || "", file = url.searchParams.get("file") || "";
  if (!/^\d{4}$/.test(cycle) || !/^[A-Z0-9_-]{1,60}\.PDF$/i.test(file)) return json({ error: "Invalid chart" }, 400, h);
  const res = await fetch(`https://aeronav.faa.gov/d-tpp/${cycle}/${file}`, { cf: { cacheTtl: 7 * 86400, cacheEverything: true } });
  if (!res.ok) return json({ error: `FAA returned HTTP ${res.status}` }, 502, h);
  return new Response(res.body, { status: 200, headers: { ...h, "Content-Type": "application/pdf", "Cache-Control": "public, max-age=86400" } });
}
__name(chartPdfRoute, "chartPdfRoute");
var MAJOR = ["KATL", "KDFW", "KDEN", "KORD", "KLAX", "KJFK", "KLAS", "KMCO", "KMIA", "KCLT", "KSEA", "KPHX", "KEWR", "KSFO", "KIAH", "KBOS", "KFLL", "KMSP", "KLGA", "KDTW", "KPHL", "KSLC", "KBWI", "KIAD", "KDCA", "KSAN", "KTPA", "KBNA", "KAUS", "PHNL", "PANC", "KPDX", "KMSY", "KRDU", "KSJC", "KOAK", "KSAT", "KMCI", "KSMF", "KSTL"];
async function kvStore(env, ctx, key, maxAge, fn, keep) {
  const kv = env && env.STORE;
  if (!kv) return fn();
  let hit = null;
  try {
    hit = await kv.get(key, "json");
  } catch (e) {
    hit = null;
  }
  const build = /* @__PURE__ */ __name(async () => {
    const v = await fn();
    if (!keep || keep(v)) {
      try {
        await kv.put(key, JSON.stringify({ t: Date.now(), v }), { expirationTtl: 120 * 86400 });
      } catch (e) {
      }
    }
    return v;
  }, "build");
  if (hit && hit.v) {
    if (Date.now() - (hit.t || 0) > maxAge && ctx && ctx.waitUntil) ctx.waitUntil(build().catch(() => {
    }));
    return hit.v;
  }
  return build();
}
__name(kvStore, "kvStore");
var OVERPASS = ["https://overpass.openstreetmap.fr/api/interpreter", "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
async function overpass(query, perTry = 2e4, stagger = 2500) {
  let done = false, last = null;
  const ctrls = [];
  const one = /* @__PURE__ */ __name(async (ep) => {
    const ctrl = new AbortController();
    ctrls.push(ctrl);
    const t = setTimeout(() => ctrl.abort(), perTry);
    try {
      const r = await fetch(ep, { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)" }, body: "data=" + encodeURIComponent(query) });
      const txt = await r.text();
      if (!r.ok || txt[0] !== "{") throw new Error(`HTTP ${r.status}`);
      const j = JSON.parse(txt);
      if (j.remark && /timed out|out of memory|error/i.test(j.remark)) throw new Error("query ran out of time");
      return j;
    } catch (e) {
      if (!done) last = e.name === "AbortError" ? new Error("no answer in time") : e;
      throw e;
    } finally {
      clearTimeout(t);
    }
  }, "one");
  return new Promise((resolve, reject) => {
    let i = 0, active = 0, timer = null;
    const next = /* @__PURE__ */ __name(() => {
      clearTimeout(timer);
      if (done) return;
      if (i >= OVERPASS.length) {
        if (!active) reject(new HttpError(503, "OpenStreetMap is busy right now, try again in a minute" + (last ? ` (${last.message})` : "")));
        return;
      }
      active++;
      one(OVERPASS[i++]).then((j) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        ctrls.forEach((c) => {
          try {
            c.abort();
          } catch (e) {
          }
        });
        resolve(j);
      }, () => {
        active--;
        next();
      });
      timer = setTimeout(next, stagger);
    }, "next");
    next();
  });
}
__name(overpass, "overpass");
async function airportPos(icao) {
  try {
    const r = await fetch(`https://aviationweather.gov/api/data/airport?ids=${icao}&format=json`, { headers: { "User-Agent": "PolarisEFB/1.0" }, cf: { cacheTtl: 86400, cacheEverything: true } });
    if (r.ok) {
      const a = (await r.json())[0];
      if (a && isFinite(a.lat) && isFinite(a.lon) && (a.lat || a.lon)) return { lat: +a.lat, lon: +a.lon, name: String(a.name || "").trim() };
    }
  } catch (e2) {
  }
  const j = await overpass(`[out:json][timeout:15];(way["aeroway"="aerodrome"]["icao"="${icao}"];relation["aeroway"="aerodrome"]["icao"="${icao}"];node["aeroway"="aerodrome"]["icao"="${icao}"];);out tags center 1;`);
  const e = (j.elements || [])[0];
  if (!e) return null;
  const c = e.center || e;
  return isFinite(c.lat) ? { lat: c.lat, lon: c.lon, name: (e.tags || {}).name || "" } : null;
}
__name(airportPos, "airportPos");
function stitchRings(ways) {
  const eq = /* @__PURE__ */ __name((a, b) => a[0] === b[0] && a[1] === b[1], "eq"), segs = ways.filter((w) => w.length > 1).map((w) => w.slice()), rings = [];
  while (segs.length) {
    let cur = segs.pop(), grew = true;
    while (grew && !eq(cur[0], cur[cur.length - 1])) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        const sg = segs[i], head = cur[0], tail = cur[cur.length - 1];
        if (eq(sg[0], tail)) cur = cur.concat(sg.slice(1));
        else if (eq(sg[sg.length - 1], tail)) cur = cur.concat(sg.slice(0, -1).reverse());
        else if (eq(sg[sg.length - 1], head)) cur = sg.slice(0, -1).concat(cur);
        else if (eq(sg[0], head)) cur = sg.slice(1).reverse().concat(cur);
        else continue;
        segs.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (cur.length > 3 && eq(cur[0], cur[cur.length - 1])) rings.push(cur);
  }
  return rings;
}
__name(stitchRings, "stitchRings");
var CARGO = /cargo|freight|warehouse|logistic|fedex|\bups\b|dhl|usps|mail/i;
var mid = /* @__PURE__ */ __name((pts) => {
  let x = 0, y = 0;
  pts.forEach((p) => {
    x += p[0];
    y += p[1];
  });
  return [Math.round(x / pts.length * 1e6) / 1e6, Math.round(y / pts.length * 1e6) / 1e6];
}, "mid");
var LAYOUT_KINDS = "runway|taxiway|taxilane|apron|terminal|hangar|holding_position|parking_position|stopway|gate";
async function layoutRoute(icaoIn, env, ctx) {
  const icao = String(icaoIn || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(icao)) throw new HttpError(400, "Enter a 4 letter ICAO code");
  return cached("layout11:" + icao, 6 * 36e5, () => kvStore(env, ctx, "layout:v11:" + icao, 30 * 864e5, () => edgeCache(`layout/v11/${icao}`, 7 * 86400, async () => {
    const pos = await airportPos(icao);
    if (!pos) return { airport: { icao, name: "", lat: null, lon: null }, runways: [], taxiways: [], aprons: [], buildings: [], stands: [], holds: [], notFound: true };
    const dLat = 0.07, dLon = dLat / Math.max(0.2, Math.cos(pos.lat * Math.PI / 180));
    const bb = [pos.lat - dLat, pos.lon - dLon, pos.lat + dLat, pos.lon + dLon].map((v) => v.toFixed(5)).join(",");
    const j0 = await overpass(`[out:json][timeout:20][bbox:${bb}];(way["aeroway"="aerodrome"];relation["aeroway"="aerodrome"];);out body bb geom;`);
    const fields = (j0.elements || []).filter((e) => (e.tags || {}).aeroway === "aerodrome" && e.bounds);
    const mine = fields.find((e) => String(e.tags.icao || "").toUpperCase() === icao) || fields.filter((e) => !e.tags.icao && pos.lat >= e.bounds.minlat && pos.lat <= e.bounds.maxlat && pos.lon >= e.bounds.minlon && pos.lon <= e.bounds.maxlon).sort((x, y) => x.bounds.maxlat - x.bounds.minlat - (y.bounds.maxlat - y.bounds.minlat))[0];
    const m = 3e-3, box = mine ? { a: mine.bounds.minlat - m, b: mine.bounds.maxlat + m, c: mine.bounds.minlon - m, d: mine.bounds.maxlon + m } : { a: pos.lat - 0.04, b: pos.lat + 0.04, c: pos.lon - dLon * 4 / 7, d: pos.lon + dLon * 4 / 7 };
    const inBox = /* @__PURE__ */ __name((e) => {
      const p = e.type === "node" ? e : e.bounds ? { lat: (e.bounds.minlat + e.bounds.maxlat) / 2, lon: (e.bounds.minlon + e.bounds.maxlon) / 2 } : null;
      return !!p && p.lat >= box.a && p.lat <= box.b && p.lon >= box.c && p.lon <= box.d;
    }, "inBox");
    const bb2 = [box.a, box.c, box.b, box.d].map((v) => v.toFixed(5)).join(",");
    const j1 = await overpass(`[out:json][timeout:40][bbox:${bb2}];(way["aeroway"~"^(${LAYOUT_KINDS})$"];node["aeroway"~"^(gate|parking_position|holding_position)$"];way["building"]["name"];relation["aeroway"~"^(apron|terminal|hangar)$"];relation["building"]["name"];);out geom qt;`, 45e3, 6e3);
    const j = { elements: (j1.elements || []).filter((e) => (e.tags || {}).aeroway !== "aerodrome" && inBox(e)) };
    const r6 = /* @__PURE__ */ __name((v) => Math.round(v * 1e6) / 1e6, "r6");
    const line = /* @__PURE__ */ __name((e) => (e.geometry || []).filter((p) => p && isFinite(p.lat)).map((p) => [r6(p.lon), r6(p.lat)]), "line");
    const out = { airport: { icao, name: mine && mine.tags.name || pos.name || "", lat: r6(pos.lat), lon: r6(pos.lon) }, runways: [], taxiways: [], aprons: [], apronHoles: [], buildings: [], stands: [], holds: [], places: [] };
    if (mine) {
      const rings = mine.type === "way" ? [mine.geometry] : (mine.members || []).filter((mb) => mb.type === "way" && mb.role !== "inner").map((mb) => mb.geometry);
      out.outline = stitchRings(rings.map((gm) => (gm || []).filter((p) => p && isFinite(p.lat)).map((p) => [r6(p.lon), r6(p.lat)])));
    }
    for (const e of j.elements || []) {
      const t = e.tags || {}, a = t.aeroway;
      if (e.type === "relation") {
        if (a === "apron") {
          const ring = /* @__PURE__ */ __name((role) => stitchRings((e.members || []).filter((mb) => mb.type === "way" && (role === "inner" ? mb.role === "inner" : mb.role !== "inner")).map((mb) => (mb.geometry || []).filter((p) => p && isFinite(p.lat)).map((p) => [r6(p.lon), r6(p.lat)]))), "ring");
          ring("outer").forEach((r) => out.aprons.push(r));
          ring("inner").forEach((r) => out.apronHoles.push(r));
          if (t.name) {
            const o = ring("outer")[0];
            if (o) out.places.push({ kind: "apron", name: t.name, pt: mid(o) });
          }
        } else if (a === "terminal" || a === "hangar" || !a && t.building && t.name) {
          const ring = /* @__PURE__ */ __name((inner) => stitchRings((e.members || []).filter((mb) => mb.type === "way" && (inner ? mb.role === "inner" : mb.role !== "inner")).map((mb) => (mb.geometry || []).filter((p) => p && isFinite(p.lat)).map((p) => [r6(p.lon), r6(p.lat)]))), "ring");
          const outs = ring(false), ins = ring(true);
          const inR = /* @__PURE__ */ __name((p, r) => {
            let c = false;
            for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
              const a1 = r[i], b1 = r[k];
              if (a1[1] > p[1] !== b1[1] > p[1] && p[0] < (b1[0] - a1[0]) * (p[1] - a1[1]) / (b1[1] - a1[1]) + a1[0]) c = !c;
            }
            return c;
          }, "inR");
          const kind = CARGO.test(t.name || "") ? "cargo" : a || (t.building === "hangar" ? "hangar" : "bldg");
          outs.forEach((o, k) => {
            const holes = ins.filter((r) => inR(r[0], o));
            out.buildings.push({ kind, name: k ? "" : t.name || "", pts: o, ...holes.length ? { holes } : {}, ...a ? {} : { osmb: true } });
          });
        }
        continue;
      }
      if (e.type === "node") {
        if (a === "holding_position") out.holds.push({ ref: t.ref || "", pt: [r6(e.lon), r6(e.lat)] });
        else out.stands.push({ ref: t.ref || t.name || "", kind: a, pt: [r6(e.lon), r6(e.lat)] });
        continue;
      }
      const pts = line(e);
      if (pts.length < 2) continue;
      if (a === "runway" || a === "stopway") out.runways.push({ ref: t.ref || "", width: +t.width || null, stopway: a === "stopway", area: t.area === "yes", pts });
      else if (a === "taxiway" || a === "taxilane") {
        if (t.area === "yes") out.aprons.push(pts);
        else out.taxiways.push({ ref: t.ref || "", kind: a, width: +t.width || null, pts });
      } else if (a === "apron") {
        out.aprons.push(pts);
        if (t.name) out.places.push({ kind: "apron", name: t.name, pt: mid(pts) });
      } else if (a === "terminal" || a === "hangar") out.buildings.push({ kind: CARGO.test(t.name || "") ? "cargo" : a, name: t.name || "", pts });
      else if (!a && t.building && t.name && pts.length > 3) out.buildings.push({ kind: CARGO.test(t.name) ? "cargo" : t.building === "hangar" ? "hangar" : "bldg", name: t.name, pts, osmb: true });
      else if (a === "holding_position") out.holds.push({ ref: t.ref || "", pts });
      else if (a === "parking_position" || a === "gate") out.stands.push({ ref: t.ref || t.name || "", kind: a, pt: pts[Math.floor(pts.length / 2)], line: pts.length > 1 && pts.length < 60 ? pts : void 0 });
    }
    {
      const inRing = /* @__PURE__ */ __name((p, r) => {
        let c = false;
        for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
          const a1 = r[i], b1 = r[k];
          if (a1[1] > p[1] !== b1[1] > p[1] && p[0] < (b1[0] - a1[0]) * (p[1] - a1[1]) / (b1[1] - a1[1]) + a1[0]) c = !c;
        }
        return c;
      }, "inRing");
      const rings = out.outline || [], bb3 = mine && mine.bounds;
      const onAirport = /* @__PURE__ */ __name((p) => rings.length ? rings.some((r) => inRing(p, r)) : bb3 ? p[1] >= bb3.minlat && p[1] <= bb3.maxlat && p[0] >= bb3.minlon && p[0] <= bb3.maxlon : true, "onAirport");
      out.buildings = out.buildings.filter((b) => !b.osmb || onAirport(mid(b.pts))).map((b) => {
        delete b.osmb;
        return b;
      });
      out.places = out.places.filter((p) => onAirport(p.pt));
    }
    if (out.airport.lat == null && out.runways.length) {
      const p = out.runways[0].pts[0];
      out.airport.lon = p[0];
      out.airport.lat = p[1];
    }
    if (!out.runways.length && !out.taxiways.length) out.notFound = true;
    return out;
  }, (v) => !v.notFound), (v) => v && !v.notFound));
}
__name(layoutRoute, "layoutRoute");
function cors(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes("*") || allowed.includes(origin);
  return { "Access-Control-Allow-Origin": ok ? allowed.includes("*") ? "*" : origin : "null", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Accept, If-None-Match", "Access-Control-Expose-Headers": "ETag", Vary: "Origin" };
}
__name(cors, "cors");
var json = /* @__PURE__ */ __name((body, status, headers) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } }), "json");
async function majorRoute(env) {
  const kv = env && env.STORE, cyc = airac().cycle;
  const rows = await Promise.all(MAJOR.map(async (icao) => {
    if (!kv) return { icao };
    const [l, c] = await Promise.all([kv.get("layout:v11:" + icao, "json").catch(() => null), kv.get("charts:" + cyc + ":" + icao, "json").catch(() => null)]);
    const v = l && l.v, cv = c && c.v;
    return { icao, name: v && v.airport && v.airport.name || cv && cv.airport && cv.airport.name || "", layoutAt: l ? l.t : null, runways: v ? v.runways.length : 0, taxiways: v ? v.taxiways.length : 0, stands: v ? v.stands.length : 0, buildings: v ? v.buildings.length : 0, chartsAt: c ? c.t : null, charts: cv ? cv.charts.length : 0 };
  }));
  return { cycle: cyc, airports: rows };
}
__name(majorRoute, "majorRoute");
async function refreshMajor(env, ctx) {
  const kv = env && env.STORE;
  if (!kv) return;
  const cyc = airac().cycle, ages = await Promise.all(MAJOR.map(async (icao) => {
    const l = await kv.get("layout:v11:" + icao, "json").catch(() => null);
    return { icao, t: l ? l.t : 0 };
  }));
  const due = ages.filter((a) => Date.now() - a.t > 25 * 864e5).sort((a, b) => a.t - b.t).slice(0, 3);
  for (const a of due) {
    try {
      const v = await layoutRoute(a.icao, null, null);
      if (v && !v.notFound) await kv.put("layout:v11:" + a.icao, JSON.stringify({ t: Date.now(), v }), { expirationTtl: 120 * 86400 });
    } catch (e) {
    }
  }
  for (const icao of MAJOR) {
    const c = await kv.get("charts:" + cyc + ":" + icao).catch(() => null);
    if (!c) {
      try {
        await chartsRoute(icao, env, null);
      } catch (e) {
      }
    }
  }
}
__name(refreshMajor, "refreshMajor");
async function metarCellRoute(cellIn, sizeIn, ctx, h) {
  const sz = String(sizeIn) === "2" ? 2 : 10;
  const m = String(cellIn || "").match(/^(-?\d{1,2}),(-?\d{1,3})$/);
  if (!m) throw new HttpError(400, "cell=lat,lon");
  const la = +m[1], lo = +m[2];
  if (la % sz || lo % sz || la < -90 || la > 90 - sz || lo < -180 || lo > 180 - sz) throw new HttpError(400, "cell must be on the grid");
  const cache2 = caches.default, ck = new Request("https://metar-cache.local/" + sz + "/" + la + "/" + lo);
  let r = await cache2.match(ck);
  if (!r) {
    const up = await fetch(`https://aviationweather.gov/api/data/metar?bbox=${la},${lo},${la + sz},${lo + sz}&format=json`, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)", Accept: "application/json" } });
    if (!up.ok && up.status !== 204) throw new HttpError(502, "METAR service " + up.status);
    let j = [];
    if (up.status !== 204) {
      try {
        j = await up.json();
      } catch (e) {
        j = [];
      }
    }
    const seen = /* @__PURE__ */ new Set(), st = [];
    (Array.isArray(j) ? j : []).sort((a, b) => (b.obsTime || 0) - (a.obsTime || 0)).forEach((x) => {
      const i = String(x.icaoId || "");
      if (!/^[A-Z0-9]{4}$/.test(i) || seen.has(i) || !isFinite(x.lat) || !isFinite(x.lon)) return;
      seen.add(i);
      st.push({ i, la: Math.round(x.lat * 1e4) / 1e4, lo: Math.round(x.lon * 1e4) / 1e4, c: /^(VFR|MVFR|IFR|LIFR)$/.test(x.fltCat) ? x.fltCat : null, wd: x.wdir === "VRB" ? "VRB" : isFinite(x.wdir) ? +x.wdir : null, ws: isFinite(x.wspd) ? +x.wspd : null, wg: isFinite(x.wgst) ? +x.wgst : null, t: x.obsTime || null });
    });
    r = new Response(JSON.stringify({ cell: [la, lo, sz], stations: st, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck, r.clone()));
    else await cache2.put(ck, r.clone());
  }
  const hd = new Headers(r.headers);
  for (const [k, v] of Object.entries(h)) hd.set(k, v);
  hd.set("Cache-Control", "public, max-age=120");
  return new Response(r.body, { status: 200, headers: hd });
}
__name(metarCellRoute, "metarCellRoute");
var WIND_LV = [700, 500, 400, 300, 250, 200];
async function windRoute(url, ctx, h) {
  const lv = +url.searchParams.get("lv");
  if (!WIND_LV.includes(lv)) throw new HttpError(400, "lv must be one of " + WIND_LV.join(", "));
  const cells = String(url.searchParams.get("cells") || "").split(";").map((c) => c.match(/^(-?\d{1,2}),(-?\d{1,3})$/)).filter(Boolean).map((m) => [+m[1], +m[2]]).filter(([la, lo]) => !(la % 10) && !(lo % 10) && la >= -90 && la <= 80 && lo >= -180 && lo <= 170);
  if (!cells.length) throw new HttpError(400, "cells=lat,lon;lat,lon");
  const blk = /* @__PURE__ */ __name((v) => Math.floor(v / 30) * 30, "blk"), blocks = [];
  cells.forEach(([la, lo]) => {
    const b = [blk(la), blk(lo)];
    if (!blocks.some((x) => x[0] === b[0] && x[1] === b[1])) blocks.push(b);
  });
  blocks.splice(14);
  const hour = (/* @__PURE__ */ new Date()).toISOString().slice(0, 13), cache2 = caches.default;
  const key = /* @__PURE__ */ __name((b) => new Request("https://wind-cache.local/v3/" + hour + "/" + lv + "/" + b[0] + "/" + b[1]), "key");
  const got = {}, miss = [];
  await Promise.all(blocks.map(async (b) => {
    const r = await cache2.match(key(b));
    if (r) got[b.join(",")] = await r.json();
    else miss.push(b);
  }));
  let err = null;
  if (miss.length) {
    const lats = [], lons = [], owner = [];
    miss.forEach((b) => {
      for (let a = b[0] + 2.5; a < b[0] + 30; a += 5) for (let o = b[1] + 2.5; o < b[1] + 30; o += 5) if (Math.abs(a) <= 85) {
        lats.push(a);
        lons.push(o);
        owner.push(b.join(","));
      }
    });
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(",")}&longitude=${lons.join(",")}&hourly=wind_speed_${lv}hPa,wind_direction_${lv}hPa,temperature_${lv}hPa&wind_speed_unit=kn&forecast_hours=1&timezone=GMT`;
    let j = null;
    for (let tries = 0; tries < 2 && !j; tries++) {
      try {
        const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 15e3);
        const up = await fetch(u, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)", Accept: "application/json" }, signal: ac.signal }).finally(() => clearTimeout(tm));
        if (up.ok) j = await up.json();
        else {
          err = up.status === 429 ? "Winds service is busy, try again shortly" : "Winds service " + up.status;
          if (up.status === 429 && tries === 0) await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (e) {
        err = e && e.name === "AbortError" ? "Winds service is slow, try again" : "Winds service: " + (e && e.message || e);
      }
    }
    if (j) {
      if (!Array.isArray(j)) j = [j];
      const fresh = {};
      j.forEach((x, i) => {
        const hr = x.hourly || {}, sp = (hr["wind_speed_" + lv + "hPa"] || [])[0], d = (hr["wind_direction_" + lv + "hPa"] || [])[0], t = (hr["temperature_" + lv + "hPa"] || [])[0];
        (fresh[owner[i]] = fresh[owner[i]] || []).push({ la: lats[i], lo: lons[i], d: d == null ? null : Math.round(d), s: sp == null ? null : Math.round(sp), t: t == null ? null : Math.round(t) });
      });
      miss.forEach((b) => {
        const k = b.join(","), v = fresh[k] || [];
        got[k] = v;
        const p = cache2.put(key(b), new Response(JSON.stringify(v), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } }));
        if (ctx && ctx.waitUntil) ctx.waitUntil(p);
      });
      err = null;
    }
  }
  const out = {};
  cells.forEach(([la, lo]) => {
    const v = got[blk(la) + "," + blk(lo)];
    if (v) out[la + "," + lo] = v.filter((q) => q.la >= la && q.la < la + 10 && q.lo >= lo && q.lo < lo + 10);
  });
  return json({ lv, hour: hour + ":00Z", cells: out, error: err }, 200, h);
}
__name(windRoute, "windRoute");
var SAT_SRC = { ge: ["gibs", "GOES-East_ABI_Band13_Clean_Infrared"], gw: ["gibs", "GOES-West_ABI_Band13_Clean_Infrared"], hi: ["gibs", "Himawari_AHI_Band13_Clean_Infrared"], mf: ["eum", "msg_fes:ir108"], mi: ["eum", "msg_iodc:ir108"] };
async function satRoute(url, ctx, h) {
  const id = url.searchParams.get("l"), z = +url.searchParams.get("z"), x = +url.searchParams.get("x"), y = +url.searchParams.get("y"), S = SAT_SRC[id];
  if (!S || !Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > (S[0] === "eum" ? 7 : 6) || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) throw new HttpError(400, "l, z, x, y");
  const slot = Math.floor(Date.now() / 6e5), cache2 = caches.default, ck = new Request(`https://sat-cache.local/v1/${slot}/${id}/${z}/${x}/${y}.png`);
  let r = await cache2.match(ck);
  if (!r) {
    const T = 40075016686e-3 / 2 ** z, x0 = -20037508343e-3 + x * T, y1 = 20037508343e-3 - y * T;
    const up = S[0] === "eum" ? `https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=${S[1]}&styles=&crs=EPSG:3857&bbox=${x0},${y1 - T},${x0 + T},${y1}&width=256&height=256&format=image/png&transparent=true` : `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${S[1]}/default/default/GoogleMapsCompatible_Level6/${z}/${y}/${x}.png`;
    let res = null;
    try {
      res = await fetchT(up, 25e3, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)" } });
    } catch (e) {
    }
    if (!res || !res.ok || !/image/.test(res.headers.get("content-type") || "")) return new Response(null, { status: 204, headers: { ...h, "Cache-Control": "no-store" } });
    r = new Response(await res.arrayBuffer(), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=600" } });
    const p = cache2.put(ck, r.clone());
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
    else await p;
  }
  const hd = new Headers(r.headers);
  for (const [k, v] of Object.entries(h)) hd.set(k, v);
  hd.set("Cache-Control", "public, max-age=600");
  return new Response(r.body, { status: 200, headers: hd });
}
__name(satRoute, "satRoute");
var GWX_LV = [700, 500, 400, 300, 250, 200];
var GWX_F = {
  mslp: /* @__PURE__ */ __name(() => ["pressure_msl"], "mslp"),
  jet: /* @__PURE__ */ __name(() => ["wind_speed_250hPa", "wind_direction_250hPa"], "jet"),
  isa: /* @__PURE__ */ __name((lv) => ["temperature_" + lv + "hPa"], "isa"),
  cloud: /* @__PURE__ */ __name(() => ["cloud_cover"], "cloud"),
  vis: /* @__PURE__ */ __name(() => ["visibility"], "vis"),
  vv: /* @__PURE__ */ __name((lv) => ["vertical_velocity_" + lv + "hPa"], "vv"),
  trop: /* @__PURE__ */ __name(() => [400, 300, 250, 200, 150, 100].flatMap((p) => ["temperature_" + p + "hPa", "geopotential_height_" + p + "hPa"]), "trop")
};
var isaT = /* @__PURE__ */ __name((p) => {
  const h = 44330.77 * (1 - Math.pow(p / 1013.25, 0.190263));
  return h <= 11e3 ? 15 - 65e-4 * h : -56.5;
}, "isaT");
function gwxValue(f, lv, hr) {
  const g = /* @__PURE__ */ __name((k) => {
    const v = (hr[k] || [])[0];
    return v == null ? null : +v;
  }, "g");
  if (f === "mslp") {
    const v = g("pressure_msl");
    return v == null ? null : Math.round(v * 10) / 10;
  }
  if (f === "jet") {
    const s = g("wind_speed_250hPa"), d = g("wind_direction_250hPa");
    return s == null ? null : [Math.round(s), d == null ? null : Math.round(d)];
  }
  if (f === "isa") {
    const t = g("temperature_" + lv + "hPa");
    return t == null ? null : Math.round((t - isaT(lv)) * 10) / 10;
  }
  if (f === "cloud") {
    const v = g("cloud_cover");
    return v == null ? null : Math.round(v);
  }
  if (f === "vis") {
    const v = g("visibility");
    return v == null ? null : Math.round(v);
  }
  if (f === "vv") {
    const v = g("vertical_velocity_" + lv + "hPa");
    return v == null ? null : Math.round(v * 196.85);
  }
  if (f === "trop") {
    const P = [400, 300, 250, 200, 150, 100].map((p) => ({ t: g("temperature_" + p + "hPa"), z: g("geopotential_height_" + p + "hPa") }));
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (a.t == null || b.t == null || a.z == null || b.z == null || b.z <= a.z) continue;
      const lapse = (a.t - b.t) / ((b.z - a.z) / 1e3);
      if (lapse <= 2) return Math.round(a.z * 3.28084 / 100);
    }
    return P[P.length - 1].z != null ? Math.round(P[P.length - 1].z * 3.28084 / 100) : null;
  }
  return null;
}
__name(gwxValue, "gwxValue");
async function gwxRoute(url, ctx, h) {
  const f = String(url.searchParams.get("f") || "");
  if (!GWX_F[f]) throw new HttpError(400, "f must be one of " + Object.keys(GWX_F).join(", "));
  const lv = +(url.searchParams.get("lv") || 250);
  if ((f === "isa" || f === "vv") && !GWX_LV.includes(lv)) throw new HttpError(400, "lv must be one of " + GWX_LV.join(", "));
  const blocks = String(url.searchParams.get("blocks") || "").split(";").map((c) => c.match(/^(-?\d{1,2}),(-?\d{1,3})$/)).filter(Boolean).map((m) => [+m[1], +m[2]]).filter(([la, lo]) => !(la % 30) && !(lo % 30) && la >= -90 && la <= 60 && lo >= -180 && lo <= 150).slice(0, 10);
  if (!blocks.length) throw new HttpError(400, "blocks=lat,lon;lat,lon (30 degree grid)");
  const hour = (() => {
    const d = /* @__PURE__ */ new Date();
    d.setUTCHours(Math.floor(d.getUTCHours() / 3) * 3);
    return d.toISOString().slice(0, 13);
  })(), cache2 = caches.default, lvk = f === "isa" || f === "vv" ? lv : 0;
  const key = /* @__PURE__ */ __name((b) => new Request("https://gwx-cache.local/v2/" + hour + "/" + f + "/" + lvk + "/" + b[0] + "/" + b[1]), "key");
  const got = {}, miss = [];
  await Promise.all(blocks.map(async (b) => {
    const r = await cache2.match(key(b));
    if (r) got[b.join(",")] = await r.json();
    else miss.push(b);
  }));
  let err = null;
  if (miss.length) {
    const pts = [];
    miss.forEach((b) => {
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        const a = b[0] + i * 5, o = b[1] + j * 5;
        pts.push({ b: b.join(","), i, j, a: Math.max(-89.5, Math.min(89.5, a)), o });
      }
    });
    const vars = GWX_F[f](lv).join(","), res = {};
    for (let c = 0; c < pts.length; c += 220) {
      const part = pts.slice(c, c + 220);
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${part.map((p) => p.a).join(",")}&longitude=${part.map((p) => p.o).join(",")}&hourly=${vars}&forecast_hours=1&timezone=GMT&wind_speed_unit=kn`;
      let j = null;
      for (let tries = 0; tries < 2 && !j; tries++) {
        try {
          const up = await fetchT(u, 2e4, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)", Accept: "application/json" } });
          if (up.ok) j = await up.json();
          else {
            let why = "";
            try {
              why = String((await up.json()).reason || "");
            } catch (e) {
            }
            err = up.status === 429 ? /hour/i.test(why) ? "Weather limit reached for this hour, try again later" : /day/i.test(why) ? "Weather limit reached for today" : "Weather service is busy, try again shortly" : "Weather service " + up.status;
            if (up.status === 429) break;
          }
        } catch (e) {
          err = "Weather service is slow, try again";
        }
      }
      if (!j) break;
      if (!Array.isArray(j)) j = [j];
      j.forEach((x, k) => {
        const p = part[k];
        if (!p) return;
        (res[p.b] = res[p.b] || Array(36).fill(null))[p.i * 6 + p.j] = gwxValue(f, lv, x.hourly || {});
      });
    }
    miss.forEach((b) => {
      const k = b.join(",");
      if (!res[k]) return;
      got[k] = res[k];
      const pr = cache2.put(key(b), new Response(JSON.stringify(res[k]), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=10800" } }));
      if (ctx && ctx.waitUntil) ctx.waitUntil(pr);
    });
    if (Object.keys(res).length === miss.length) err = null;
  }
  return json({ f, lv: lvk || null, hour: hour + ":00Z", step: 5, blocks: got, error: err }, 200, h);
}
__name(gwxRoute, "gwxRoute");
async function oaipVector(m, env, ctx, h) {
  const [, z, x, y] = m;
  if (+z < 0 || +z > 16) return new Response(null, { status: 404, headers: h });
  if (!env.OPENAIP_API_KEY) return json({ error: "openAIP key is not set on the server" }, 503, h);
  const cache2 = caches.default, ck = new Request("https://oaip-cache.local/v/" + z + "/" + x + "/" + y + ".pbf");
  let r = await cache2.match(ck);
  if (!r) {
    const up = await fetch("https://api.tiles.openaip.net/api/data/openaip/" + z + "/" + x + "/" + y + ".pbf?apiKey=" + encodeURIComponent(env.OPENAIP_API_KEY), { headers: { "User-Agent": "PolarisEFB/1.0" } });
    if (up.status === 404 || up.status === 204) r = new Response(null, { status: 204, headers: { "Cache-Control": "public, max-age=604800" } });
    else if (!up.ok) return json({ error: "openAIP tiles " + up.status }, up.status === 401 || up.status === 403 ? 503 : 502, h);
    else r = new Response(await up.arrayBuffer(), { status: 200, headers: { "Content-Type": "application/x-protobuf", "Cache-Control": "public, max-age=604800" } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck, r.clone()));
    else await cache2.put(ck, r.clone());
  }
  const hd = new Headers(r.headers);
  for (const [k, v] of Object.entries(h)) hd.set(k, v);
  hd.set("Cache-Control", "public, max-age=86400");
  return new Response(r.body, { status: r.status, headers: hd });
}
__name(oaipVector, "oaipVector");
var PR_LV = /* @__PURE__ */ __name((v) => {
  const t = String(v || "").toUpperCase();
  if (!t || /NEG|SMTH|NIL|NONE/.test(t) && !/LGT|MOD|SEV|EXT/.test(t)) return 0;
  if (/EXT/.test(t)) return 4;
  if (/SEV/.test(t)) return 3;
  if (/MOD/.test(t)) return 2;
  if (/LGT|LT/.test(t)) return 1;
  return 0;
}, "PR_LV");
function prParse(raw) {
  const r = " " + String(raw || "") + " ", tb = (r.match(/\/TB\s+([^/]+)/) || [])[1], ic = (r.match(/\/IC\s+([^/]+)/) || [])[1], fl = (r.match(/\/FL\s*(\d{3})/) || [])[1], tp = (r.match(/\/TP\s+([A-Z0-9]{2,5})/) || [])[1];
  return { tb: PR_LV(tb), ic: PR_LV(ic), tbTxt: tb ? tb.trim() : "", icTxt: ic ? ic.trim() : "", fl: fl ? +fl : null, tp: tp || "" };
}
__name(prParse, "prParse");
async function pirepCellRoute(cellIn, ctx, h) {
  const m = String(cellIn || "").match(/^(-?\d{1,2}),(-?\d{1,3})$/);
  if (!m) throw new HttpError(400, "cell=lat,lon");
  const la = +m[1], lo = +m[2];
  if (la % 10 || lo % 10 || la < -90 || la > 80 || lo < -180 || lo > 170) throw new HttpError(400, "cell must be on the 10 degree grid");
  const cache2 = caches.default, ck = new Request("https://pirep-cache.local/" + la + "/" + lo);
  let r = await cache2.match(ck);
  if (!r) {
    const up = await fetch(`https://aviationweather.gov/api/data/pirep?bbox=${la},${lo},${la + 10},${lo + 10}&age=3&format=json`, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)", Accept: "application/json" } });
    if (!up.ok && up.status !== 204) throw new HttpError(502, "PIREP service " + up.status);
    let j = [];
    if (up.status !== 204) {
      try {
        j = await up.json();
      } catch (e) {
        j = [];
      }
    }
    const out = [];
    (Array.isArray(j) ? j : []).forEach((x) => {
      const raw = String(x.rawOb || x.raw_text || ""), p = prParse(raw);
      const tb = Math.max(p.tb, PR_LV(x.tbInt1), PR_LV(x.tbInt2)), ic = Math.max(p.ic, PR_LV(x.icgInt1), PR_LV(x.icgInt2));
      const lat = +x.lat, lon = +x.lon;
      if (!isFinite(lat) || !isFinite(lon) || tb < 2 && ic < 2) return;
      const fl = isFinite(+x.fltLvl) && +x.fltLvl > 0 ? +x.fltLvl : p.fl;
      out.push({ la: Math.round(lat * 100) / 100, lo: Math.round(lon * 100) / 100, fl, ac: String(x.acType || p.tp || ""), t: x.obsTime || null, tb, ic, kind: String(x.pirepType || (/^\s*[A-Z]{3,4} UUA/.test(raw) ? "UUA" : /AIREP|ARP/.test(raw) ? "AIREP" : "PIREP")), raw: raw.slice(0, 300) });
    });
    r = new Response(JSON.stringify({ cell: [la, lo], reps: out.slice(0, 300) }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600" } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck, r.clone()));
    else await cache2.put(ck, r.clone());
  }
  const hd = new Headers(r.headers);
  for (const [k, v] of Object.entries(h)) hd.set(k, v);
  hd.set("Cache-Control", "public, max-age=180");
  return new Response(r.body, { status: 200, headers: hd });
}
__name(pirepCellRoute, "pirepCellRoute");
var vsMem = null;
var vsExp = /* @__PURE__ */ __name((d) => {
  const now = Date.now(), t = (Date.parse(d.upd) || now) + 16e3;
  return t > now ? Math.min(t, now + 2e4) : now + 5e3;
}, "vsExp");
async function vatsimFeed(ctx) {
  if (vsMem && Date.now() < vsMem.exp) return vsMem.d;
  const cache2 = caches.default, ck = new Request("https://vatsim-feed-cache.local/v1");
  const hit = await cache2.match(ck);
  if (hit) {
    const d2 = await hit.json(), t = Date.parse(d2.upd) || 0;
    if (Date.now() < t + 16e3) {
      vsMem = { exp: t + 16e3, d: d2 };
      return d2;
    }
  }
  const up = await fetchT("https://data.vatsim.net/v3/vatsim-data.json", 1e4, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)" } });
  if (!up.ok) throw new HttpError(502, "VATSIM answered HTTP " + up.status);
  const j = await up.json(), r4 = /* @__PURE__ */ __name((v) => Math.round(+v * 1e4) / 1e4, "r4"), rows = [], routes = {}, det = {};
  for (const p of j.pilots || []) {
    if (!p.callsign || !isFinite(p.latitude) || !isFinite(p.longitude)) continue;
    const f = p.flight_plan || {}, cs = String(p.callsign).toUpperCase(), t = Date.parse(p.logon_time || "");
    rows.push([
      cs,
      p.cid || 0,
      String(p.name || "").slice(0, 60),
      r4(p.latitude),
      r4(p.longitude),
      Math.round(+p.altitude || 0),
      Math.round(+p.groundspeed || 0),
      Math.round(+p.heading || 0),
      p.transponder || "",
      isFinite(t) ? Math.round(t / 1e3) : 0,
      f.aircraft_short || "",
      f.departure || "",
      f.arrival || "",
      f.altitude || "",
      f.flight_rules || ""
    ]);
    if (f.route) routes[cs] = String(f.route).slice(0, 2e3);
    det[cs] = { rm: String(f.remarks || "").slice(0, 1200), altn: f.alternate || "", tas: f.cruise_tas || "", dt: f.deptime || "", ete: f.enroute_time || "", fob: f.fuel_time || "", faa: f.aircraft_faa || "", acl: f.aircraft || "", rev: f.revision_id || 0, pr: p.pilot_rating ?? null, mr: p.military_rating ?? null, sv: p.server || "", qnh: p.qnh_mb || null, ass: f.assigned_transponder || "" };
  }
  const d = { upd: j.general && j.general.update_timestamp || (/* @__PURE__ */ new Date()).toISOString(), rows, routes, det };
  const exp = vsExp(d), ttl = Math.max(1, Math.round((exp - Date.now()) / 1e3));
  const res = new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + ttl } });
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck, res));
  else await cache2.put(ck, res);
  vsMem = { exp, d };
  return d;
}
__name(vatsimFeed, "vatsimFeed");
async function vatsimHours(cid, ctx) {
  const cache2 = caches.default, ck = new Request("https://vatsim-stats-cache.local/v1/" + cid);
  try {
    const hit = await cache2.match(ck);
    if (hit) return (await hit.json()).h;
    const r = await fetchT("https://api.vatsim.net/v2/members/" + cid + "/stats", 6e3, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)", Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json(), hrs = j && isFinite(+j.pilot) ? Math.round(+j.pilot) : null;
    const res = new Response(JSON.stringify({ h: hrs }), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=21600" } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck, res));
    else await cache2.put(ck, res);
    return hrs;
  } catch (e) {
    return null;
  }
}
__name(vatsimHours, "vatsimHours");
var VS_FIELDS = ["c", "cid", "n", "la", "lo", "a", "g", "h", "sq", "t", "ac", "dep", "arr", "alt", "rules"];
async function vatsimRoute(req, url, ctx, h) {
  const d = await vatsimFeed(ctx), cs = String(url.searchParams.get("cs") || "").toUpperCase();
  if (cs) {
    const row = d.rows.find((r) => r[0] === cs), cid = row ? row[1] : 0;
    return json({ cs, route: d.routes[cs] || "", det: d.det && d.det[cs] || null, hours: cid ? await vatsimHours(cid, ctx) : null, upd: d.upd }, 200, h);
  }
  const etag = '"vs-' + d.upd + '"';
  if ((req.headers.get("If-None-Match") || "") === etag) return new Response(null, { status: 304, headers: { ...h, ETag: etag, "Cache-Control": "no-cache" } });
  return new Response(JSON.stringify({ upd: d.upd, f: VS_FIELDS, p: d.rows }), { status: 200, headers: { ...h, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", ETag: etag } });
}
__name(vatsimRoute, "vatsimRoute");
async function fetchT(u, ms, init) {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(u, { ...init || {}, signal: ac.signal });
  } finally {
    clearTimeout(tm);
  }
}
__name(fetchT, "fetchT");
async function vatsimAtisAll(ctx) {
  const cache2 = caches.default, ck = new Request("https://vatsim-atis-cache.local/all");
  let r = await cache2.match(ck);
  if (r) return await r.json();
  const up = await fetchT("https://data.vatsim.net/v3/vatsim-data.json", 1e4, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)" } });
  if (!up.ok) throw new Error("VATSIM " + up.status);
  const j = await up.json();
  const list = (j.atis || []).map((a) => ({ cs: a.callsign, f: a.frequency, code: a.atis_code || "", text: Array.isArray(a.text_atis) ? a.text_atis.join(" ") : String(a.text_atis || ""), since: a.logon_time || null, upd: a.last_updated || null }));
  const out = { at: j.general && j.general.update_timestamp, list };
  const res = new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck, res));
  else await cache2.put(ck, res);
  return out;
}
__name(vatsimAtisAll, "vatsimAtisAll");
async function datisReal(icao, ctx) {
  const cache2 = caches.default, ck = new Request("https://datis-cache.local/" + icao);
  let r = await cache2.match(ck);
  if (r) return await r.json();
  const up = await fetchT("https://atis.info/api/" + icao, 8e3, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)", Accept: "application/json" } });
  let j = null;
  try {
    j = await up.json();
  } catch (e) {
    j = null;
  }
  if (!up.ok && up.status !== 404 && !(j && j.error)) throw new Error("D-ATIS " + up.status);
  const list = Array.isArray(j) ? j.map((a) => ({ type: a.type || "combined", code: a.code || "", text: a.datis || "", time: a.time || "", upd: a.updatedAt || null })) : [];
  const res = new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=120" } });
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck, res));
  else await cache2.put(ck, res);
  return list;
}
__name(datisReal, "datisReal");
async function atisRoute(icaoIn, ctx, h) {
  const icao = String(icaoIn || "").toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(icao)) throw new HttpError(400, "icao is required");
  const [re, va] = await Promise.allSettled([datisReal(icao, ctx), vatsimAtisAll(ctx)]);
  const vat = va.status === "fulfilled" ? va.value.list.filter((a) => a.cs === icao + "_ATIS" || new RegExp("^" + icao + "_[A-Z0-9]+_ATIS$").test(a.cs)) : [];
  return json({
    icao,
    real: re.status === "fulfilled" ? re.value : [],
    realErr: re.status === "rejected" ? String(re.reason && re.reason.message || re.reason) : null,
    vatsim: vat,
    vatsimErr: va.status === "rejected" ? String(va.reason && va.reason.message || va.reason) : null
  }, 200, { ...h, "Cache-Control": "public, max-age=60" });
}
__name(atisRoute, "atisRoute");
async function tzRoute(url, ctx, h) {
  const la = Math.round(+url.searchParams.get("lat") * 10) / 10, lo = Math.round(+url.searchParams.get("lon") * 10) / 10;
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new HttpError(400, "lat and lon are required");
  const cache2 = caches.default, ck = new Request("https://tz-cache.local/" + la + "/" + lo);
  let r = await cache2.match(ck);
  if (!r) {
    const up = await fetchT(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&timezone=auto&forecast_days=1&daily=sunrise`, 1e4, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)", Accept: "application/json" } });
    if (!up.ok) throw new HttpError(502, "Time zone service " + up.status);
    const j = await up.json();
    if (!j || !j.timezone) throw new HttpError(502, "No time zone");
    r = new Response(JSON.stringify({ tz: j.timezone }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=2592000" } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck, r.clone()));
    else await cache2.put(ck, r.clone());
  }
  const hd = new Headers(r.headers);
  for (const [k, v] of Object.entries(h)) hd.set(k, v);
  hd.set("Cache-Control", "public, max-age=86400");
  return new Response(r.body, { status: 200, headers: hd });
}
__name(tzRoute, "tzRoute");
async function fcRoute(url, ctx, h) {
  const la = Math.round(+url.searchParams.get("lat") * 10) / 10, lo = Math.round(+url.searchParams.get("lon") * 10) / 10;
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new HttpError(400, "lat and lon are required");
  const slot = Math.floor(Date.now() / 18e5);
  const cache2 = caches.default, ck = new Request("https://fc2-cache.local/" + slot + "/" + la + "/" + lo);
  let r = await cache2.match(ck);
  if (!r) {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&timezone=auto&forecast_days=7&wind_speed_unit=kn&hourly=temperature_2m,relative_humidity_2m,weather_code,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,cloud_cover_low,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max`;
    let up;
    try {
      up = await fetchT(u, 12e3, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)", Accept: "application/json" } });
    } catch (e) {
      throw new HttpError(504, "Forecast service is slow right now");
    }
    if (!up.ok) throw new HttpError(502, "Forecast service " + up.status);
    const j = await up.json(), H = j.hourly || {}, D = j.daily || {}, off = +j.utc_offset_seconds || 0;
    const now = Date.now(), hours = [];
    (H.time || []).forEach((t, i) => {
      const ms = Date.parse(t + "Z") - off * 1e3;
      if (ms < now - 36e5 || hours.length >= 48) return;
      hours.push({ t: new Date(ms).toISOString().slice(0, 13) + ":00Z", temp: H.temperature_2m[i], rh: H.relative_humidity_2m[i], code: H.weather_code[i], pop: H.precipitation_probability[i], wd: H.wind_direction_10m[i], ws: H.wind_speed_10m[i], wg: H.wind_gusts_10m[i], vis: H.visibility[i], low: H.cloud_cover_low[i], day: H.is_day[i] });
    });
    const days = (D.time || []).map((d, i) => ({ d, code: D.weather_code[i], hi: D.temperature_2m_max[i], lo: D.temperature_2m_min[i], pop: D.precipitation_probability_max[i], ws: D.wind_speed_10m_max[i], wg: D.wind_gusts_10m_max[i] }));
    r = new Response(JSON.stringify({ tz: j.timezone || null, tzAbbr: j.timezone_abbreviation || "", off, hours, days }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck, r.clone()));
    else await cache2.put(ck, r.clone());
  }
  const hd = new Headers(r.headers);
  for (const [k, v] of Object.entries(h)) hd.set(k, v);
  hd.set("Cache-Control", "public, max-age=600");
  return new Response(r.body, { status: 200, headers: hd });
}
__name(fcRoute, "fcRoute");
var AIS_FS = "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/";
async function aisQuery(svc, where, fields, env4, maxPages, extra) {
  const out = [];
  for (let page = 0; page < (maxPages || 4); page++) {
    const q = new URLSearchParams({ where, outFields: fields, geometry: env4.join(","), geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outSR: "4326", geometryPrecision: "5", resultOffset: String(page * 2e3), resultRecordCount: "2000", f: "geojson", ...extra || {} });
    let j = null;
    for (let tr = 0; tr < 4; tr++) {
      if (tr) await new Promise((res) => setTimeout(res, 900 * tr + Math.random() * 400));
      let r;
      try {
        r = await fetchT(AIS_FS + svc + "/FeatureServer/0/query?" + q.toString(), 15e3, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)", Accept: "application/json" } });
      } catch (e) {
        if (tr === 3) throw new Error("FAA AIS " + svc + " timed out");
        continue;
      }
      if (r.status === 429 || r.status >= 500) {
        if (tr === 3) throw new Error("FAA AIS " + svc + " " + r.status);
        continue;
      }
      if (!r.ok) throw new Error("FAA AIS " + svc + " " + r.status);
      j = await r.json();
      if (j.error) {
        if (/too many|rate|busy/i.test(j.error.message || "") && tr < 3) {
          j = null;
          continue;
        }
        throw new Error("FAA AIS " + svc + ": " + (j.error.message || "error"));
      }
      break;
    }
    if (!j) throw new Error("FAA AIS " + svc + " is busy, try again");
    (j.features || []).forEach((f) => out.push(f));
    if (!j.exceededTransferLimit && !(j.properties && j.properties.exceededTransferLimit)) break;
  }
  return out;
}
__name(aisQuery, "aisQuery");
var aisV = /* @__PURE__ */ __name((v) => v == null || +v >= 99999 ? null : +v, "aisV");
async function ifrRoute(url, ctx, h) {
  const lv = url.searchParams.get("lv") === "H" ? "H" : "L", sz = lv === "H" ? 8 : 4;
  const m = String(url.searchParams.get("cell") || "").match(/^(-?\d{1,2}),(-?\d{1,3})$/);
  if (!m) throw new HttpError(400, "cell=lat,lon");
  const la = +m[1], lo = +m[2];
  if (la % sz || lo % sz || la < -90 || la >= 90 || lo < -180 || lo >= 180) throw new HttpError(400, "cell must be on the " + sz + " degree grid");
  const cache2 = caches.default, ck = new Request("https://ifr-cache.local/v2/" + lv + "/" + la + "/" + lo);
  let r = await cache2.match(ck);
  if (!r) {
    const env4 = [lo, la, lo + sz, la + sz], fl = lv === "H" ? "(US_HIGH=1 OR AK_HIGH=1)" : "(US_LOW=1 OR AK_LOW=1)";
    const rt = await aisQuery("ATS_Route", fl, "OBJECTID,IDENT,TYPE_CODE,LEVEL_,MEA_E_VAL,MEA_W_VAL,MOCA_VAL,NMAGTRK,NREVMAGTRK,LENGTH_VAL", env4, 4);
    const pt = await aisQuery("DesignatedPoints", fl, "OBJECTID,IDENT,TYPE_CODE,REPATC", env4, 4);
    const nv = await aisQuery("NAVAIDSystem", fl, "OBJECTID,GLOBAL_ID,IDENT,NAME_TXT,CLASS_TXT,TYPE_CODE", env4, 1);
    const fq = {};
    try {
      (await aisQuery("NavaidComponents", fl, "NAVSYS_ID,FREQUENCY,NAV_TYPE", env4, 2)).forEach((f) => {
        const p = f.properties || {};
        if (!p.NAVSYS_ID || p.FREQUENCY == null) return;
        const rank = p.NAV_TYPE === 3 || p.NAV_TYPE === 1 ? 2 : 1;
        const cur = fq[p.NAVSYS_ID];
        if (!cur || rank > cur.r) fq[p.NAVSYS_ID] = { r: rank, f: p.NAV_TYPE === 1 ? String(Math.round(+p.FREQUENCY)) : (+p.FREQUENCY).toFixed(Math.round(+p.FREQUENCY * 100) % 10 ? 2 : 1) };
      });
    } catch (e) {
    }
    const routes = rt.filter((f) => f.geometry && f.geometry.coordinates).map((f) => {
      const p = f.properties || {};
      const g = f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [f.geometry.coordinates];
      return [p.OBJECTID, p.IDENT || "", p.TYPE_CODE || "", aisV(p.MEA_E_VAL), aisV(p.MEA_W_VAL), aisV(p.MOCA_VAL), aisV(p.NMAGTRK), aisV(p.NREVMAGTRK), p.LENGTH_VAL != null ? Math.round(+p.LENGTH_VAL) : null, g];
    });
    const fixes = pt.filter((f) => f.geometry && f.geometry.coordinates).map((f) => {
      const p = f.properties || {}, c = f.geometry.coordinates;
      return [p.OBJECTID, p.IDENT || "", +c[0].toFixed(5), +c[1].toFixed(5), p.REPATC === "C" ? 1 : 0];
    });
    const navs = nv.filter((f) => f.geometry && f.geometry.coordinates).map((f) => {
      const p = f.properties || {}, c = f.geometry.coordinates;
      return [p.OBJECTID, p.IDENT || "", p.NAME_TXT || "", p.CLASS_TXT || "", +c[0].toFixed(5), +c[1].toFixed(5), fq[p.GLOBAL_ID] && fq[p.GLOBAL_ID].f || ""];
    });
    r = new Response(JSON.stringify({ lv, cell: [la, lo], routes, fixes, navs }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=604800" } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck, r.clone()));
    else await cache2.put(ck, r.clone());
  }
  const hd = new Headers(r.headers);
  for (const [k, v] of Object.entries(h)) hd.set(k, v);
  hd.set("Cache-Control", "public, max-age=86400");
  return new Response(r.body, { status: 200, headers: hd });
}
__name(ifrRoute, "ifrRoute");
function vfrPolys(g, q) {
  if (!g) return [];
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  const area = /* @__PURE__ */ __name((r) => {
    let s = 0;
    for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    return s / 2;
  }, "area");
  const k = Math.pow(10, q);
  return polys.map((rings) => rings.map((r, i) => {
    let rr = r.map((p) => [Math.round(p[0] * k) / k, Math.round(p[1] * k) / k]);
    const a = area(rr);
    if (i === 0 && a < 0 || i > 0 && a > 0) rr = rr.reverse();
    return rr;
  }));
}
__name(vfrPolys, "vfrPolys");
function vfrLabelPt(polys) {
  if (!polys.length) return null;
  const areaOf = /* @__PURE__ */ __name((r) => {
    let s = 0;
    for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    return Math.abs(s / 2);
  }, "areaOf");
  const P = polys.slice().sort((a, b) => areaOf(b[0]) - areaOf(a[0]))[0];
  if (!P || !P[0] || P[0].length < 4) return null;
  const c = Math.cos(P[0][0][1] * Math.PI / 180);
  const inside = /* @__PURE__ */ __name((x, y) => {
    let n = false;
    for (const r of P) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if (a[1] > y !== b[1] > y && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) n = !n;
    }
    return n;
  }, "inside");
  const dist = /* @__PURE__ */ __name((x, y) => {
    let m = 1e9;
    for (const r of P) for (let i = 1; i < r.length; i++) {
      const a = r[i - 1], b = r[i], vx = (b[0] - a[0]) * c, vy = b[1] - a[1], L = vx * vx + vy * vy;
      let t = L ? ((x - a[0]) * c * vx + (y - a[1]) * vy) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = (a[0] - x) * c + t * vx, dy = a[1] - y + t * vy, d = dx * dx + dy * dy;
      if (d < m) m = d;
    }
    return Math.sqrt(m);
  }, "dist");
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  P[0].forEach((p) => {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  });
  let best = null, bd = -1, sx = x1 - x0, sy = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let it = 0; it < 3; it++) {
    const n = it ? 7 : 14;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = cx - sx / 2 + sx * i / n, y = cy - sy / 2 + sy * j / n;
      if (!inside(x, y)) continue;
      const d = dist(x, y);
      if (d > bd) {
        bd = d;
        best = [x, y];
      }
    }
    if (!best) return null;
    cx = best[0];
    cy = best[1];
    sx /= 4;
    sy /= 4;
  }
  return [Math.round(best[0] * 1e4) / 1e4, Math.round(best[1] * 1e4) / 1e4];
}
__name(vfrLabelPt, "vfrLabelPt");
async function vfrRoute(url, ctx, h) {
  const sz = 4, m = String(url.searchParams.get("cell") || "").match(/^(-?\d{1,2}),(-?\d{1,3})$/);
  if (!m) throw new HttpError(400, "cell=lat,lon");
  const la = +m[1], lo = +m[2];
  if (la % sz || lo % sz || la < -90 || la >= 90 || lo < -180 || lo >= 180) throw new HttpError(400, "cell must be on the 4 degree grid");
  const cache2 = caches.default, ck = new Request("https://vfr-cache.local/v1/" + la + "/" + lo);
  let r = await cache2.match(ck);
  if (!r) {
    const env4 = [lo, la, lo + sz, la + sz], gen = { maxAllowableOffset: "0.0004", geometryPrecision: "4" };
    const fv = /* @__PURE__ */ __name((v) => v == null || +v <= -9e3 || +v >= 99999 ? null : +v, "fv");
    const asF = await aisQuery(
      "Class_Airspace",
      "CLASS IN ('B','C','D') OR LOCAL_TYPE IN ('CLASS_E2','CLASS_E3','CLASS_E4','MODE C') OR (LOCAL_TYPE IN ('CLASS_E5','CLASS_E6') AND LOWER_CODE='SFC' AND LOWER_VAL IN (700,1200))",
      "OBJECTID,IDENT,NAME,CLASS,LOCAL_TYPE,LOWER_VAL,LOWER_CODE,UPPER_VAL,UPPER_CODE",
      env4,
      4,
      gen
    );
    const suF = await aisQuery("Special_Use_Airspace", "1=1", "OBJECTID,NAME,TYPE_CODE,LOWER_VAL,LOWER_CODE,UPPER_VAL,UPPER_CODE", env4, 2, gen);
    const apF = await aisQuery("US_Airport", "OPERSTATUS='OPERATIONAL' AND TYPE_CODE IN ('AD','SP')", "GLOBAL_ID,IDENT,ICAO_ID,NAME,ELEVATION,TYPE_CODE,PRIVATEUSE,MIL_CODE", env4, 3, { geometryPrecision: "5" });
    const rwF = await aisQuery("Runways", "1=1", "AIRPORT_ID,DESIGNATOR,LENGTH,WIDTH,COMP_CODE,LIGHTACTV,LIGHTINTNS", env4, 4, { maxAllowableOffset: "0.00002", geometryPrecision: "5" });
    let vpF = [], obF = [];
    try {
      vpF = await aisQuery("DesignatedPoints", "IDENT LIKE 'VP%'", "IDENT", env4, 1, { geometryPrecision: "5" });
    } catch (e) {
    }
    try {
      obF = await aisQuery("Digital_Obstacle_File", "AGL>=200", "AGL,AMSL,Lighting", env4, 4, { geometryPrecision: "4" });
    } catch (e) {
    }
    const lt = /* @__PURE__ */ __name((p) => {
      const L = String(p.LOCAL_TYPE || "");
      return L === "MODE C" ? "MC" : /^CLASS_E(\d)/.test(L) ? "E" + L.slice(7) : String(p.CLASS || L.slice(6) || "?");
    }, "lt");
    const twr = /* @__PURE__ */ new Set();
    const as = asF.filter((f) => f.geometry).map((f) => {
      const p = f.properties || {}, k = lt(p), polys = vfrPolys(f.geometry, 4);
      if (/^[BCD]$/.test(k) && p.IDENT) twr.add(p.IDENT);
      return [p.OBJECTID, k, fv(p.LOWER_VAL), p.LOWER_CODE || "", fv(p.UPPER_VAL), p.UPPER_CODE || "", p.NAME || "", p.IDENT || "", /^[BCD]$/.test(k) ? vfrLabelPt(polys) : null, polys];
    });
    const sua = suF.filter((f) => f.geometry).map((f) => {
      const p = f.properties || {}, polys = vfrPolys(f.geometry, 4);
      return [p.OBJECTID, p.TYPE_CODE || "", p.NAME || "", fv(p.LOWER_VAL), p.LOWER_CODE || "", fv(p.UPPER_VAL), p.UPPER_CODE || "", vfrLabelPt(polys), polys];
    });
    const byApt = {}, rwys = [];
    const brg = /* @__PURE__ */ __name((a, b) => {
      const r2 = Math.PI / 180, y = Math.sin((b[0] - a[0]) * r2) * Math.cos(b[1] * r2), x = Math.cos(a[1] * r2) * Math.sin(b[1] * r2) - Math.sin(a[1] * r2) * Math.cos(b[1] * r2) * Math.cos((b[0] - a[0]) * r2);
      return (Math.atan2(y, x) / r2 + 360) % 180;
    }, "brg");
    rwF.forEach((f) => {
      const p = f.properties || {};
      if (!p.AIRPORT_ID || /^H/i.test(p.DESIGNATOR || "")) return;
      const comp = String(p.COMP_CODE || "").toUpperCase();
      if (/WATER/.test(comp)) return;
      const polys = vfrPolys(f.geometry, 5), ring = polys[0] && polys[0][0];
      const len = +p.LENGTH || 0;
      const A = byApt[p.AIRPORT_ID] || (byApt[p.AIRPORT_ID] = { len: 0, hard: 0, lit: 0, brg: null, rw: [] });
      const hard = /ASPH|CONC|PEM|BIT|BRICK|TRTD/.test(comp) ? 1 : 0, lit = p.LIGHTINTNS && !/NONE/i.test(p.LIGHTINTNS) ? 1 : 0;
      if (lit) A.lit = 1;
      if (hard && len >= 1500) A.hard = 1;
      if (ring && len > A.len) {
        let a = ring[0], b = ring[1], best = -1;
        for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) {
          const d = (ring[i][0] - ring[j][0]) ** 2 + (ring[i][1] - ring[j][1]) ** 2;
          if (d > best) {
            best = d;
            a = ring[i];
            b = ring[j];
          }
        }
        A.brg = Math.round(brg(a, b));
      }
      if (len > A.len) A.len = len;
      if (ring) A.rw.push(ring);
    });
    const apts = apF.filter((f) => f.geometry && f.geometry.coordinates).map((f) => {
      const p = f.properties || {}, c = f.geometry.coordinates, A = byApt[p.GLOBAL_ID] || { len: 0, hard: 0, lit: 0, brg: null, rw: [] };
      const id = p.IDENT || "";
      A.rw.forEach((rg) => rwys.push([id, rg]));
      return [id, p.ICAO_ID || "", p.NAME || "", +c[0].toFixed(5), +c[1].toFixed(5), p.ELEVATION != null ? Math.round(+p.ELEVATION) : null, p.TYPE_CODE || "AD", +p.PRIVATEUSE ? 1 : 0, /MIL/.test(p.MIL_CODE || "") ? 1 : 0, twr.has(id) ? 1 : 0, A.len, A.hard, A.lit, A.brg];
    });
    const vps = vpF.filter((f) => f.geometry && f.geometry.coordinates).map((f) => [(f.properties || {}).IDENT || "", +f.geometry.coordinates[0].toFixed(5), +f.geometry.coordinates[1].toFixed(5)]);
    const obs = obF.filter((f) => f.geometry && f.geometry.coordinates).map((f) => {
      const p = f.properties || {};
      return [+f.geometry.coordinates[0].toFixed(4), +f.geometry.coordinates[1].toFixed(4), Math.round(+p.AGL || 0), Math.round(+p.AMSL || 0), /^[NU]?$/.test(String(p.Lighting || "").trim()) ? 0 : 1];
    });
    r = new Response(JSON.stringify({ cell: [la, lo], as, sua, apts, rwys, vps, obs }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=604800" } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck, r.clone()));
    else await cache2.put(ck, r.clone());
  }
  const hd = new Headers(r.headers);
  for (const [k, v] of Object.entries(h)) hd.set(k, v);
  hd.set("Cache-Control", "public, max-age=86400");
  return new Response(r.body, { status: 200, headers: hd });
}
__name(vfrRoute, "vfrRoute");
async function aisPost(svc, params) {
  for (let tr = 0; tr < 4; tr++) {
    if (tr) await new Promise((res) => setTimeout(res, 900 * tr + Math.random() * 400));
    let r;
    try {
      r = await fetchT(AIS_FS + svc + "/FeatureServer/0/query", 15e3, { method: "POST", headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
    } catch (e) {
      if (tr === 3) throw new Error("FAA AIS " + svc + " timed out");
      continue;
    }
    if (r.status === 429 || r.status >= 500) {
      if (tr === 3) throw new Error("FAA AIS " + svc + " " + r.status);
      continue;
    }
    if (!r.ok) throw new Error("FAA AIS " + svc + " " + r.status);
    const j = await r.json();
    if (j.error) {
      if (/too many|rate|busy/i.test(j.error.message || "") && tr < 3) continue;
      throw new Error("FAA AIS " + svc + ": " + (j.error.message || "error"));
    }
    return j;
  }
  throw new Error("FAA AIS " + svc + " is busy, try again");
}
__name(aisPost, "aisPost");
async function awyRoute(url, ctx, h) {
  const at = url.searchParams.get("at"), id = String(url.searchParams.get("id") || "").toUpperCase();
  const cache2 = caches.default;
  if (at) {
    const m = at.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (!m) throw new HttpError(400, "at=lat,lon");
    const la = Math.round(+m[1] * 1e3) / 1e3, lo = Math.round(+m[2] * 1e3) / 1e3, e = 4e-3;
    const ck2 = new Request("https://awy-at.local/v1/" + la + "/" + lo);
    let r2 = await cache2.match(ck2);
    if (!r2) {
      const j = await aisPost("ATS_Route", { where: "1=1", outFields: "IDENT,LEVEL_", geometry: [lo - e, la - e, lo + e, la + e].join(","), geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects", returnGeometry: "false", returnDistinctValues: "true", f: "json" });
      const seen = {}, list = [];
      (j.features || []).forEach((f) => {
        const a = f.attributes || {};
        if (!a.IDENT) return;
        const k = a.IDENT;
        if (!seen[k]) {
          seen[k] = { id: k, lv: a.LEVEL_ || "" };
          list.push(seen[k]);
        } else if (seen[k].lv !== a.LEVEL_) seen[k].lv = "B";
      });
      list.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
      r2 = new Response(JSON.stringify({ at: [la, lo], airways: list }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=604800" } });
      if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck2, r2.clone()));
      else await cache2.put(ck2, r2.clone());
    }
    const hd2 = new Headers(r2.headers);
    for (const [k, v] of Object.entries(h)) hd2.set(k, v);
    hd2.set("Cache-Control", "public, max-age=86400");
    return new Response(r2.body, { status: 200, headers: hd2 });
  }
  if (!/^[A-Z]{1,2}\d{1,4}[A-Z]?$/.test(id)) throw new HttpError(400, "id=airway, for example J84");
  const ck = new Request("https://awy-id.local/v1/" + id);
  let r = await cache2.match(ck);
  if (!r) {
    const segs = [];
    for (let page = 0; page < 5; page++) {
      const j = await aisPost("ATS_Route", { where: "IDENT='" + id + "'", outFields: "OBJECTID,STARTPT_ID,ENDPT_ID,MEA_E_VAL,MEA_W_VAL,LEVEL_", returnGeometry: "true", outSR: "4326", geometryPrecision: "6", resultOffset: String(page * 2e3), resultRecordCount: "2000", f: "json" });
      (j.features || []).forEach((f) => {
        const a = f.attributes || {}, g = f.geometry && f.geometry.paths;
        if (!g || !g.length || !a.STARTPT_ID || !a.ENDPT_ID) return;
        const p0 = g[0][0], pl = g[g.length - 1][g[g.length - 1].length - 1];
        segs.push({ s: a.STARTPT_ID, e: a.ENDPT_ID, ps: [p0[1], p0[0]], pe: [pl[1], pl[0]], mea: [aisV(a.MEA_E_VAL), aisV(a.MEA_W_VAL)].filter((v) => v != null).join("/"), lv: a.LEVEL_ || "" });
      });
      if (!j.exceededTransferLimit) break;
    }
    const ids = [...new Set(segs.flatMap((x) => [x.s, x.e]))], names = {};
    for (const [svc, fld] of [["DesignatedPoints", "IDENT"], ["NAVAIDSystem", "IDENT"]]) {
      const left = ids.filter((x) => !names[x]);
      for (let i = 0; i < left.length; i += 150) {
        const part = left.slice(i, i + 150);
        const j = await aisPost(svc, { where: "GLOBAL_ID IN (" + part.map((x) => "'" + x.replace(/'/g, "") + "'").join(",") + ")", outFields: "GLOBAL_ID," + fld, returnGeometry: "false", f: "json" });
        (j.features || []).forEach((f) => {
          const a = f.attributes || {};
          if (a.GLOBAL_ID) names[a.GLOBAL_ID] = { n: a[fld], k: svc === "NAVAIDSystem" ? "nav" : "fix" };
        });
      }
    }
    const pos = {}, adj = {};
    segs.forEach((x, i) => {
      pos[x.s] = x.ps;
      pos[x.e] = x.pe;
      (adj[x.s] = adj[x.s] || []).push(i);
      (adj[x.e] = adj[x.e] || []).push(i);
    });
    const used = /* @__PURE__ */ new Set(), chains = [];
    const ends = Object.keys(adj).filter((k) => adj[k].length === 1);
    const walk = /* @__PURE__ */ __name((start) => {
      const ch = [start], legs = [];
      let cur = start;
      for (; ; ) {
        const nx = (adj[cur] || []).find((i) => !used.has(i));
        if (nx == null) break;
        used.add(nx);
        const x = segs[nx];
        cur = x.s === cur ? x.e : x.s;
        ch.push(cur);
        legs.push(x.mea);
      }
      return { ch, legs };
    }, "walk");
    ends.forEach((k) => {
      if ((adj[k] || []).some((i) => !used.has(i))) chains.push(walk(k));
    });
    Object.keys(adj).forEach((k) => {
      if ((adj[k] || []).some((i) => !used.has(i))) chains.push(walk(k));
    });
    const out = chains.filter((c) => c.ch.length > 1).map((c) => ({ pts: c.ch.map((k) => {
      const p = pos[k], nm = names[k];
      return [nm ? nm.n : "", +p[0].toFixed(6), +p[1].toFixed(6), nm ? nm.k : ""];
    }), mea: c.legs }));
    r = new Response(JSON.stringify({ id, chains: out }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=604800" } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache2.put(ck, r.clone()));
    else await cache2.put(ck, r.clone());
  }
  const hd = new Headers(r.headers);
  for (const [k, v] of Object.entries(h)) hd.set(k, v);
  hd.set("Cache-Control", "public, max-age=86400");
  return new Response(r.body, { status: 200, headers: hd });
}
__name(awyRoute, "awyRoute");
async function ovgeoRoute(req, url, env, h) {
  const kv = env && env.STORE;
  if (!kv) throw new HttpError(503, "Storage is not set up");
  const keyOf = /* @__PURE__ */ __name((icao2, name2, page2) => "ovgeo:v1:" + icao2 + ":" + String(name2).toUpperCase().replace(/\s+/g, " ").trim().slice(0, 80) + ":" + page2, "keyOf");
  if (req.method === "GET") {
    const icao2 = String(url.searchParams.get("icao") || "").toUpperCase(), name2 = url.searchParams.get("name") || "", page2 = +url.searchParams.get("page") || 1;
    if (!/^[A-Z0-9]{3,4}$/.test(icao2) || !name2) throw new HttpError(400, "icao and name are required");
    const v2 = await kv.get(keyOf(icao2, name2, page2), "json").catch(() => null);
    return json({ geo: ovgeoPub(v2) }, 200, h);
  }
  const origin = req.headers.get("Origin") || "", allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim());
  if (!allowed.includes(origin)) throw new HttpError(403, "Not allowed");
  let b;
  try {
    b = JSON.parse(await req.text());
  } catch (e) {
    throw new HttpError(400, "Bad body");
  }
  const icao = String(b.icao || "").toUpperCase(), name = String(b.name || ""), page = Math.max(1, Math.min(20, +b.page || 1)), g = b.geo || {};
  if (!/^[A-Z0-9]{3,4}$/.test(icao) || !name || name.length > 120) throw new HttpError(400, "icao and name are required");
  const user = String(b.user || "").trim().slice(0, 40);
  if (!user) throw new HttpError(403, "Connect vAMSYS in Settings to share chart alignments");
  if (env.VAMSYS_CLIENT_ID && env.VAMSYS_CLIENT_SECRET) {
    try {
      await findPilot(env, user);
    } catch (e) {
      throw new HttpError(403, "Only Polaris pilots can share chart alignments");
    }
  }
  const k = keyOf(icao, name, page), old = await kv.get(k, "json").catch(() => null);
  const snap = /* @__PURE__ */ __name((o) => ({ lat: o.lat, lon: o.lon, h: o.h, rot: o.rot, t: o.t || 0, by: o.by || "" }), "snap");
  if (b.revert) {
    if (!old || !Array.isArray(old.prev) || !old.prev.length) throw new HttpError(409, "There is no earlier alignment to go back to");
    const [back, ...rest] = old.prev;
    const v2 = { ...back, t: Date.now(), n: (old.n || 0) + 1, undoneBy: user, prev: rest };
    await kv.put(k, JSON.stringify(v2));
    return json({ ok: true, geo: ovgeoPub(v2) }, 200, h);
  }
  const num = /* @__PURE__ */ __name((v2) => typeof v2 === "number" && isFinite(v2), "num");
  if (!num(g.lat) || !num(g.lon) || !num(g.h) || !num(g.rot) || Math.abs(g.lat) > 85 || Math.abs(g.lon) > 180 || g.h < 300 || g.h > 8e5) throw new HttpError(400, "Alignment out of range");
  try {
    const a = await airportRoute(icao);
    const ap = a && a.airport;
    if (ap && isFinite(ap.lat)) {
      const d = Math.hypot(g.lat - ap.lat, (g.lon - ap.lon) * Math.cos(ap.lat * Math.PI / 180)) * 60;
      if (d > Math.max(60, g.h / 1852 * 1.5)) throw new HttpError(400, "Alignment is too far from the airport");
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
  }
  if (old && Date.now() - (old.t || 0) < 5e3 && old.by === user) return json({ ok: true, geo: ovgeoPub(old) }, 200, h);
  const prev = old ? [snap(old), ...Array.isArray(old.prev) ? old.prev : []].slice(0, 5) : [];
  const v = { lat: +g.lat.toFixed(7), lon: +g.lon.toFixed(7), h: Math.round(g.h * 10) / 10, rot: Math.round((g.rot % 360 + 360) % 360 * 100) / 100, t: Date.now(), n: (old && old.n || 0) + 1, by: user, prev };
  await kv.put(k, JSON.stringify(v));
  return json({ ok: true, geo: ovgeoPub(v) }, 200, h);
}
__name(ovgeoRoute, "ovgeoRoute");
function ovgeoPub(v) {
  return v ? { lat: v.lat, lon: v.lon, h: v.h, rot: v.rot, t: v.t || 0, n: v.n || 0, by: v.by || "", undo: Array.isArray(v.prev) ? v.prev.length : 0 } : null;
}
__name(ovgeoPub, "ovgeoPub");
async function aptsBuild(kv) {
  const r = await fetchT("https://davidmegginson.github.io/ourairports-data/airports.csv", 25e3, { headers: { "User-Agent": "PolarisEFB/1.0 (virtual airline EFB)" } });
  if (!r.ok) throw new HttpError(502, "OurAirports " + r.status);
  const t = await r.text();
  const lines = t.split("\n"), split = /* @__PURE__ */ __name((ln) => {
    const out = [];
    let f = "", q = false;
    for (let i = 0; i < ln.length; i++) {
      const c = ln[i];
      if (q) {
        if (c === '"') {
          if (ln[i + 1] === '"') {
            f += '"';
            i++;
          } else q = false;
        } else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") {
        out.push(f);
        f = "";
      } else if (c !== "\r") f += c;
    }
    out.push(f);
    return out;
  }, "split");
  const head = split(lines[0]), col = /* @__PURE__ */ __name((n) => head.indexOf(n), "col");
  const C = { ident: col("ident"), type: col("type"), name: col("name"), lat: col("latitude_deg"), lon: col("longitude_deg"), ctry: col("iso_country"), muni: col("municipality"), sched: col("scheduled_service"), icao: col("icao_code"), iata: col("iata_code"), gps: col("gps_code") };
  const four = /* @__PURE__ */ __name((x) => /^[A-Z]{4}$/.test(x || ""), "four"), A = [], B = [];
  for (let k = 1; k < lines.length; k++) {
    const ln = lines[k];
    if (!ln || !/(large_airport|medium_airport|small_airport)/.test(ln)) continue;
    const f = split(ln), type = f[C.type], lat = +f[C.lat], lon = +f[C.lon];
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const code = C.icao >= 0 && four(f[C.icao]) && f[C.icao] || four(f[C.gps]) && f[C.gps] || four(f[C.ident]) && f[C.ident] || "";
    const name = String(f[C.name] || "").replace(/\s+(International|Intl\.?)\s+Airport$/i, " Intl").replace(/\s+Airport$/i, "").slice(0, 44), L = Math.round(lat * 1e4) / 1e4, O = Math.round(lon * 1e4) / 1e4;
    if (type === "large_airport") A.push([code || f[C.ident], f[C.iata] || "", name, L, O, 1, f[C.ctry] || "", String(f[C.muni] || "").slice(0, 30)]);
    else if (type === "medium_airport") A.push([code || f[C.ident], f[C.iata] || "", name, L, O, f[C.sched] === "yes" ? 2 : 3, f[C.ctry] || "", String(f[C.muni] || "").slice(0, 30)]);
    else if (type === "small_airport" && code) B.push([code, name, L, O]);
  }
  A.sort((x, y) => x[5] - y[5]);
  const v = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), a = JSON.stringify({ v, a: A }), b = JSON.stringify({ v, a: B });
  if (kv) {
    await kv.put("apts:v1:a", a, { expirationTtl: 30 * 86400 });
    await kv.put("apts:v1:b", b, { expirationTtl: 30 * 86400 });
    await kv.put("apts:v1:t", String(Date.now()), { expirationTtl: 30 * 86400 });
  }
  return { a, b };
}
__name(aptsBuild, "aptsBuild");
async function aptsRoute(url, env, ctx, h) {
  const set = url.searchParams.get("set") === "b" ? "b" : "a", kv = env && env.STORE;
  let body = kv ? await kv.get("apts:v1:" + set) : null;
  const t = kv ? +await kv.get("apts:v1:t") || 0 : 0;
  if (!body) body = (await aptsBuild(kv))[set];
  else if (Date.now() - t > 14 * 864e5 && ctx && ctx.waitUntil) ctx.waitUntil(aptsBuild(kv).catch(() => {
  }));
  return new Response(body, { status: 200, headers: { ...h, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
__name(aptsRoute, "aptsRoute");
var index_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshMajor(env, ctx));
  },
  async fetch(req, env, ctx) {
    const h = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (new URL(req.url).pathname.replace(/\/+$/, "") === "/api/efb/ovgeo" && (req.method === "GET" || req.method === "POST")) {
      try {
        return await ovgeoRoute(req, new URL(req.url), env, h);
      } catch (e) {
        return json({ error: e.message || "Error" }, e.status || 500, h);
      }
    }
    {
      const pth = new URL(req.url).pathname;
      if (pth === "/admin" || pth === "/admin/" || pth.startsWith("/admin/")) return await mailAdmin(req, new URL(req.url), env, { live: /* @__PURE__ */ __name(async () => liveFlights(await vatsimFeed(ctx)), "live") });
    }
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405, h);
    const url = new URL(req.url);
    const configured = Boolean(env.VAMSYS_CLIENT_ID && env.VAMSYS_CLIENT_SECRET);
    try {
      const ov = url.pathname.match(/^\/api\/efb\/oaip\/v\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
      if (ov) return await oaipVector(ov, env, ctx, h);
      switch (url.pathname.replace(/\/+$/, "")) {
        case "/api/efb/health":
          return json({ ok: true, configured, openaip: Boolean(env.OPENAIP_API_KEY), updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, 200, h);
        case "/api/efb/pilot":
          if (!configured) break;
          return json({ ...await pilotRoute(env, url.searchParams.get("username")), updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, 200, h);
        case "/api/efb/bookings":
          if (!configured) break;
          return json({ ...await bookingsRoute(env, url.searchParams.get("username")), updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, 200, h);
        case "/api/efb/charts":
          return json({ ...await chartsRoute(url.searchParams.get("icao"), env, ctx), updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, 200, h);
        case "/api/efb/chart-pdf":
          return await chartPdfRoute(url, h);
        case "/api/efb/airport-layout": {
          const p = layoutRoute(url.searchParams.get("icao"), env, ctx);
          if (ctx && ctx.waitUntil) ctx.waitUntil(p.catch(() => {
          }));
          return json({ ...await p, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, 200, h);
        }
        case "/api/efb/airport":
          return json({ ...await airportRoute(url.searchParams.get("icao"), ctx), updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, 200, h);
        case "/api/efb/major":
          return json({ ...await majorRoute(env), updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, 200, h);
        case "/api/efb/metars":
          return await metarCellRoute(url.searchParams.get("cell"), url.searchParams.get("size"), ctx, h);
        case "/api/efb/winds":
          return await windRoute(url, ctx, h);
        case "/api/efb/gwx":
          return await gwxRoute(url, ctx, h);
        case "/api/efb/sat":
          return await satRoute(url, ctx, h);
        case "/api/efb/apts":
          return await aptsRoute(url, env, ctx, h);
        case "/api/efb/awy":
          return await awyRoute(url, ctx, h);
        case "/api/efb/ifr":
          return await ifrRoute(url, ctx, h);
        case "/api/efb/vfr":
          return await vfrRoute(url, ctx, h);
        case "/api/efb/fc":
          return await fcRoute(url, ctx, h);
        case "/api/efb/tz":
          return await tzRoute(url, ctx, h);
        case "/api/efb/atis":
          return await atisRoute(url.searchParams.get("icao"), ctx, h);
        case "/api/efb/pireps":
          return await pirepCellRoute(url.searchParams.get("cell"), ctx, h);
        case "/api/efb/fir":
          return json(await firRoute(), 200, h);
        case "/api/efb/radar":
          return json(await radarRoute(), 200, h);
        case "/api/efb/vatsim":
          return await vatsimRoute(req, url, ctx, h);
        case "/api/efb/mail":
          return await mailPublic(req, env, h);
        case "/api/efb/mail-att":
          return await mailAttachment(url, env, h);
        case "/api/efb/sigmets":
          return json({ ...await sigmetRoute(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, 200, h);
        case "/api/efb/live":
          if (!configured) break;
          return json({ ...await liveRoute(env), updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, 200, h);
        case "/api/efb/fleet":
          if (!configured) break;
          return json({ fleet: await fleets(env), updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, 200, h);
        default:
          return json({ error: "Not found" }, 404, h);
      }
      return json({ error: "vAMSYS keys are not set on the server" }, 503, h);
    } catch (e) {
      return json({ error: e.message || "Server error" }, e.status || 500, h);
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
