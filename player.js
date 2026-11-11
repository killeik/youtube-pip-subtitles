// Runs in YouTube's MAIN world to access its player response and caption API.
(() => {
  let pipWindow = null;
  let opening = false;
  let closePlayer = null;
  let settings = {};

  window.addEventListener('youtube-pip-settings', (event) => {
    try {
      settings = JSON.parse(event.detail);
    } catch {
      return;
    }
    applySubtitleStyle();
  });
  window.dispatchEvent(new Event('youtube-pip-ready'));

  function applySubtitleStyle() {
    const subtitles = pipWindow?.document.getElementById('subtitles');
    if (!subtitles) return;
    const size = Number(settings.fontSize);
    subtitles.style.fontSize = `${Number.isFinite(size) ? Math.max(10, Math.min(60, size)) : 16}px`;
    subtitles.style.fontFamily = settings.fontFamily || 'sans-serif';
    subtitles.style.color = settings.textColor || '#ffffff';
    subtitles.style.backgroundColor = settings.bgColor || 'rgba(0,0,0,0.75)';
    subtitles.style.top = settings.position === 'top' ? '5%' : 'auto';
    subtitles.style.bottom = settings.position === 'top' ? 'auto' : '64px';
  }

  function videoId() {
    return new URL(location.href).searchParams.get('v');
  }

  function addButton() {
    if (location.pathname !== '/watch') return;
    const controls = document.querySelector('.ytp-right-controls');
    if (!controls || document.getElementById('youtube-pip-button')) return;
    const button = document.createElement('button');
    button.id = 'youtube-pip-button';
    button.className = 'ytp-button';
    button.textContent = 'PiP';
    button.title = 'Picture-in-Picture with English subtitles';
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', togglePip);
    controls.prepend(button);
  }

  // YouTube replaces its controls without necessarily navigating to another URL.
  new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('yt-navigate-start', () => closePlayer?.());
  document.addEventListener('yt-navigate-finish', addButton);
  addButton();

  async function togglePip() {
    if (pipWindow && !pipWindow.closed) {
      closePlayer();
      return;
    }
    if (opening) return;
    const video = document.querySelector('#movie_player video');
    if (!video) return;
    if (!window.documentPictureInPicture) {
      alert('Document Picture-in-Picture requires a recent desktop Chromium browser.');
      return;
    }

    opening = true;
    const id = videoId();
    try {
      const win = await documentPictureInPicture.requestWindow({
        width: 640,
        height: Math.round((640 * (video.videoHeight || 360)) / (video.videoWidth || 640)) + 48,
      });
      if (id !== videoId()) {
        win.close();
        return;
      }
      pipWindow = win;
      setupPlayer(win, video, id);
    } catch (error) {
      closePlayer?.();
      console.error('[YouTube PiP]', error);
    } finally {
      opening = false;
    }
  }

  function setupPlayer(win, video, id) {
    const player = document.getElementById('movie_player');
    const doc = win.document;
    doc.title = 'YouTube PiP';
    const style = doc.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; background: #000; color: #fff; font: 14px system-ui; }
      body { display: flex; flex-direction: column; }
      #picture { position: relative; min-height: 0; flex: 1; }
      #picture video { width: 100% !important; height: 100% !important; position: static !important; object-fit: contain; }
      #subtitles { position: absolute; left: 5%; right: 5%; margin: auto; width: fit-content;
        max-width: 90%; padding: 4px 10px; white-space: pre-line; text-align: center;
        pointer-events: none; border-radius: 4px; }
      #subtitles:empty { display: none; }
      #controls { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px; background: #171717; }
      button { font: inherit; color: inherit; background: #333; border: 0; border-radius: 4px; padding: 6px 12px; cursor: pointer; }
      button:focus-visible { outline: 2px solid #fff; }
      #status { font-size: 12px; color: #bbb; }
    `;
    doc.head.append(style);
    const picture = doc.createElement('div');
    picture.id = 'picture';
    const subtitles = doc.createElement('div');
    subtitles.id = 'subtitles';
    const controls = doc.createElement('div');
    controls.id = 'controls';
    const status = doc.createElement('span');
    status.id = 'status';
    status.textContent = 'Loading English captions...';
    doc.body.append(picture, controls);

    // A placeholder survives DOM changes and preserves the exact return location.
    const placeholder = document.createComment('YouTube PiP video');
    video.before(placeholder);
    const originalStyle = video.getAttribute('style');
    const originalControls = video.controls;
    const request = new AbortController();
    let syncTimer = null;
    let finished = false;
    let cues = [];
    let useDOM = false;
    let restoreCaptions = () => {};

    closePlayer = () => {
      if (finished) return;
      finished = true;
      request.abort();
      win.clearInterval(syncTimer);
      video.removeEventListener('play', updatePause);
      video.removeEventListener('pause', updatePause);
      try {
        restoreCaptions();
      } catch (error) {
        console.warn('[YouTube PiP]', error);
      }
      if (placeholder.isConnected) placeholder.replaceWith(video);
      else if (player?.isConnected && !player.querySelector('video')) player.prepend(video);
      else video.remove();
      if (originalStyle === null) video.removeAttribute('style');
      else video.setAttribute('style', originalStyle);
      video.controls = originalControls;
      pipWindow = null;
      closePlayer = null;
      if (!win.closed) win.close();
    };
    win.addEventListener('pagehide', closePlayer, { once: true });

    function button(label, title, action) {
      const element = doc.createElement('button');
      element.textContent = label;
      element.title = title;
      element.setAttribute('aria-label', title);
      element.addEventListener('click', action);
      controls.append(element);
      return element;
    }
    function seek(seconds) {
      if (!video.seekable.length) return;
      const start = video.seekable.start(0);
      const end = video.seekable.end(video.seekable.length - 1);
      video.currentTime = Math.max(start, Math.min(end, video.currentTime + seconds));
    }
    function togglePause() {
      if (video.paused) video.play().catch((error) => console.warn('[YouTube PiP]', error));
      else video.pause();
    }
    button('-10 s', 'Rewind 10 seconds (Left)', () => seek(-10));
    const pause = button('Pause', 'Play or pause (Space)', togglePause);
    button('+10 s', 'Forward 10 seconds (Right)', () => seek(10));
    controls.append(status);
    function updatePause() {
      pause.textContent = video.paused ? 'Play' : 'Pause';
    }
    video.addEventListener('play', updatePause);
    video.addEventListener('pause', updatePause);
    doc.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('button')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePause();
      }
      if (event.code === 'ArrowLeft') {
        event.preventDefault();
        seek(-10);
      }
      if (event.code === 'ArrowRight') {
        event.preventDefault();
        seek(10);
      }
    });
    video.controls = false;
    video.removeAttribute('style');
    picture.append(video, subtitles);
    applySubtitleStyle();
    updatePause();

    syncTimer = win.setInterval(() => {
      const text = useDOM
        ? [...document.querySelectorAll('.ytp-caption-segment')]
            .map((el) => el.textContent)
            .join('\n')
        : cues
            .filter((cue) => video.currentTime >= cue.start && video.currentTime < cue.end)
            .map((cue) => cue.text)
            .join('\n');
      if (subtitles.textContent !== text) subtitles.textContent = text;
    }, 100);

    loadCaptions();
    async function loadCaptions() {
      try {
        let response;
        for (let attempt = 0; attempt < 10 && !finished; attempt++) {
          response = player.getPlayerResponse?.() || window.ytInitialPlayerResponse;
          if (response?.videoDetails?.videoId === id) break;
          await new Promise((resolve) => win.setTimeout(resolve, 200));
        }
        if (finished) return;
        // Never reuse the previous video's caption URLs during SPA navigation.
        if (response?.videoDetails?.videoId !== id) throw new Error('Player metadata is not ready');
        const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        const english = tracks.filter((track) => /^en(?:-|$)/i.test(track.languageCode));
        const track = english.find((track) => track.kind !== 'asr') || english[0];
        if (!track) {
          status.textContent = 'No English captions';
          return;
        }
        const url = new URL(track.baseUrl);
        if (url.origin !== location.origin || url.pathname !== '/api/timedtext') {
          throw new Error('Unexpected caption URL');
        }
        url.searchParams.set('fmt', 'json3');
        const result = await fetch(url, { signal: request.signal });
        if (!result.ok) throw new Error(`Captions: HTTP ${result.status}`);
        const data = await result.json();
        if (finished) return;
        cues = (data.events || [])
          .filter((event) => event.segs && Number.isFinite(event.tStartMs))
          .map((event) => ({
            start: event.tStartMs / 1000,
            end: (event.tStartMs + (event.dDurationMs || 3000)) / 1000,
            text: event.segs
              .map((segment) => segment.utf8 || '')
              .join('')
              .trim(),
          }))
          .filter((cue) => cue.text);
        if (!cues.length) throw new Error('Empty caption response');
        status.textContent = 'English';
      } catch (error) {
        if (finished) return;
        console.warn('[YouTube PiP] Caption download unavailable:', error);
        // YouTube may require tokens not present in the timedtext URL. Let its
        // own caption renderer handle those requests instead of bypassing it.
        try {
          const previous = player.getOption?.('captions', 'track');
          restoreCaptions = () => player.setOption?.('captions', 'track', previous || {});
          player.loadModule?.('captions');
          let tracks = [];
          for (let attempt = 0; attempt < 10 && !finished; attempt++) {
            tracks = player.getOption?.('captions', 'tracklist') || [];
            if (tracks.length) break;
            await new Promise((resolve) => win.setTimeout(resolve, 200));
          }
          if (finished) return;
          const english = tracks.filter((track) => /^en(?:-|$)/i.test(track.languageCode));
          const track = english.find((track) => track.kind !== 'asr') || english[0];
          if (!track) {
            status.textContent = 'English captions unavailable';
            return;
          }
          player.setOption('captions', 'track', track);
          useDOM = true;
          status.textContent = 'English (YouTube captions)';
        } catch (fallbackError) {
          status.textContent = 'English captions unavailable';
          console.warn('[YouTube PiP]', fallbackError);
        }
      }
    }
  }
})();
