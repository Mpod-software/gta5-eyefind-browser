/**
 * eyeFind — main process (runtime engine)
 * -------------------------------------------------------------------------
 * Boots a single, frameless BrowserWindow and brokers the small, explicit set
 * of privileged operations the UI is allowed to request (window mutations).
 * The renderer never touches Node or Electron internals directly — everything
 * crosses the contextIsolation boundary through `preload.js`.
 */

'use strict';

const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

/** Single source of truth for the active window. */
let mainWindow = null;

/**
 * Resolve the platform-appropriate app icon, tolerating a missing asset.
 * Windows binds the embedded `.ico`; macOS/Linux use the `.png` for the dock.
 * Each platform falls back to the other format so the window never ships
 * icon-less if only one file is present.
 */
function resolveIcon() {
  const order =
    process.platform === 'win32'
      ? ['assets/icon.ico', 'assets/icon.png']
      : ['assets/icon.png', 'assets/icon.ico'];

  for (const rel of order) {
    const candidate = path.join(__dirname, rel);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false, // revealed on `ready-to-show` to avoid a white flash
    frame: false, // OS chrome is gone — we paint our own GTA-style titlebar
    titleBarStyle: 'hidden',
    backgroundColor: '#3b90d2', // matches the chrome so resize never flashes white
    icon: resolveIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // renderer gets a clean, isolated world
      nodeIntegration: false, // no Node globals leak into the page
      sandbox: true, // preload still works via Electron's polyfilled bridge
      webviewTag: true, // the in-page <webview> mounts the live web viewport
      spellcheck: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Reveal only once the first paint is ready — gives a crisp, snappy launch.
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Keep the renderer's maximize/restore glyph in sync with the real state.
  mainWindow.on('maximize', () => emit('window:maximized', true));
  mainWindow.on('unmaximize', () => emit('window:maximized', false));
  mainWindow.on('enter-full-screen', () => emit('window:maximized', true));
  mainWindow.on('leave-full-screen', () => emit('window:maximized', false));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** Safely push an event to the renderer if the window is still alive. */
function emit(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/* -------------------------------------------------------------------------
 * IPC: the window-mutation control layer.
 * The custom HTML titlebar drives these; the main process owns the window.
 * ---------------------------------------------------------------------- */
ipcMain.on('window:minimize', () => mainWindow?.minimize());

ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window:close', () => mainWindow?.close());

ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);

/* -------------------------------------------------------------------------
 * Hardening: lock down anything the embedded <webview> tries to spawn, and
 * route real "open in new window" intents to the user's default browser
 * instead of letting popups escape our chrome.
 * ---------------------------------------------------------------------- */
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  }

  contents.on('will-attach-webview', (_e, webPreferences) => {
    // A guest page can never request elevated privileges for itself.
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });
});

/* -------------------------------------------------------------------------
 * App lifecycle.
 * ---------------------------------------------------------------------- */
app.whenReady().then(() => {
  // Present a believable browser UA to sites that gate on Electron.
  const ua = session.defaultSession
    .getUserAgent()
    .replace(/\sElectron\/[\d.]+/i, '')
    .replace(/\seyeFind\/[\d.]+/i, '');
  session.defaultSession.setUserAgent(ua);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Enforce a single running instance — a real desktop app shouldn't fork.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
