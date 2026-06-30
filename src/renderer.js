/**
 * eyeFind — renderer (client control script)
 * -------------------------------------------------------------------------
 * Binds the chrome to the <webview> viewport: the omnibox, the navigation
 * cluster, the window-mutation buttons, a faux-progress loadbar, favicon /
 * security plumbing, a lightweight history flyout, and keyboard shortcuts.
 *
 * Runs in an isolated world. Privileged calls go through `window.eyefind`,
 * exposed by preload.js. Everything degrades gracefully if that bridge is
 * absent (e.g. when the file is opened in a plain browser for quick styling).
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Element handles
   * ------------------------------------------------------------------ */
  const webview = document.getElementById('browser-view');
  const urlBar = document.getElementById('url-bar');
  const omnibox = document.getElementById('omnibox');

  const btn = {
    back: document.getElementById('nav-back'),
    forward: document.getElementById('nav-forward'),
    reload: document.getElementById('nav-reload'),
    home: document.getElementById('nav-home'),
    history: document.getElementById('nav-history'),
    go: document.getElementById('nav-go'),
    min: document.getElementById('win-minimize'),
    max: document.getElementById('win-maximize'),
    close: document.getElementById('win-close')
  };

  const favicon = document.getElementById('favicon');
  const security = document.getElementById('security-indicator');
  const loadbar = document.getElementById('loadbar-fill');

  const historyPanel = document.getElementById('history-panel');
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');

  const HOME_URL = 'https://www.google.com';
  const SEARCH_URL = 'https://www.google.com/search?q=';

  const bridge = window.eyefind || null;

  /* ================================================================== *
   * Sound — stubbed hooks for future GTA-style UI blips.
   * Drop .wav/.ogg files under assets/audio/ and flip ENABLED to true.
   * ================================================================== */
  const Sound = (function () {
    const ENABLED = false;
    const cache = new Map();

    function play(name) {
      if (!ENABLED) return;
      try {
        let clip = cache.get(name);
        if (!clip) {
          clip = new Audio('../assets/audio/' + name + '.wav');
          clip.volume = 0.35;
          cache.set(name, clip);
        }
        clip.currentTime = 0;
        clip.play().catch(() => {});
      } catch (_) {
        /* audio is a non-critical nicety — never let it surface */
      }
    }

    return { play };
  })();

  /* ================================================================== *
   * URL normalisation
   * Honours the spec (prepend protocol when missing) and adds smart
   * search routing for anything that clearly isn't a hostname.
   * ================================================================== */
  function normalizeInput(raw) {
    const text = (raw || '').trim();
    if (!text) return null;

    // Already carries an explicit scheme (http, https, about, file, …).
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^about:/i.test(text)) {
      return text;
    }

    // localhost[:port][/path] is a host, not a search.
    if (/^localhost(:\d+)?(\/|$)/i.test(text)) {
      return 'http://' + text;
    }

    // A single token containing a dot and no spaces looks like a domain.
    const looksLikeDomain = !/\s/.test(text) && /^[^\s.]+\.[^\s.]{2,}/.test(text);
    if (looksLikeDomain) {
      return 'https://' + text;
    }

    // Otherwise treat it as a search query (the satirical eyeFind way).
    return SEARCH_URL + encodeURIComponent(text);
  }

  function navigate(input) {
    const url = normalizeInput(input);
    if (!url) return;
    Sound.play('navigate');
    try {
      webview.src = url;
    } catch (_) {
      webview.setAttribute('src', url);
    }
  }

  /* ================================================================== *
   * Omnibox
   * ================================================================== */
  // The spec asks for Enter-on-keyup; the surrounding <form> also catches
  // the submit so the layout behaves like a real address bar.
  urlBar.addEventListener('keyup', function (event) {
    if (event.key === 'Enter') {
      navigate(urlBar.value);
      urlBar.blur();
    } else if (event.key === 'Escape') {
      urlBar.value = safeURL();
      urlBar.blur();
    }
  });

  omnibox.addEventListener('submit', function (event) {
    event.preventDefault();
    navigate(urlBar.value);
    urlBar.blur();
  });

  // Focusing the bar selects everything, matching native browser behaviour.
  urlBar.addEventListener('focus', function () {
    requestAnimationFrame(() => urlBar.select());
  });

  btn.go.addEventListener('click', function () {
    navigate(urlBar.value);
  });

  /* ================================================================== *
   * Navigation cluster
   * ================================================================== */
  btn.back.addEventListener('click', function () {
    if (canGoBack()) {
      Sound.play('click');
      webview.goBack();
    }
  });

  btn.forward.addEventListener('click', function () {
    if (canGoForward()) {
      Sound.play('click');
      webview.goForward();
    }
  });

  btn.reload.addEventListener('click', function () {
    Sound.play('click');
    if (document.body.classList.contains('is-loading')) {
      webview.stop();
    } else {
      webview.reload();
    }
  });

  btn.home.addEventListener('click', function () {
    Sound.play('click');
    navigate(HOME_URL);
  });

  /** Guarded wrappers — the webview throws if queried before it attaches. */
  function canGoBack() {
    try { return webview.canGoBack(); } catch (_) { return false; }
  }
  function canGoForward() {
    try { return webview.canGoForward(); } catch (_) { return false; }
  }

  function updateNavState() {
    btn.back.disabled = !canGoBack();
    btn.forward.disabled = !canGoForward();
  }

  /** The webview's current URL, or the home URL before it's ready. */
  function safeURL() {
    try { return webview.getURL() || HOME_URL; } catch (_) { return HOME_URL; }
  }

  /* ================================================================== *
   * Loading progress — a believable faux-progress curve.
   * The <webview> only reports start/stop, so we ease toward 90% while
   * loading and snap to 100% on completion.
   * ================================================================== */
  let progressTimer = null;

  function startProgress() {
    document.body.classList.add('is-loading');
    let value = 8;
    loadbar.style.width = value + '%';

    clearInterval(progressTimer);
    progressTimer = setInterval(function () {
      // Decelerating approach toward the ceiling, with a touch of jitter.
      value += (90 - value) * 0.14 + Math.random() * 1.5;
      if (value >= 90) value = 90;
      loadbar.style.width = value.toFixed(1) + '%';
    }, 160);
  }

  function finishProgress() {
    clearInterval(progressTimer);
    progressTimer = null;
    loadbar.style.width = '100%';
    document.body.classList.remove('is-loading');
    setTimeout(function () {
      if (!document.body.classList.contains('is-loading')) {
        loadbar.style.width = '0%';
      }
    }, 320);
  }

  /* ================================================================== *
   * Favicon & security indicator
   * ================================================================== */
  function setFavicon(href) {
    if (!href) return clearFavicon();
    favicon.src = href;
    favicon.classList.add('is-visible');
    omnibox.classList.add('has-favicon');
  }

  function clearFavicon() {
    favicon.removeAttribute('src');
    favicon.classList.remove('is-visible');
    omnibox.classList.remove('has-favicon');
  }

  favicon.addEventListener('error', clearFavicon);

  function updateSecurity(url) {
    const secure = /^https:\/\//i.test(url || '');
    security.classList.toggle('is-insecure', !secure);
    security.title = secure ? 'Secure connection' : 'Not secure';
  }

  /* ================================================================== *
   * History flyout
   * ================================================================== */
  const history = [];
  const MAX_HISTORY = 80;

  function recordHistory(url) {
    if (!url || /^about:blank$/i.test(url)) return;
    const last = history[0];
    if (last && last.url === url) {
      last.time = Date.now();
      return;
    }
    history.unshift({ url: url, title: url, favicon: favicon.src || '', time: Date.now() });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  }

  function annotateHistory(field, value) {
    if (history[0] && value) history[0][field] = value;
  }

  function toggleHistory(force) {
    const willShow = typeof force === 'boolean' ? force : historyPanel.hasAttribute('hidden');
    if (willShow) {
      renderHistory();
      historyPanel.removeAttribute('hidden');
    } else {
      historyPanel.setAttribute('hidden', '');
    }
    btn.history.setAttribute('aria-expanded', String(willShow));
  }

  function renderHistory() {
    historyList.textContent = '';
    historyEmpty.style.display = history.length ? 'none' : 'block';

    history.forEach(function (entry) {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.setAttribute('role', 'menuitem');
      li.title = entry.url;

      const fav = document.createElement('img');
      fav.className = 'history-item__fav';
      fav.alt = '';
      if (entry.favicon) fav.src = entry.favicon;

      const text = document.createElement('div');
      text.className = 'history-item__text';

      const title = document.createElement('div');
      title.className = 'history-item__title';
      title.textContent = entry.title || entry.url;

      const url = document.createElement('div');
      url.className = 'history-item__url';
      url.textContent = entry.url;

      text.appendChild(title);
      text.appendChild(url);
      li.appendChild(fav);
      li.appendChild(text);

      li.addEventListener('click', function () {
        toggleHistory(false);
        navigate(entry.url);
      });

      historyList.appendChild(li);
    });
  }

  btn.history.addEventListener('click', function (event) {
    event.stopPropagation();
    Sound.play('click');
    toggleHistory();
  });

  // Click-away and Escape both dismiss the flyout.
  document.addEventListener('click', function (event) {
    if (!historyPanel.hasAttribute('hidden') &&
        !historyPanel.contains(event.target) &&
        event.target !== btn.history) {
      toggleHistory(false);
    }
  });

  /* ================================================================== *
   * Webview wiring
   * ================================================================== */
  webview.addEventListener('did-start-loading', startProgress);
  webview.addEventListener('did-stop-loading', function () {
    finishProgress();
    updateNavState();
  });

  webview.addEventListener('did-navigate', function (event) {
    urlBar.value = event.url;
    updateSecurity(event.url);
    recordHistory(event.url);
    updateNavState();
  });

  webview.addEventListener('did-navigate-in-page', function (event) {
    if (event.isMainFrame) {
      urlBar.value = event.url;
      updateSecurity(event.url);
    }
    updateNavState();
  });

  webview.addEventListener('page-title-updated', function (event) {
    document.title = event.title ? event.title + ' — eyeFind' : 'eyeFind';
    annotateHistory('title', event.title);
  });

  webview.addEventListener('page-favicon-updated', function (event) {
    const href = event.favicons && event.favicons[0];
    setFavicon(href);
    annotateHistory('favicon', href);
  });

  webview.addEventListener('did-fail-load', function (event) {
    // -3 is ERR_ABORTED (user-cancelled / superseded nav) — ignore it.
    if (event.errorCode === -3 || !event.isMainFrame) return;
    finishProgress();
  });

  webview.addEventListener('dom-ready', function () {
    updateNavState();
    clearFavicon();
  });

  /* ================================================================== *
   * Window mutation controls (via the preload bridge)
   * ================================================================== */
  if (bridge && bridge.window) {
    btn.min.addEventListener('click', function () {
      Sound.play('click');
      bridge.window.minimize();
    });

    btn.max.addEventListener('click', function () {
      Sound.play('click');
      bridge.window.toggleMaximize();
    });

    btn.close.addEventListener('click', function () {
      Sound.play('close');
      bridge.window.close();
    });

    // Keep the maximize/restore glyph honest with the real window state.
    bridge.window.onMaximizeChange(function (isMax) {
      document.body.classList.toggle('is-maximized', isMax);
    });
    bridge.window.isMaximized().then(function (isMax) {
      document.body.classList.toggle('is-maximized', isMax);
    });
  } else {
    // No Electron host — keep the buttons inert rather than throwing.
    [btn.min, btn.max, btn.close].forEach(function (b) {
      b.addEventListener('click', function () {});
    });
  }

  /* ================================================================== *
   * Keyboard shortcuts — the desktop-app finishing touch.
   * ================================================================== */
  document.addEventListener('keydown', function (event) {
    const mod = event.ctrlKey || event.metaKey;

    if (mod && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      urlBar.focus();
    } else if (event.key === 'F5' || (mod && event.key.toLowerCase() === 'r')) {
      event.preventDefault();
      webview.reload();
    } else if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      if (canGoBack()) webview.goBack();
    } else if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault();
      if (canGoForward()) webview.goForward();
    } else if (event.key === 'Escape' && !historyPanel.hasAttribute('hidden')) {
      toggleHistory(false);
    }
  });

  /* ================================================================== *
   * First paint
   * ================================================================== */
  updateSecurity(urlBar.value);
  updateNavState();
})();
