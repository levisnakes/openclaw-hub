const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const log = require('electron-log');
const axios = require('axios');
const WebSocket = require('ws');

// Configure logging
log.transports.file.level = 'info';
log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log');
log.info('OpenClaw Hub starting...');

// Global exception handler
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
});

let mainWindow;
let gatewayUrl = '';
let apiKey = '';

// API Helper - forwards to Pi gateway
async function gatewayApi(endpoint, options = {}) {
  if (!gatewayUrl) {
    throw new Error('Gateway not configured');
  }
  
  const url = `${gatewayUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
    ...options.headers
  };
  
  try {
    const response = await axios({
      url,
      ...options,
      headers,
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    log.error(`Gateway API error: ${endpoint}`, error.message);
    throw error;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: true,
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log.info('Window ready');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  log.info('App ready');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ==================== IPC HANDLERS ====================

// Gateway Connection
ipcMain.handle('set-gateway', async (event, url) => {
  gatewayUrl = url;
  return true;
});

ipcMain.handle('get-gateway', async () => {
  return gatewayUrl;
});

// Chat
ipcMain.handle('chat-channels', async () => {
  try {
    return await gatewayApi('/api/channels');
  } catch (e) {
    return [];
  }
});

ipcMain.handle('chat-history', async (event, channel, limit = 50) => {
  try {
    return await gatewayApi(`/api/channels/${channel}/messages?limit=${limit}`);
  } catch (e) {
    return [];
  }
});

ipcMain.handle('chat-send', async (event, channel, message) => {
  return await gatewayApi('/api/chat', {
    method: 'POST',
    data: { channel, message }
  });
});

// Sessions
ipcMain.handle('sessions-list', async () => {
  try {
    return await gatewayApi('/api/sessions');
  } catch (e) {
    return [];
  }
});

ipcMain.handle('sessions-spawn', async (event, config) => {
  return await gatewayApi('/api/spawn', {
    method: 'POST',
    data: config
  });
});

ipcMain.handle('sessions-kill', async (event, sessionKey) => {
  return await gatewayApi(`/api/sessions/${sessionKey}`, {
    method: 'DELETE'
  });
});

ipcMain.handle('sessions-send', async (event, sessionKey, message) => {
  return await gatewayApi('/api/sessions/send', {
    method: 'POST',
    data: { sessionKey, message }
  });
});

// Gateway
ipcMain.handle('gateway-status', async () => {
  try {
    return await gatewayApi('/status');
  } catch (e) {
    return null;
  }
});

ipcMain.handle('gateway-config', async () => {
  try {
    return await gatewayApi('/api/config');
  } catch (e) {
    return {};
  }
});

ipcMain.handle('gateway-update-config', async (event, config) => {
  return await gatewayApi('/api/config', {
    method: 'POST',
    data: config
  });
});

// Ollama
ipcMain.handle('ollama-models', async () => {
  try {
    return await gatewayApi('/api/ollama/models');
  } catch (e) {
    return [];
  }
});

ipcMain.handle('ollama-set-model', async (event, model) => {
  return await gatewayApi('/api/ollama/model', {
    method: 'POST',
    data: { model }
  });
});

// Cron
ipcMain.handle('cron-list', async () => {
  try {
    return await gatewayApi('/api/cron');
  } catch (e) {
    return [];
  }
});

ipcMain.handle('cron-add', async (event, job) => {
  return await gatewayApi('/api/cron', {
    method: 'POST',
    data: job
  });
});

ipcMain.handle('cron-remove', async (event, id) => {
  return await gatewayApi(`/api/cron/${id}`, {
    method: 'DELETE'
  });
});

// Nodes
ipcMain.handle('nodes-list', async () => {
  try {
    return await gatewayApi('/api/nodes');
  } catch (e) {
    return [];
  }
});

ipcMain.handle('nodes-status', async (event, nodeId) => {
  return await gatewayApi(`/api/nodes/${nodeId}`);
});

ipcMain.handle('nodes-camera-snap', async (event, nodeId) => {
  return await gatewayApi(`/api/nodes/${nodeId}/camera?snap=true`);
});

ipcMain.handle('nodes-screen-capture', async (event, nodeId) => {
  return await gatewayApi(`/api/nodes/${nodeId}/screen`);
});

// Settings
ipcMain.handle('settings-get', async () => {
  return {
    gatewayUrl,
    apiKey
  };
});

ipcMain.handle('settings-save', async (event, settings) => {
  if (settings.gatewayUrl) gatewayUrl = settings.gatewayUrl;
  if (settings.apiKey) apiKey = settings.apiKey;
  return true;
});

// Window controls
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow?.close();
});

log.info('IPC handlers registered');
