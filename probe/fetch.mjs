import fs from 'node:fs';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 PolarisEFB/1.0 (+https://koz8738.com/efb/)', Accept: 'text/html,application/xhtml+xml,application/pdf,*/*', 'Accept-Language': 'en-GB,en;q=0.8' };
fs.mkdirSync('probe/out', { recursive: true });
const jobs = fs.readFileSync('probe/jobs.txt', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => { const i = l.indexOf(' '); return [l.slice(0, i), l.slice(i + 1).trim()]; });
const log = [];
for (const [name, url] of jobs) {
  try {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 30000);
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: ctl.signal }); clearTimeout(tm);
    const buf = Buffer.from(await r.arrayBuffer()), ty = r.headers.get('content-type') || '';
    const ext = /pdf/.test(ty) || buf.slice(0, 5).toString() === '%PDF-' ? 'pdf' : 'html';
    fs.writeFileSync(`probe/out/${name}.${ext}`, buf);
    if (ext === 'html') { const t = buf.toString('utf8'); fs.writeFileSync(`probe/out/${name}.links.txt`, [...t.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).join('\n')); }
    log.push(`${name}\t${r.status}\t${ty}\t${buf.length}\t${r.url}`);
  } catch (e) { log.push(`${name}\tERR\t${e.message}\t\t${url}`); }
}
fs.writeFileSync('probe/out/_log.txt', log.join('\n') + '\n'); console.log(log.join('\n'));
