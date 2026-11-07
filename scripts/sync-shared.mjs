// 讓全站共用的東西只在一個地方改，其他地方自動同步：
//
//   site-config.json   網站網址、VATSIM 會員編號、各頁標題與說明……（唯一要手改的設定檔）
//   partials/header.html、partials/footer.html   導覽列、頁尾（5 個頁面共用）
//
// 執行 `node scripts/sync-shared.mjs` 會更新：
//   1. 各頁 <!-- shared:head --> 區塊：標題、說明、og:/twitter: 分享資訊、canonical、theme-color、網站圖示
//   2. 各頁 <!-- shared:header --> / <!-- shared:footer --> 區塊：導覽列（自動標出目前所在頁）和頁尾
//   3. 各頁引用的 style.css、site.js、config.js、js/*.js 後面的 ?v=版本碼（用檔案內容算，內容變了版本碼才變）
//   4. config.js（給網頁讀的設定，內容來自 site-config.json，不要手改）
//   5. sitemap.xml、robots.txt
//   6. workers/flight-trail/wrangler.toml 裡的 VATSIM_CID、ALLOWED_ORIGINS、網域
//      （Cloudflare 只會看 workers/flight-trail 資料夾，讀不到根目錄的設定，所以用這個腳本抄過去）
//
// `node scripts/sync-shared.mjs --check` 只檢查不改檔，有檔案不同步就用錯誤結束（可以拿去放進自動檢查）。
// 沒有任何外部套件，Node 18 以上就能跑。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const abs = (f) => path.join(ROOT, f);
const read = (f) => readFileSync(abs(f), 'utf8').replace(/\r\n/g, '\n');   // Windows 的換行不影響結果
const changed = [];

function write(file, content) {
    const old = existsSync(abs(file)) ? read(file) : null;
    if (old === content) return;
    changed.push(file);
    if (!CHECK) writeFileSync(abs(file), content);
}

const cfg = JSON.parse(read('site-config.json'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const siteUrl = cfg.siteUrl.replace(/\/+$/, '');
const trailBase = cfg.trailBase.replace(/\/+$/, '');

// ---------- config.js（網頁讀的設定）----------
const configJs =
    '// 自動產生，請不要直接改這個檔案：改 site-config.json，再執行 node scripts/sync-shared.mjs\n' +
    'window.SITE_CONFIG = ' + JSON.stringify({ siteUrl, vatsimCid: cfg.vatsimCid, trailBase }) + ';\n';
write('config.js', configJs);

// ---------- 版本碼 ----------
const versionCache = new Map();
function versionOf(file) {
    if (versionCache.has(file)) return versionCache.get(file);
    const text = file === 'config.js' ? configJs : read(file);
    const v = createHash('sha1').update(text).digest('hex').slice(0, 8);
    versionCache.set(file, v);
    return v;
}
function stampVersions(html) {
    return html.replace(/\b(href|src)="(\/?)(style\.css|site\.js|config\.js|js\/[\w.-]+\.js)(?:\?v=[\w]*)?"/g,
        (_, attr, slash, file) => `${attr}="${slash}${file}?v=${versionOf(file)}"`);
}

// ---------- 片段 ----------
const toAbsolute = (html) => html.replace(/\b(href|src)="(?!https?:|mailto:|#|\/)([^"]+)"/g, '$1="/$2"');

function headBlock(page) {
    const url = siteUrl + page.path;
    const title = esc(page.title);
    const desc = esc(page.description);
    const lines = [
        `<title>${title}</title>`,
        `<meta name="description" content="${desc}" />`,
        `<meta name="theme-color" content="${cfg.themeColor.light}" />`
    ];
    if (page.noindex) lines.push('<meta name="robots" content="noindex" />');
    else if (page.canonical !== false) lines.push(`<link rel="canonical" href="${url}" />`);
    lines.push(
        '<meta property="og:type" content="website" />',
        `<meta property="og:site_name" content="${esc(cfg.siteName)}" />`,
        `<meta property="og:locale" content="${cfg.locale}" />`,
        `<meta property="og:title" content="${title}" />`,
        `<meta property="og:description" content="${desc}" />`,
        ...(page.canonical === false ? [] : [`<meta property="og:url" content="${url}" />`]),
        `<meta property="og:image" content="${siteUrl}/${cfg.ogImage}" />`,
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        `<meta property="og:image:alt" content="${esc(cfg.ogImageAlt)}" />`,
        '<meta name="twitter:card" content="summary_large_image" />',
        '<link rel="icon" href="favicon-32.png" type="image/png" sizes="32x32">',
        '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
        // 在畫面出來前就先套用深色／淺色模式，避免閃一下
        "<script>document.documentElement.classList.add('js');try{var t=localStorage.getItem('theme');" +
        "if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}" +
        "document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name=\"theme-color\"]');" +
        `if(m)m.content=t==='dark'?'${cfg.themeColor.dark}':'${cfg.themeColor.light}';}catch(e){}</script>`
    );
    let html = lines.map((l) => '    ' + l).join('\n');
    if (page.absolute) html = toAbsolute(html);
    return html;
}

function navLinks(page, mobile) {
    return cfg.navLinks.map((l, i) => {
        const cur = page.nav === l.href ? ' aria-current="page"' : '';
        return mobile
            ? `            <li style="--i:${i}"><a class="title-1" href="${l.href}"${cur}>${l.label}</a></li>`
            : `                    <li><a class="nav-link title-3" href="${l.href}"${cur}>${l.label}</a></li>`;
    }).join('\n');
}

function headerBlock(page) {
    let html = read('partials/header.html').replace(/\n+$/, '')
        .replace('{{NAV_DESKTOP}}', navLinks(page, false))
        .replace('{{NAV_MOBILE}}', navLinks(page, true));
    if (page.absolute) html = toAbsolute(html);
    return html;
}

function footerBlock(page) {
    let html = read('partials/footer.html').replace(/\n+$/, '');
    if (page.absolute) html = toAbsolute(html);
    return html;
}

function replaceBlock(html, name, body, file) {
    const re = new RegExp(`( *)<!-- shared:${name}[^>]*-->\\n(?:[\\s\\S]*?\\n)? *<!-- /shared:${name} -->`);
    if (!re.test(html)) throw new Error(`${file} 找不到 <!-- shared:${name} --> ... <!-- /shared:${name} --> 區塊`);
    const note = name === 'head' ? '（自動產生，請改 site-config.json）' : '（自動產生，請改 partials/ 底下的檔案）';
    return html.replace(re, () => `    <!-- shared:${name} ${note} -->\n${body}\n    <!-- /shared:${name} -->`);
}

// ---------- 各頁 ----------
for (const page of cfg.pages) {
    let html = read(page.file);
    html = replaceBlock(html, 'head', headBlock(page), page.file);
    html = replaceBlock(html, 'header', headerBlock(page), page.file);
    html = replaceBlock(html, 'footer', footerBlock(page), page.file);
    html = stampVersions(html);
    write(page.file, html);
}

// ---------- sitemap.xml、robots.txt ----------
const urls = [];
for (const page of cfg.pages) {
    if (page.noindex) continue;
    urls.push(page.path);
    for (const extra of page.sitemap || []) urls.push(extra);
}
write('sitemap.xml',
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${esc(siteUrl + u)}</loc></url>`).join('\n') + '\n</urlset>\n');
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);

// ---------- wrangler.toml ----------
const wranglerFile = 'workers/flight-trail/wrangler.toml';
if (existsSync(abs(wranglerFile))) {
    const host = new URL(siteUrl).host;
    const origins = [siteUrl, host.startsWith('www.') ? null : `https://www.${host}`].filter(Boolean).join(',');
    let toml = read(wranglerFile);
    const sub = (re, val, what) => {
        if (!re.test(toml)) throw new Error(`${wranglerFile} 找不到 ${what}`);
        toml = toml.replace(re, val);
    };
    sub(/^VATSIM_CID = ".*"$/m, `VATSIM_CID = "${cfg.vatsimCid}"`, 'VATSIM_CID');
    sub(/^ALLOWED_ORIGINS = ".*"$/m, `ALLOWED_ORIGINS = "${origins}"`, 'ALLOWED_ORIGINS');
    sub(/pattern = "[^"]*"/, `pattern = "${new URL(trailBase).host}"`, 'routes 的 pattern');
    write(wranglerFile, toml);
}

if (changed.length) {
    console.log((CHECK ? '這些檔案和設定不同步：\n  ' : '已更新：\n  ') + changed.join('\n  '));
    if (CHECK) {
        console.error('請執行 node scripts/sync-shared.mjs');
        process.exit(1);
    }
} else {
    console.log('全部已同步，沒有變動。');
}
