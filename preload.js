/**
 * eyeFind — preload bridge
 * -------------------------------------------------------------------------
 * The single, audited doorway between the sandboxed renderer and the main
 * process. We expose a tiny, intention-revealing API on `window.eyefind`
 * rather than handing the page raw `ipcRenderer`. Nothing else crosses over.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eyefind', {
  /** Window-mutation controls wired to the custom titlebar buttons. */
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),

    /** Promise<boolean> — current maximize state, used to seed the glyph. */
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

    /**
     * Subscribe to maximize/restore changes.
     * @param {(isMaximized: boolean) => void} callback
     * @returns {() => void} unsubscribe handle
     */
    onMaximizeChange: (callback) => {
      const listener = (_event, isMaximized) => callback(Boolean(isMaximized));
      ipcRenderer.on('window:maximized', listener);
      return () => ipcRenderer.removeListener('window:maximized', listener);
    }
  },

  /** Read-only environment facts the UI may want for chrome polish. */
  platform: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  })
});
