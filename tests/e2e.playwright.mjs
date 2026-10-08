import { chromium } from 'playwright';
import fs from 'fs';
import { execSync } from 'child_process';

const BASE = 'http://localhost:8765/';
const SHOTS = '/workspace/first-words/screenshots';
const CHANNEL = process.env.CHANNEL || undefined; // 'chrome' to use Google Chrome (has AAC)
const results = [];
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond, extra }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  — ' + extra : '')); };
const errors = [];
const shot = async (pg, name, top = true) => { await pg.evaluate((t) => { document.querySelector('.toast')?.remove(); if (t) window.scrollTo(0, 0); }, top); await pg.waitForTimeout(250); await pg.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch({
  channel: CHANNEL,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const UA_OVERRIDE = process.env.UA === 'iphone' ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' } : {};
const ctxOpts = { ...UA_OVERRIDE, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['microphone'], acceptDownloads: true, locale: 'en-US', timezoneId: 'America/Chicago' };
const ctx = await browser.newContext(ctxOpts);
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE);
await page.waitForFunction(() => window.__fw && window.__fw.ready);

// --- welcome / settings
ok('welcome modal shown on first launch', await page.isVisible('#wName'));
await page.fill('#wName', 'Ava');
await page.fill('#wBirth', '2025-06-15');
await shot(page, '0-welcome');
await page.click('#wGo');
await page.waitForFunction(() => document.querySelector('#appTitle').textContent.includes('Ava'));
ok('header uses child name', (await page.textContent('#appTitle')) === "Ava's First Words", await page.textContent('#appTitle'));
ok('header shows current age', /Ava is 1 year 3 months old/.test(await page.textContent('#appSub')), await page.textContent('#appSub'));

// --- recording
const mime = await page.evaluate(() => pickMime());
console.log('browser picks mime:', mime);

async function recordWord(word, when, note = '', ms = 1300) {
  await page.fill('#wordInput', word);
  await page.click('#recBtn');
  await page.waitForSelector('#recBtn.recording');
  await page.waitForTimeout(ms);
  await page.click('#recBtn');
  await page.waitForSelector('#preview:not(.hidden)');
  if (when) await page.fill('#recDate', when);
  if (note) await page.fill('#recNote', note);
  await page.click('#saveBtn');
  await page.waitForSelector('#preview.hidden', { state: 'attached' });
}

// first one done step by step with checks
await page.fill('#wordInput', 'dada');
await page.click('#recBtn');
await page.waitForSelector('#recBtn.recording');
ok('record button enters recording state', await page.isVisible('#stopIcon'));
await page.waitForTimeout(1200);
ok('recording timer runs', /0:0[1-9]/.test(await page.textContent('#recTime')), await page.textContent('#recTime'));
await shot(page, '2-recording');
await page.click('#recBtn');
await page.waitForSelector('#preview:not(.hidden)');
ok('preview appears after stop', true);
ok('preview shows word', (await page.textContent('#previewWord')).includes('dada'));
await page.click('#previewPlay');
await page.waitForFunction(() => document.querySelector('#previewPlay').classList.contains('playing'), null, { timeout: 4000 }).then(() => ok('preview playback starts', true)).catch(() => ok('preview playback starts', false));
await page.fill('#recDate', '2025-12-28T09:15');
await page.fill('#recNote', 'First time! Said it to Daddy at breakfast');
await page.click('#saveBtn');
await page.waitForSelector('#preview.hidden', { state: 'attached' });

// save without word should be refused
await page.click('#recBtn'); await page.waitForTimeout(700); await page.click('#recBtn');
await page.waitForSelector('#preview:not(.hidden)');
await page.click('#saveBtn');
ok('save blocked when word empty', await page.isVisible('#preview') && (await page.evaluate(() => window.__fw.state.entries.length)) === 1);
await page.click('#discardBtn');

await recordWord('mama', '2026-01-20T17:40');
await recordWord('baby', '2026-04-02T08:05', 'Pointing at herself in the mirror');
await recordWord('bottle', '2026-05-15T19:30', '“ba-ba”');
await recordWord('elephant', '2026-07-04T10:00', 'Sounded like “effa”');
await recordWord('ball', '2026-08-11T16:20');
await recordWord('dada', '2026-09-01T07:45');
await page.fill('#wordInput', 'elephant'); await page.click('#recBtn'); await page.waitForTimeout(1500); await page.click('#recBtn');
await page.waitForSelector('#preview:not(.hidden)'); await page.fill('#recDate', '2026-10-08T10:30'); await page.fill('#recNote', 'Now it’s “ele-fant”!');
await page.evaluate(() => document.querySelector('#recBtn').scrollIntoView({ block: 'start' })); await page.evaluate(() => document.querySelector('.toast')?.remove()); await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/2b-preview.png` });
await page.click('#saveBtn'); await page.waitForSelector('#preview.hidden', { state: 'attached' });

const idb = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('first-words'); q.onsuccess = () => r(q.result); });
  const get = (s) => new Promise((r) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => r(q.result); });
  const entries = await get('entries'); const audio = await get('audio');
  return { n: entries.length, audioN: audio.length, sizes: audio.map((a) => a.byteLength), mimes: [...new Set(entries.map((e) => e.mime))], ages: entries.map((e) => e.word) };
});
ok('8 entries saved in IndexedDB', idb.n === 8, JSON.stringify({ n: idb.n }));
ok('8 audio blobs stored, all non-empty', idb.audioN === 8 && idb.sizes.every((s) => s > 500), 'sizes=' + idb.sizes.join(','));
console.log('stored mime types:', idb.mimes);

ok('backup reminder banner shows', await page.isVisible('.banner'), await page.textContent('#banner'));
ok('stats card', (await page.textContent('#stats')).includes('6'), (await page.textContent('#stats')).replace(/\s+/g, ' '));
await page.evaluate(() => window.scrollTo(0, 0));
await shot(page, '1-record');

// reload: persistence
await page.reload(); await page.waitForFunction(() => window.__fw && window.__fw.ready);
ok('data persists across reload', (await page.evaluate(() => window.__fw.state.entries.length)) === 8);
ok('no welcome after setup', !(await page.isVisible('#wName')));

// --- words view
await page.click('nav.tabs button[data-tab="words"]');
const groups = await page.$$eval('#wordsList .word', (els) => els.map((e) => ({ key: e.dataset.group, n: +e.querySelector('.badge').textContent })));
ok('grouped by word: 6 groups', groups.length === 6, JSON.stringify(groups));
ok('elephant has 2 takes, dada has 2', groups.find((g) => g.key === 'elephant')?.n === 2 && groups.find((g) => g.key === 'dada')?.n === 2);
ok('default sort = first said (dada first)', groups[0].key === 'dada');
await page.click('.word[data-group="elephant"] .wt');
const elTakes = await page.$$eval('.word[data-group="elephant"] .take .tdate', (els) => els.map((e) => e.textContent.trim()));
ok('takes sorted oldest→newest with ages', elTakes.length === 2 && /Jul 4, 2026/.test(elTakes[0]) && /1y 0m|1y/.test(elTakes[0]) && /Oct 8, 2026.*1y 3m/.test(elTakes[1]), JSON.stringify(elTakes));
await page.click('.word[data-group="dada"] .wt');
// playback of a saved take
const takeBtn = '.word[data-group="elephant"] .take .play';
await page.click(takeBtn);
const played = await page.waitForFunction((sel) => { const b = document.querySelector(sel); return b.classList.contains('playing') && parseFloat(getComputedStyle(b).getPropertyValue('--p') || b.style.getPropertyValue('--p')) > 0; }, takeBtn, { timeout: 5000 }).then(() => true).catch(() => false);
ok('saved take plays (progress advances)', played);
await page.waitForTimeout(400);
await shot(page, '3-words');
await page.click(takeBtn); // pause
await page.fill('#searchWords', 'ele');
ok('search filters words', (await page.$$('#wordsList .word')).length === 1);
await page.fill('#searchWords', 'zzz');
ok('search empty state offers to record', (await page.textContent('#wordsList')).includes('Record “zzz” now'));
await page.fill('#searchWords', '');
await page.selectOption('#sortWords', 'az');
ok('A–Z sort', (await page.$eval('#wordsList .word', (e) => e.dataset.group)) === 'baby');

// --- timeline
await page.click('nav.tabs button[data-tab="timeline"]');
const months = await page.$$eval('.month h3', (els) => els.map((e) => e.textContent));
ok('timeline grouped by month (newest first)', months.length === 8 && months[0] === 'October 2026' && months.at(-1) === 'December 2025', JSON.stringify(months));
await page.fill('#searchTimeline', 'dada');
ok('timeline filter by word', (await page.$$('#timelineList .take')).length === 2);
await page.fill('#searchTimeline', '');
await page.locator('#searchTimeline').blur();
await shot(page, '4-timeline');

// --- edit
const ballId = await page.evaluate(() => window.__fw.state.entries.find((e) => e.word === 'ball').id);
await page.click(`#timelineList .edit[data-edit="${ballId}"]`);
await page.fill('#eNote', 'Threw it at the dog');
await page.fill('#eDate', '2026-08-12T16:20');
ok('edit modal shows age then', (await page.textContent('#eAge')).includes('1 year 1 month'), await page.textContent('#eAge'));
await shot(page, '5-edit', false);
await page.click('#eSave');
await page.waitForFunction((id) => window.__fw.state.entries.find((e) => e.id === id).note === 'Threw it at the dog', ballId, { timeout: 3000 }).catch(() => {});
const ballAfter = await page.evaluate((id) => window.__fw.state.entries.find((e) => e.id === id), ballId);
ok('edit saved note + date', ballAfter.note === 'Threw it at the dog' && ballAfter.recordedAt.startsWith('2026-08-12'), JSON.stringify(ballAfter.recordedAt));

// --- delete with confirm (cancel first, then confirm)
await page.click(`#timelineList .edit[data-edit="${ballId}"]`); await page.click('#eDel');
ok('delete asks for confirmation', (await page.textContent('.sheet h2')).includes('Delete “ball”?'));
await page.click('[data-c="0"]');
ok('cancel keeps entry', (await page.evaluate(() => window.__fw.state.entries.length)) === 8);
await page.click(`#timelineList .edit[data-edit="${ballId}"]`); await page.click('#eDel'); await page.click('[data-c="1"]');
await page.waitForTimeout(300);
const afterDel = await page.evaluate(async (id) => {
  const db = await new Promise((r) => { const q = indexedDB.open('first-words'); q.onsuccess = () => r(q.result); });
  const a = await new Promise((r) => { const q = db.transaction('audio').objectStore('audio').get(id); q.onsuccess = () => r(q.result); });
  return { n: window.__fw.state.entries.length, audioGone: a === undefined };
}, ballId);
ok('confirm deletes entry + audio', afterDel.n === 7 && afterDel.audioGone, JSON.stringify(afterDel));

// --- export
await page.click('#settingsBtn');
await page.waitForSelector('#bExport');
await shot(page, '6-settings-backup', false);
await page.click('#bExport');
await page.waitForSelector('#xDl');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#xDl')]);
const zipPath = '/tmp/first-words-backup.zip';
await dl.saveAs(zipPath);
ok('export downloads zip', fs.statSync(zipPath).size > 1000, dl.suggestedFilename() + ' ' + fs.statSync(zipPath).size + ' bytes');
await page.waitForFunction(() => !document.querySelector('.banner'), null, { timeout: 3000 }).catch(() => {});
ok('banner cleared after backup', !(await page.isVisible('.banner')));
const zinfo = JSON.parse(execSync(`python3 -c "
import zipfile,json,sys
z=zipfile.ZipFile('${zipPath}'); bad=z.testzip(); names=z.namelist(); d=json.loads(z.read('data.json'))
print(json.dumps({'bad':bad,'names':names,'count':d['count'],'settings':d['settings'],'files_ok':all(e['file'] in names for e in d['entries'])}))"`).toString());
ok('zip valid (CRC ok) with data.json + README + 7 audio files', zinfo.bad === null && zinfo.count === 7 && zinfo.files_ok && zinfo.names.includes('README.txt'), JSON.stringify(zinfo.names.slice(0, 4)));
execSync(`rm -rf /tmp/fwzip && mkdir /tmp/fwzip && cd /tmp/fwzip && python3 -m zipfile -e ${zipPath} .`);
const af = fs.readdirSync('/tmp/fwzip/audio');
const probe = af.map((f) => execSync(`ffprobe -v error -show_entries stream=codec_name -of csv=p=0 "/tmp/fwzip/audio/${f}"`).toString().trim());
ok('exported audio files decode with ffprobe', probe.every((c) => c.length > 0), [...new Set(probe)].join(',') + ' e.g. ' + af[0]);

// --- import into a fresh profile
const ctx2 = await browser.newContext(ctxOpts);
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => errors.push('p2 pageerror: ' + e.message));
await p2.goto(BASE); await p2.waitForFunction(() => window.__fw && window.__fw.ready);
await p2.click('#wSkip');
await p2.click('#settingsBtn');
await p2.setInputFiles('#importInput', zipPath);
await p2.waitForFunction(() => window.__fw.state.entries.length === 7, null, { timeout: 8000 }).catch(() => {});
const imp = await p2.evaluate(() => ({ n: window.__fw.state.entries.length, s: window.__fw.state.settings, toast: document.querySelector('.toast')?.textContent }));
ok('import restores 7 recordings into empty app', imp.n === 7, imp.toast);
ok('import restores name + birthday', imp.s.name === 'Ava' && imp.s.birthdate === '2025-06-15');
await p2.click('nav.tabs button[data-tab="words"]');
await p2.click('.word[data-group="elephant"] .wt');
await p2.click('.word[data-group="elephant"] .take .play');
ok('restored audio plays', await p2.waitForFunction(() => document.querySelector('.word[data-group="elephant"] .take .play').classList.contains('playing'), null, { timeout: 5000 }).then(() => true).catch(() => false));
const notes = await p2.evaluate(() => window.__fw.state.entries.map((e) => e.note).filter(Boolean).length);
ok('notes restored', notes === 5, String(notes));
// re-import same file → dedupe
await p2.click('#settingsBtn');
await p2.setInputFiles('#importInput', zipPath);
await p2.waitForSelector('.toast:has-text("already here")', { timeout: 5000 }).catch(() => {});
ok('re-import skips duplicates', (await p2.evaluate(() => window.__fw.state.entries.length)) === 7, await p2.textContent('.toast').catch(() => ''));
// import a deflate-compressed re-zip (e.g. user re-zipped folder on a Mac)
execSync(`cd /tmp/fwzip && python3 -c "
import zipfile,os
z=zipfile.ZipFile('/tmp/rezipped.zip','w',zipfile.ZIP_DEFLATED)
for root,_,fs in os.walk('.'):
  for f in fs: p=os.path.join(root,f); z.write(p,'My Backup/'+os.path.relpath(p,'.'))
z.close()"`);
const ctx3 = await browser.newContext(ctxOpts); const p3 = await ctx3.newPage();
await p3.goto(BASE); await p3.waitForFunction(() => window.__fw && window.__fw.ready); await p3.click('#wSkip');
await p3.click('#settingsBtn'); await p3.setInputFiles('#importInput', '/tmp/rezipped.zip');
await p3.waitForFunction(() => window.__fw.state.entries.length === 7, null, { timeout: 8000 }).catch(() => {});
ok('import of re-zipped (deflate, nested folder) backup', (await p3.evaluate(() => window.__fw.state.entries.length)) === 7);
await ctx3.close();

// --- PWA / offline
const swOk = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
ok('service worker active', swOk);
const manifest = await page.evaluate(async () => (await fetch('manifest.json')).json());
ok('manifest has 192+512 icons', manifest.icons.some((i) => i.sizes === '192x192') && manifest.icons.some((i) => i.sizes === '512x512'));
await page.reload(); await page.waitForFunction(() => window.__fw && window.__fw.ready);
await ctx.setOffline(true);
await page.reload(); 
const offlineOk = await page.waitForFunction(() => window.__fw && window.__fw.ready, null, { timeout: 5000 }).then(() => true).catch(() => false);
ok('app loads offline with data', offlineOk && (await page.evaluate(() => window.__fw.state.entries.length)) === 7);
await ctx.setOffline(false);

ok('no JS errors in console', errors.length === 0, errors.join(' | '));
await browser.close();
const fails = results.filter((r) => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
fs.writeFileSync('/tmp/pwtest/results-' + (CHANNEL || 'chromium') + (process.env.UA || '') + '.json', JSON.stringify({ mime, results }, null, 2));
process.exit(fails.length ? 1 : 0);
