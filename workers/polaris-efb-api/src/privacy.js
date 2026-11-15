/* The Polaris EFB privacy policy, served on /privacy. vAMSYS shows this link on its "Login with vAMSYS" consent
   screen, so it must stay public and must describe what the EFB receives through the Pilot API and keeps. */
export const PRIVACY_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Polaris EFB · Privacy Policy</title>
<meta name="description" content="How the Polaris EFB handles pilot information, including data received through Login with vAMSYS.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&family=Marcellus&display=swap" rel="stylesheet">
<style>
:root{color-scheme:light;--teal:#1A6772;--accent:#1A6772;--bronze:#A78970;--ink:#0F2A2E;--label:#51696C;--line:#D5DEDE;--bg:#FFFFFF;--soft:#F5F8F8}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--accent:#7CC2C9;--ink:#E8E8E9;--label:#9C9CA1;--line:#2E2E32;--bg:#121213;--soft:#1A1A1C}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 Jost,"Avenir Next","Segoe UI",system-ui,sans-serif}
header.top{border-bottom:1px solid var(--line);padding:18px 24px}header.top b{font:400 21px Marcellus,Georgia,serif;color:var(--accent);letter-spacing:.02em}header.top span{color:var(--bronze);margin-left:10px;font-size:14px;letter-spacing:.08em;text-transform:uppercase}
main{max-width:1080px;margin:0 auto;padding:40px 24px 80px;display:grid;grid-template-columns:220px minmax(0,1fr);gap:48px}
@media(max-width:820px){main{grid-template-columns:1fr;gap:24px}nav.toc{position:static!important}}
.head{grid-column:1/-1}.eyebrow{font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--bronze);font-weight:500}
h1{font:400 44px/1.15 Marcellus,Georgia,serif;margin:8px 0 6px}.date{color:var(--label);font-size:14px;margin:0 0 16px}.lede{font-size:18px;max-width:760px;margin:0}
nav.toc{position:sticky;top:24px;align-self:start;display:flex;flex-direction:column;gap:6px;font-size:14px}nav.toc b{font-weight:600;margin-bottom:4px}nav.toc a{color:var(--label);text-decoration:none}nav.toc a:hover{color:var(--accent)}
section{padding-bottom:18px;border-bottom:1px solid var(--line);margin-bottom:26px}section:last-child{border:0}
h2{font:400 26px Marcellus,Georgia,serif;margin:0 0 10px}h3{font-size:16px;font-weight:600;margin:18px 0 6px}
a{color:var(--accent)}ul{padding-left:20px}li{margin:4px 0}code{font:14px "IBM Plex Mono",ui-monospace,Consolas,monospace;background:var(--soft);border:1px solid var(--line);border-radius:4px;padding:0 5px}
table{width:100%;border-collapse:collapse;font-size:14.5px;margin:10px 0}th,td{text-align:left;vertical-align:top;padding:9px 10px;border-bottom:1px solid var(--line)}th{font-weight:600;color:var(--label);font-size:12.5px;letter-spacing:.06em;text-transform:uppercase}
.wrap-t{overflow-x:auto}.note{color:var(--label);font-size:14px}
</style></head><body>
<header class="top"><b>Polaris Airways</b><span>EFB</span></header>
<main>
<div class="head">
 <div class="eyebrow">Legal</div>
 <h1>Polaris EFB Privacy Policy</h1>
 <p class="date">Effective 15 November 2026</p>
 <p class="lede">The Polaris EFB is the electronic flight bag for pilots of Polaris Airways, a virtual airline for flight simulation. Pilots sign in with their vAMSYS account. This page explains what the EFB receives when you sign in, what it keeps, and what you can do about it.</p>
</div>
<nav class="toc" aria-label="On this page"><b>On this page</b>
 <a href="#signin">Signing in with vAMSYS</a><a href="#keep">What we keep</a><a href="#use">How we use it</a><a href="#mail">Polaris Mail</a><a href="#device">Stored on your device</a><a href="#live">Live flight data</a><a href="#third">Third-party services</a><a href="#retention">How long we keep it</a><a href="#choices">Your choices</a><a href="#changes">Changes</a><a href="#contact">Contact</a>
</nav>
<article>
<section id="signin"><h2>Signing in with vAMSYS</h2>
 <p>When you choose <b>Continue with vAMSYS</b>, you sign in on the vAMSYS website, not in the EFB. The EFB never sees your vAMSYS password. vAMSYS shows you the information the EFB asks for and you decide whether to allow it. With your consent, vAMSYS shares:</p>
 <div class="wrap-t"><table><thead><tr><th>Scope</th><th>What it includes</th></tr></thead><tbody>
  <tr><td><code>identity:basic</code></td><td>Your vAMSYS user ID, name and email address</td></tr>
  <tr><td><code>identity:networks</code></td><td>Your flight simulation network IDs, such as your VATSIM CID</td></tr>
  <tr><td><code>pilot:read</code></td><td>Your Polaris pilot profile: pilot ID, rank, statistics and badges</td></tr>
  <tr><td><code>flights:read</code></td><td>Your bookings, PIREPs and logbook at Polaris</td></tr>
 </tbody></table></div>
 <p>The EFB uses the access token vAMSYS issues only at sign-in, to read the information above, and then discards it. It does not keep vAMSYS tokens.</p>
</section>
<section id="keep"><h2>What we keep</h2>
 <p>The EFB server (a Cloudflare Worker with Cloudflare's key-value storage) keeps a small record for each pilot who signs in:</p>
 <ul>
  <li>Pilot ID (for example PAW0006), vAMSYS pilot ID and the name vAMSYS shows for you</li>
  <li>Your VATSIM CID, if you have one on your vAMSYS account</li>
  <li>When you first and last signed in</li>
  <li>Your active EFB sign-ins: when each one started and when it expires</li>
 </ul>
 <p>Your email address is not stored. The EFB does not store passwords of any kind on the server.</p>
</section>
<section id="use"><h2>How we use it</h2>
 <ul>
  <li>To confirm that you are a Polaris Airways pilot and keep you signed in</li>
  <li>To show your own vAMSYS profile, bookings and logbook in the EFB</li>
  <li>To deliver Polaris Mail messages that staff address to you</li>
  <li>To let Polaris staff see which pilots use the EFB and sign a device out if needed</li>
 </ul>
 <p>We do not sell or share this information, use it for advertising, or combine it with other sources.</p>
</section>
<section id="mail"><h2>Polaris Mail</h2>
 <p>Notices from Polaris staff are stored on the EFB server. Messages to all pilots can be read by every signed-in pilot; a message addressed to you is shown only to you. Which messages you have read or moved to Trash is kept on your device only.</p>
</section>
<section id="device"><h2>Stored on your device</h2>
 <p>The EFB keeps the following in your browser's storage. It stays on your device unless the EFB needs to send part of it to the EFB server to work (for example your sign-in).</p>
 <div class="wrap-t"><table><thead><tr><th>Item</th><th>Why</th><th>Kept until</th></tr></thead><tbody>
  <tr><td>Sign-in token</td><td>Keeps you signed in</td><td>30 days, or until you sign out</td></tr>
  <tr><td>Lock screen passcode</td><td>Unlocks the EFB on this device</td><td>You change it, sign out or clear site data</td></tr>
  <tr><td>Your flight plan (SimBrief OFP) and logbook entries</td><td>Shown in the flight plan, loadsheet and logbook apps</td><td>You replace or delete them</td></tr>
  <tr><td>Settings, checklist progress, map layers, read and Trash marks</td><td>Keeps the EFB the way you set it</td><td>You clear site data</td></tr>
 </tbody></table></div>
</section>
<section id="live"><h2>Live flight data</h2>
 <p>While you fly a Polaris flight tracked by vAMSYS, or connected to VATSIM with a Polaris callsign, your flight's position, altitude, speed, route and phase are shown on the Polaris website's Network page, in the EFB map and to Polaris staff. This information comes from vAMSYS and from VATSIM's public data feed.</p>
</section>
<section id="third"><h2>Third-party services</h2>
 <p>The EFB connects to outside services to work. Each receives the technical details any web request involves, such as your IP address, and handles them under its own privacy policy.</p>
 <ul>
  <li><b>vAMSYS</b>: sign-in, pilot data and flight tracking</li>
  <li><b>Cloudflare</b>: hosts the EFB server, which may keep standard request logs</li>
  <li><b>SimBrief</b>: your flight plan, loaded with the SimBrief username you enter</li>
  <li><b>VATSIM</b>: public network data for traffic and ATIS</li>
  <li><b>Weather, chart and map providers</b>, such as aviationweather.gov, the FAA, RainViewer and OpenStreetMap</li>
  <li><b>Google Fonts</b>: typefaces</li>
 </ul>
</section>
<section id="retention"><h2>How long we keep it</h2>
 <p>A sign-in lasts 30 days and is deleted when it expires or when you sign out. Your pilot record is kept while you fly for Polaris Airways and is deleted within 30 days after you leave, or sooner if you ask.</p>
</section>
<section id="choices"><h2>Your choices</h2>
 <ul>
  <li>Sign out in the EFB under <b>Settings</b> at any time.</li>
  <li>Remove the Polaris EFB's access in your vAMSYS account settings. The EFB then cannot read your vAMSYS data again until you sign in and allow it.</li>
  <li>Ask Polaris staff to show you or delete the record we keep about you.</li>
  <li>Clear the EFB's data in your browser settings to remove everything stored on your device.</li>
 </ul>
</section>
<section id="changes"><h2>Changes</h2>
 <p>If this policy changes, the new version will be posted on this page with a new effective date. If the change affects what the EFB receives from vAMSYS, you will be asked to allow it again when you next sign in.</p>
</section>
<section id="contact"><h2>Contact</h2>
 <p>Questions about this policy, or requests to see or delete your information, can be sent to Polaris Airways staff through the Polaris Airways Discord server or the contact details on the Polaris Airways website.</p>
 <p class="note">Polaris Airways is a virtual airline for flight simulation only and is not affiliated with any real airline.</p>
</section>
</article>
</main>
</body></html>`;
