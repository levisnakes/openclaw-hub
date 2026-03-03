const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('api', {
  // Gateway connection
  setGateway: (url) => ipcRenderer.invoke('set-gateway', url),
  getGateway: () => ipcRenderer.invoke('get-gateway'),
  
  // Chat
  sendMessage: (channel, message) => ipcRenderer.invoke('chat-send', channel, message),
  getChannels: () => ipcRenderer.invoke('chat-channels'),
  getHistory: (channel, limit) => ipcRenderer.invoke('chat-history', channel, limit),
  
  // Sessions
  listSessions: () => ipcRenderer.invoke('sessions-list'),
  spawnSession: (config) => ipcRenderer.invoke('sessions-spawn', config),
  killSession: (sessionKey) => ipcRenderer.invoke('sessions-kill', sessionKey),
  sendToSession: (sessionKey, message) => ipcRenderer.invoke('sessions-send', sessionKey, message),
  
  // Gateway
  gatewayStatus: () => ipcRenderer.invoke('gateway-status'),
  gatewayConfig: () => ipcRenderer.invoke('gateway-config'),
  updateConfig: (config) => ipcRenderer.invoke('gateway-update-config', config),
  
  // Ollama
  listModels: () => ipcRenderer.invoke('ollama-models'),
  setModel: (model) => ipcRenderer.invoke('ollama-set-model', model),
  
  // Cron
  listCron: () => ipcRenderer.invoke('cron-list'),
  addCron: (job) => ipcRenderer.invoke('cron-add', job),
  removeCron: (id) => ipcRenderer.invoke('cron-remove', id),
  
  // Nodes
  listNodes: () => ipcRenderer.invoke('nodes-list'),
  nodeStatus: (nodeId) => ipcRenderer.invoke('nodes-status', nodeId),
  nodeCameraSnap: (nodeId) => ipcRenderer.invoke('nodes-camera-snap', nodeId),
  nodeScreenCapture: (nodeId) => ipcRenderer.invoke('nodes-screen-capture', nodeId),
  
  // Terminal
  terminalData: (callback) => {
    ipcRenderer.on('terminal-data', (event, data) => callback(data));
  },
  sendTerminal: (data) => ipcRenderer.send('terminal-input', data),
  resizeTerminal: (cols, rows) => ipcRenderer.send('terminal-resize', cols, rows),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('settings-get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings-save', settings),
  
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close')
});
