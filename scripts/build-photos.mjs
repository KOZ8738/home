// 掃描 photos/<系列>/ 資料夾，產生 data/photos.json（相簿頁用）
// 有安裝 sharp 的話，另外做縮圖到 photos/_thumbs/<系列>/（相簿格子載入快很多）
// 用法：node scripts/build-photos.mjs
import { readdir, readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SERIES = ['realworld', 'sim', 'horizon'];
const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const THUMB_W = 1000;
const OUT = path.join(ROOT, 'data', 'photos.json');

let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* 沒有 sharp：略過縮圖 */ }

// ---------- 讀圖片尺寸與拍攝日期（不依賴套件） ----------
function jpegInfo(buf) {
    let w = 0, h = 0, orient = 1, date = null;
    let i = 2;
    while (i + 4 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m === 0xff) { i++; continue; }
        const len = buf.readUInt16BE(i + 2);
        if (m === 0xe1 && buf.toString('latin1', i + 4, i + 8) === 'Exif') {
            try {
                const ex = exifInfo(buf.subarray(i + 10, i + 2 + len));
                orient = ex.orient; date = ex.date;
            } catch { /* 忽略壞掉的 EXIF */ }
        }
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
            h = buf.readUInt16BE(i + 5);
            w = buf.readUInt16BE(i + 7);
            break;
        }
        i += 2 + len;
    }
    if (orient >= 5 && orient <= 8) [w, h] = [h, w];
    return { w, h, date };
}

function exifInfo(t) {
    const le = t.toString('latin1', 0, 2) === 'II';
    const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
    const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
    const out = { orient: 1, date: null };
    const readIfd = (off, want) => {
        const n = u16(off);
        const found = {};
        for (let k = 0; k < n; k++) {
            const e = off + 2 + k * 12;
            const tag = u16(e);
            if (!want.includes(tag)) continue;
            const type = u16(e + 2), cnt = u32(e + 4);
            if (type === 2) {
                const vo = cnt > 4 ? u32(e + 8) : e + 8;
                found[tag] = t.toString('latin1', vo, vo + cnt - 1);
            } else if (type === 3) found[tag] = u16(e + 8);
            else found[tag] = u32(e + 8);
        }
        return found;
    };
    const ifd0 = readIfd(u32(4), [0x0112, 0x0132, 0x8769]);
    out.orient = ifd0[0x0112] || 1;
    let d = ifd0[0x0132];
    if (ifd0[0x8769]) {
        const sub = readIfd(ifd0[0x8769], [0x9003]);
        if (sub[0x9003]) d = sub[0x9003];
    }
    const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(d || '');
    if (m) out.date = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
    return out;
}

function pngInfo(buf) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), date: null };
}

function webpInfo(buf) {
    const tag = buf.toString('latin1', 12, 16);
    if (tag === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), date: null };
    if (tag === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, date: null };
    if (tag === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, date: null };
    }
    return { w: 0, h: 0, date: null };
}

function gifInfo(buf) {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8), date: null };
}

async function readInfo(file, ext) {
    const buf = await readFile(file);
    try {
        if (ext === '.jpg' || ext === '.jpeg') return jpegInfo(buf);
        if (ext === '.png') return pngInfo(buf);
        if (ext === '.webp') return webpInfo(buf);
        if (ext === '.gif') return gifInfo(buf);
    } catch { /* 往下用 sharp 補 */ }
    if (sharp) {
        const m = await sharp(buf).metadata();
        return { w: m.width || 0, h: m.height || 0, date: null };
    }
    return { w: 0, h: 0, date: null };
}

// 檔名裡有日期的話也認得，例如 20240512、2024-05-12、IMG_20240512_1830
function dateFromName(name) {
    const m = /(20\d{2})[-_.]?([01]\d)[-_.]?([0-3]\d)(?:[-_. T]?([0-2]\d)([0-5]\d)([0-5]\d)?)?/.exec(name);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}T${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}`;
}

async function walk(dir) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...await walk(p));
        else if (EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
    }
    return out;
}

// 沒有 EXIF、檔名也沒日期時：用 git 記錄的加入時間，再不行才用檔案修改時間
// （GitHub Actions 裡檔案修改時間是 checkout 當下，沒有意義，所以先看 git）
function fileTime(file, mtime) {
    try {
        const out = execFileSync('git', ['log', '--diff-filter=A', '-1', '--format=%cI', '--', file],
            { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (out) return new Date(out).toISOString().slice(0, 19);
    } catch { /* 不是 git 資料夾 */ }
    return new Date(mtime).toISOString().slice(0, 19);
}

const toUrl = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// ---------- 主流程 ----------
let prev = {};
try { prev = JSON.parse(await readFile(OUT, 'utf8')).series || {}; } catch { /* 第一次執行 */ }

const result = {};
const keepThumbs = new Set();
let madeThumbs = 0;

for (const s of SERIES) {
    const dir = path.join(ROOT, 'photos', s);
    await mkdir(dir, { recursive: true });
    const files = await walk(dir);
    const old = new Map((prev[s] || []).map((p) => [p.src, p]));
    const list = [];

    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        const src = toUrl(file);
        const { size, mtimeMs } = await stat(file);
        const info = await readInfo(file, ext);
        const date = info.date || dateFromName(path.basename(file)) || fileTime(file, mtimeMs);

        let thumb = null;
        if (sharp && ext !== '.gif') {
            const tp = path.join(ROOT, 'photos', '_thumbs', s, path.relative(dir, file) + '.webp');
            const o = old.get(src);
            const fresh = o && o.bytes === size && o.thumb && existsSync(tp);
            if (!fresh) {
                await mkdir(path.dirname(tp), { recursive: true });
                await sharp(file, { limitInputPixels: false })
                    .rotate()
                    .resize({ width: THUMB_W, withoutEnlargement: true })
                    .webp({ quality: 80 })
                    .toFile(tp);
                madeThumbs++;
            }
            thumb = toUrl(tp);
            keepThumbs.add(tp);
        }
        list.push({ src, thumb, w: info.w || null, h: info.h || null, date, bytes: size });
    }

    // 越靠近現在的越前面；時間相同就依檔名由大到小（IMG_0200 排在 IMG_0100 前面）
    list.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return b.src.localeCompare(a.src, 'en', { numeric: true });
    });
    result[s] = list;
}

// 清掉原圖已刪除的縮圖
const thumbRoot = path.join(ROOT, 'photos', '_thumbs');
for (const f of await walk0(thumbRoot)) {
    if (!keepThumbs.has(f)) await rm(f);
}

async function walk0(dir) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...await walk0(p));
        else out.push(p);
    }
    return out;
}

await mkdir(path.dirname(OUT), { recursive: true });
const next = JSON.stringify({ series: result }, null, 1) + '\n';
let same = false;
try { same = (await readFile(OUT, 'utf8')) === next; } catch { /* 不存在 */ }
if (!same) await writeFile(OUT, next);

const counts = SERIES.map((s) => `${s} ${result[s].length}`).join('、');
console.log(`photos: ${counts}${sharp ? `；新縮圖 ${madeThumbs}` : '；未安裝 sharp，略過縮圖'}${same ? '（無變動）' : ''}`);
