const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    const allowedSendChannels = [
      'dock:setExpanded',
    ];
    if (allowedSendChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  on: (channel, callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  invoke: (channel, data) => {
    const allowed = [
      // Clipboard
      'clipboard:copy',
      'clipboard:getHistory',
      'clipboard:deleteItem',
      'clipboard:clearAll',
      'clipboard:copyItem',
      // Notifications
      'notify',
      // Workspace
      'workspace:save',
      'workspace:list',
      'workspace:restore',
      'workspace:delete',
      // Dock
      'dock:applyLayout',
      'dock:setExpanded',
      // Notes
      'notes:list',
      'notes:save',
      'notes:delete',
      'notes:togglePin',
      // AI
      'ai:chat',
      'ai:transcribe',
      // Screenshots
      'screenshot:capture',
      'screenshot:getSources',
      'screenshot:getHistory',
      'screenshot:delete',
      'screenshot:copy',
      'screenshot:open',
      // Settings
      'settings:get',
      'settings:set',
      // Launcher
      'launcher:search',
      'launcher:open',
      // Terminal
      'terminal:spawn',
      'terminal:write',
      'terminal:resize',
      // Browser
      'browser:getBookmarks',
      'browser:saveBookmark',
      'browser:getHistory',
      'browser:addHistory',
    ];
    if (allowed.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
  },
  onNotification: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('show-notification', handler);
    return () => ipcRenderer.removeListener('show-notification', handler);
  },
  onDockLayoutRestore: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('workspace:dockLayoutRestore', handler);
    return () => ipcRenderer.removeListener('workspace:dockLayoutRestore', handler);
  },
  onClipboardUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('clipboard:newItem', handler);
    return () => ipcRenderer.removeListener('clipboard:newItem', handler);
  },
  onTerminalData: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('terminal:onData', handler);
    return () => ipcRenderer.removeListener('terminal:onData', handler);
  },
  clipboard: {
    copy: (text) => ipcRenderer.invoke('clipboard:copy', text),
  },
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
});
