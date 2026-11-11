const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-pip-test-'));
(async () => {
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.PIP_BROWSER || '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
    ],
  });
  try {
    await new Promise((r) => setTimeout(r, 2000));
    const errors = [];
    const requests = [];
    let failCaptions = false;
    let language = 'en';
    ctx.on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
    ctx.on('request', (r) => requests.push(r.url()));
    await ctx.route('https://www.youtube.com/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/video.webm') {
        const data = fs.readFileSync(path.join(__dirname, 'video.webm'));
        const range = route.request().headers().range;
        if (range) {
          const start = Number(range.match(/bytes=(\d+)/)[1]);
          return route.fulfill({
            status: 206,
            headers: {
              'Content-Type': 'video/webm',
              'Accept-Ranges': 'bytes',
              'Content-Range': `bytes ${start}-${data.length - 1}/${data.length}`,
            },
            body: data.subarray(start),
          });
        }
        return route.fulfill({
          contentType: 'video/webm',
          headers: { 'Accept-Ranges': 'bytes' },
          body: data,
        });
      }
      if (url.pathname === '/api/timedtext')
        return route.fulfill({
          status: failCaptions ? 403 : 200,
          contentType: 'application/json',
          body: JSON.stringify({
            events: [{ tStartMs: 0, dDurationMs: 40000, segs: [{ utf8: 'English <not HTML>' }] }],
          }),
        });
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><div id="movie_player"><video style="width:160px;opacity:0.9" controls src="/video.webm"></video><div class="ytp-right-controls"></div><span class="ytp-caption-segment">DOM captions</span></div><script>
window.track={languageCode:'fr'};window.changes=[];
const p=document.getElementById('movie_player');
p.getPlayerResponse=()=>({videoDetails:{videoId:'test'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'tr',baseUrl:'/turkish'}, {languageCode:'${language}',baseUrl:'https://www.youtube.com/api/timedtext?v=test'}]}}});
p.getOption=(_,name)=>name==='tracklist'?[{languageCode:'en'}]:window.track;
p.setOption=(_,name,value)=>{window.track=value;window.changes.push(value)};
</script>`,
      });
    });
    const p = await ctx.newPage();
    await p.goto('https://www.youtube.com/watch?v=test');
    await p.locator('#youtube-pip-button').waitFor();
    await p.evaluate(
      () =>
        new Promise((resolve) => {
          const v = document.querySelector('video');
          if (v.readyState >= 2) resolve();
          else v.onloadeddata = resolve;
        }),
    );
    const style = await p.locator('video').getAttribute('style');
    await p.locator('video').evaluate(async (v) => {
      v.currentTime = 5;
      await v.play();
    });
    await p.locator('#youtube-pip-button').click();
    await p.waitForFunction(
      () =>
        documentPictureInPicture.window?.document.querySelector('#status')?.textContent ===
        'English',
    );
    const pip = ctx
      .pages()
      .find((page) => page !== p && page.url() === 'about:blank' && page !== ctx.pages()[0]);
    assert(pip, 'PiP page found');
    await pip.waitForFunction(
      () => document.querySelector('#subtitles').textContent === 'English <not HTML>',
    );
    assert.equal(await pip.locator('#subtitles > *').count(), 0);
    const crypto = require('node:crypto');
    const extensionId = crypto
      .createHash('sha256')
      .update(root)
      .digest('hex')
      .slice(0, 32)
      .replace(/[0-9a-f]/g, (char) => String.fromCharCode(97 + parseInt(char, 16)));
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator('#font-size').fill('24');
    await popup.locator('#font-size').dispatchEvent('input');
    await pip.waitForFunction(() => document.querySelector('#subtitles').style.fontSize === '24px');
    await popup.close();

    assert.equal(await pip.locator('video').evaluate((v) => v.paused), false);
    assert((await pip.locator('video').evaluate((v) => v.currentTime)) >= 5);
    await pip.locator('video').evaluate((v) => v.pause());
    await pip.getByRole('button', { name: 'Play or pause (Space)', exact: true }).click();
    await pip.waitForFunction(() => !document.querySelector('video').paused);
    await pip.getByRole('button', { name: 'Play or pause (Space)', exact: true }).click();
    assert(await pip.locator('video').evaluate((v) => v.paused));
    await pip.locator('video').evaluate((v) => (v.currentTime = 15));
    await pip.getByRole('button', { name: 'Forward 10 seconds (Right)', exact: true }).click();
    assert(Math.abs((await pip.locator('video').evaluate((v) => v.currentTime)) - 25) < 0.5);
    await pip.getByRole('button', { name: 'Rewind 10 seconds (Left)', exact: true }).click();
    assert(Math.abs((await pip.locator('video').evaluate((v) => v.currentTime)) - 15) < 0.5);
    await p.evaluate(() => documentPictureInPicture.window.close());
    await p.locator('#movie_player video').waitFor();
    assert.equal(await p.locator('video').getAttribute('style'), style);
    assert(await p.locator('video').evaluate((v) => v.controls));
    console.log('English, escaped captions, play/pause, seek, close/restoration OK');
    failCaptions = true;
    await p.locator('#youtube-pip-button').click();
    await p.waitForFunction(
      () =>
        documentPictureInPicture.window?.document.querySelector('#status')?.textContent ===
        'English (YouTube captions)',
    );
    assert.equal(await p.evaluate(() => window.track.languageCode), 'en');
    await p.evaluate(() => document.dispatchEvent(new Event('yt-navigate-start')));
    await p.locator('#movie_player video').waitFor();
    assert.equal(await p.evaluate(() => window.track.languageCode), 'fr');
    console.log('Rejected download fallback and navigation cleanup OK');
    failCaptions = false;
    language = 'de';
    await p.reload();
    await p.locator('#youtube-pip-button').click();
    await p.waitForFunction(
      () =>
        documentPictureInPicture.window?.document.querySelector('#status')?.textContent ===
        'No English captions',
    );
    await p.evaluate(() => documentPictureInPicture.window.close());
    assert(!requests.some((u) => /goatcounter|googleapis|gstatic/.test(u)));
    assert.deepEqual(errors, []);
    console.log('No-English case, no third-party requests, no page exceptions OK');
  } finally {
    await ctx.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
