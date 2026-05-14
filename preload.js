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
      'ai:status',
      'ai:providers',
      'ai:chat',
      'ai:chatStream',
      'ai:transcribe',
      // Secrets (encrypted API key storage — names only cross this boundary)
      'secrets:set',
      'secrets:has',
      'secrets:delete',
      'secrets:list',
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
  // Main process tells the renderer which screen edge the dock should align to
  // (changed from Settings, or applied at startup).
  onDockPosition: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('dock:positionChanged', handler);
    return () => ipcRenderer.removeListener('dock:positionChanged', handler);
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
  // Streaming AI chat: main pushes chunk/done/error events, each tagged with
  // the streamId returned by the ai:chatStream invoke. One subscription wires
  // up all three; the returned function unsubscribes them together.
  onAiStream: (callbacks) => {
    const onChunk = (event, data) => callbacks.onChunk?.(data);
    const onDone = (event, data) => callbacks.onDone?.(data);
    const onError = (event, data) => callbacks.onError?.(data);
    ipcRenderer.on('ai:streamChunk', onChunk);
    ipcRenderer.on('ai:streamDone', onDone);
    ipcRenderer.on('ai:streamError', onError);
    return () => {
      ipcRenderer.removeListener('ai:streamChunk', onChunk);
      ipcRenderer.removeListener('ai:streamDone', onDone);
      ipcRenderer.removeListener('ai:streamError', onError);
    };
  },
  clipboard: {
    copy: (text) => ipcRenderer.invoke('clipboard:copy', text),
  },
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
});
