// OpenClaw Hub - Renderer Process

// State
let currentTab = 'chat';
let currentChannel = null;
let gatewayUrl = localStorage.getItem('gatewayUrl') || '';
let apiKey = localStorage.getItem('apiKey') || '';
let terminal = null;
let terminalSocket = null;
let reconnectInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initChat();
  initTerminal();
  initSettings();
  
  // Load saved gateway URL
  if (gatewayUrl) {
    document.getElementById('gatewayUrl').value = gatewayUrl;
    connectToGateway();
  }
});

// Tab Navigation
function initTabs() {
  const navBtns = document.querySelectorAll('.nav-btn');
  
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  currentTab = tab;
  
  // Update nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  // Update content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tab}`);
  });
  
  // Update title
  const titles = {
    chat: 'Chat',
    terminal: 'Terminal',
    sessions: 'Sessions',
    nodes: 'Nodes',
    ollama: 'Ollama',
    cron: 'Cron Jobs',
    settings: 'Settings'
  };
  document.getElementById('tabTitle').textContent = titles[tab] || tab;
  
  // Load tab data
  if (tab === 'sessions') loadSessions();
  if (tab === 'nodes') loadNodes();
  if (tab === 'ollama') loadOllama();
  if (tab === 'cron') loadCron();
  if (tab === 'terminal' && terminal) {
    setTimeout(() => terminal?.fit?.(), 100);
  }
}

// Toast Notifications
function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span class="toast-message">${message}</span>
  `;
  
  // Add toast styles if not present
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      .toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 14px 20px;
        border-radius: 8px;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 9999;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      .toast-info { background: #58a6ff; color: #fff; }
      .toast-success { background: #3fb950; color: #fff; }
      .toast-error { background: #f85149; color: #fff; }
      .toast-icon { font-weight: bold; }
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  
  // Auto remove
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// API Helper
async function apiCall(endpoint, options = {}) {
  if (!gatewayUrl) {
    showToast('Please configure gateway URL in Settings', 'error');
    return null;
  }
  
  const url = `${gatewayUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
    ...options.headers
  };
  
  try {
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    showToast(`Connection failed: ${error.message}`, 'error');
    updateConnectionStatus(false);
    return null;
  }
}

// Connection Status
function updateConnectionStatus(online) {
  const statusDot = document.querySelector('.status-dot');
  const statusIndicator = document.querySelector('.status-indicator');
  const statusText = document.querySelector('.status-text');
  
  statusDot?.classList.toggle('online', online);
  statusDot?.classList.toggle('offline', !online);
  statusIndicator?.classList.toggle('online', online);
  if (statusText) statusText.textContent = online ? 'Connected' : 'Disconnected';
  
  // Auto-reconnect
  if (!online && gatewayUrl) {
    if (reconnectInterval) clearInterval(reconnectInterval);
    reconnectInterval = setInterval(() => {
      console.log('Attempting reconnect...');
      apiCall('/status').then(status => {
        if (status) {
          updateConnectionStatus(true);
          showToast('Reconnected!', 'success');
          clearInterval(reconnectInterval);
          reconnectInterval = null;
        }
      });
    }, 10000); // Try every 10 seconds
  } else if (online && reconnectInterval) {
    clearInterval(reconnectInterval);
    reconnectInterval = null;
  }
}

async function connectToGateway() {
  const url = document.getElementById('gatewayUrl').value;
  const key = document.getElementById('apiKey').value;
  
  if (!url) {
    showToast('Please enter a gateway URL', 'error');
    return;
  }
  
  gatewayUrl = url;
  apiKey = key;
  localStorage.setItem('gatewayUrl', url);
  localStorage.setItem('apiKey', key);
  
  const status = await apiCall('/status');
  if (status) {
    updateConnectionStatus(true);
    showToast('Connected to gateway', 'success');
    loadChannels();
  }
}

// Loading state helper
function setLoading(elementId, loading) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  if (loading) {
    el.dataset.originalContent = el.innerHTML;
    el.innerHTML = '<span class="loading">Loading...</span>';
    el.style.opacity = '0.7';
  } else {
    el.innerHTML = el.dataset.originalContent || '';
    el.style.opacity = '1';
  }
}

// ============ CHAT ============
function initChat() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

async function loadChannels() {
  setLoading('channels', true);
  const channels = await apiCall('/api/channels');
  setLoading('channels', false);
  
  if (channels) {
    const container = document.getElementById('channels');
    container.innerHTML = channels.map(ch => `
      <div class="channel-item ${currentChannel === ch.id ? 'active' : ''}" data-id="${ch.id}">
        <span class="channel-icon">#</span>
        <span>${ch.name || ch.id}</span>
      </div>
    `).join('');
    
    container.querySelectorAll('.channel-item').forEach(item => {
      item.addEventListener('click', () => selectChannel(item.dataset.id));
    });
    
    // Auto-select first channel
    if (channels.length > 0 && !currentChannel) {
      selectChannel(channels[0].id);
    }
  }
}

async function selectChannel(channelId) {
  currentChannel = channelId;
  
  document.querySelectorAll('.channel-item').forEach(item => {
    item.classList.toggle('active', item.dataset.id === channelId);
  });
  
  await loadMessages(channelId);
}

async function loadMessages(channelId) {
  setLoading('chatMessages', true);
  const messages = await apiCall(`/api/channels/${channelId}/messages?limit=50`);
  setLoading('chatMessages', false);
  
  const container = document.getElementById('chatMessages');
  
  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div class="welcome-message">
        <h2>#${channelId}</h2>
        <p>No messages yet</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = messages.map(msg => `
    <div class="message">
      <div class="message-header">
        <span class="message-author">${msg.author || 'User'}</span>
        <span class="message-time">${new Date(msg.timestamp).toLocaleString()}</span>
      </div>
      <div class="message-content">${escapeHtml(msg.content)}</div>
    </div>
  `).join('');
  
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (!message || !currentChannel) return;
  
  input.value = '';
  
  const result = await apiCall('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ channel: currentChannel, message })
  });
  
  if (result) {
    loadMessages(currentChannel);
  }
}

// ============ TERMINAL ============
function initTerminal() {
  document.querySelector('[data-tab="terminal"]').addEventListener('click', async () => {
    if (!terminal) {
      await initXterm();
    }
  });
  
  document.getElementById('terminalClear')?.addEventListener('click', () => {
    if (terminal) terminal.clear();
  });
  
  document.getElementById('terminalKill')?.addEventListener('click', () => {
    if (terminalSocket) {
      terminalSocket.close();
      terminalSocket = null;
    }
  });
}

async function initXterm() {
  const terminalContainer = document.getElementById('terminal');
  if (!terminalContainer) return;
  
  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
    theme: {
      background: '#0d1117',
      foreground: '#e6edf3',
      cursor: '#58a6ff'
    }
  });
  
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  
  terminal.open(terminalContainer);
  fitAddon.fit();
  
  terminal.onData(data => {
    if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
      terminalSocket.send(JSON.stringify({ type: 'input', data }));
    }
  });
  
  connectTerminalWebSocket();
}

function connectTerminalWebSocket() {
  if (!gatewayUrl || !terminal) return;
  
  const wsUrl = gatewayUrl.replace('http', 'ws') + '/terminal';
  
  try {
    terminalSocket = new WebSocket(wsUrl);
    
    terminalSocket.onopen = () => {
      terminal?.writeln('\x1b[32mConnected to OpenClaw Terminal\x1b[0m');
    };
    
    terminalSocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'output') {
        terminal?.write(data.data);
      }
    };
    
    terminalSocket.onclose = () => {
      terminal?.writeln('\x1b[31mDisconnected\x1b[0m');
    };
    
    terminalSocket.onerror = (error) => {
      terminal?.writeln('\x1b[31mConnection error\x1b[0m');
    };
  } catch (e) {
    terminal?.writeln('\x1b[31mFailed to connect\x1b[0m');
  }
}

// ============ SESSIONS ============
async function loadSessions() {
  setLoading('sessionsList', true);
  const sessions = await apiCall('/api/sessions');
  setLoading('sessionsList', false);
  
  const container = document.getElementById('sessionsList');
  if (!container) return;
  
  if (!sessions || sessions.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted)">No active sessions</p>';
    return;
  }
  
  container.innerHTML = sessions.map(session => `
    <div class="session-item">
      <div class="session-info">
        <h4>${escapeHtml(session.label || session.sessionKey)}</h4>
        <p>${session.runtime} • ${session.status || 'active'}</p>
      </div>
      <div class="session-actions">
        <button class="btn btn-secondary" onclick="sendToSession('${session.sessionKey}')">Message</button>
        <button class="btn btn-danger" onclick="killSession('${session.sessionKey}')">Kill</button>
      </div>
    </div>
  `).join('');
}

async function killSession(sessionKey) {
  if (confirm('Kill this session?')) {
    await apiCall(`/api/sessions/${sessionKey}`, { method: 'DELETE' });
    loadSessions();
    showToast('Session killed', 'success');
  }
}

function sendToSession(sessionKey) {
  const message = prompt('Message to send:');
  if (message) {
    apiCall('/api/sessions/send', {
      method: 'POST',
      body: JSON.stringify({ sessionKey, message })
    });
    showToast('Message sent', 'success');
  }
}

document.getElementById('spawnSessionBtn')?.addEventListener('click', async () => {
  const label = prompt('Session label:');
  const runtime = prompt('Runtime (subagent/acp):', 'subagent');
  const task = prompt('Initial task (optional):');
  
  if (label) {
    await apiCall('/api/spawn', {
      method: 'POST',
      body: JSON.stringify({ label, runtime, task })
    });
    loadSessions();
    showToast('Session spawned', 'success');
  }
});

// ============ NODES ============
async function loadNodes() {
  setLoading('nodesGrid', true);
  const nodes = await apiCall('/api/nodes');
  setLoading('nodesGrid', false);
  
  const container = document.getElementById('nodesGrid');
  if (!container) return;
  
  if (!nodes || nodes.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted)">No nodes connected</p>';
    return;
  }
  
  container.innerHTML = nodes.map(node => `
    <div class="node-card">
      <div class="node-header">
        <span class="node-name">${escapeHtml(node.name || node.id)}</span>
        <span class="node-status">
          <span class="dot ${node.online ? '' : 'offline'}"></span>
          ${node.online ? 'Online' : 'Offline'}
        </span>
      </div>
      <div class="node-preview" id="preview-${node.id}">
        <span>No preview</span>
      </div>
      <div class="node-actions">
        <button class="btn btn-secondary" onclick="nodeCameraSnap('${node.id}')">📷 Snap</button>
        <button class="btn btn-secondary" onclick="nodeScreen('${node.id}')">🖥️ Screen</button>
      </div>
    </div>
  `).join('');
}

async function nodeCameraSnap(nodeId) {
  const preview = document.getElementById(`preview-${nodeId}`);
  if (preview) {
    preview.innerHTML = '<span>Loading...</span>';
  }
  
  const result = await apiCall(`/api/nodes/${nodeId}/camera?snap=true`);
  if (result && result.image && preview) {
    preview.innerHTML = `<img src="data:image/jpeg;base64,${result.image}" />`;
  } else if (preview) {
    preview.innerHTML = '<span>No camera</span>';
  }
}

async function nodeScreen(nodeId) {
  const preview = document.getElementById(`preview-${nodeId}`);
  if (preview) {
    preview.innerHTML = '<span>Loading...</span>';
  }
  
  const result = await apiCall(`/api/nodes/${nodeId}/screen`);
  if (result && result.image && preview) {
    preview.innerHTML = `<img src="data:image/jpeg;base64,${result.image}" />`;
  } else if (preview) {
    preview.innerHTML = '<span>No screen</span>';
  }
}

document.getElementById('refreshNodesBtn')?.addEventListener('click', loadNodes);

// ============ OLLAMA ============
async function loadOllama() {
  // Load current model
  const status = await apiCall('/status');
  if (status?.model) {
    const select = document.getElementById('modelSelect');
    if (select) select.value = status.model;
  }
  
  // Load available models
  setLoading('modelsList', true);
  const models = await apiCall('/api/ollama/models');
  setLoading('modelsList', false);
  
  const select = document.getElementById('modelSelect');
  const list = document.getElementById('modelsList');
  
  if (models && select) {
    select.innerHTML = models.map(m => 
      `<option value="${escapeHtml(m.name)}" ${m.name === status?.model ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
    ).join('');
  }
  
  if (models && list) {
    list.innerHTML = models.map(m => `
      <div class="model-item">
        <div class="model-info">
          <strong>${escapeHtml(m.name)}</strong>
          <span class="model-size">${formatSize(m.size)}</span>
        </div>
        ${m.name === status?.model ? '<span class="badge">Active</span>' : ''}
      </div>
    `).join('');
  }
}

function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

document.getElementById('setModelBtn')?.addEventListener('click', async () => {
  const model = document.getElementById('modelSelect')?.value;
  if (!model) return;
  
  const result = await apiCall('/api/ollama/model', {
    method: 'POST',
    body: JSON.stringify({ model })
  });
  
  if (result) {
    showToast(`Model changed to ${model}`, 'success');
    loadOllama(); // Refresh to show active badge
  }
});

document.getElementById('refreshModelsBtn')?.addEventListener('click', loadOllama);

// ============ CRON ============
async function loadCron() {
  setLoading('cronList', true);
  const jobs = await apiCall('/api/cron');
  setLoading('cronList', false);
  
  const container = document.getElementById('cronList');
  if (!container) return;
  
  if (!jobs || jobs.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted)">No scheduled jobs</p>';
    return;
  }
  
  container.innerHTML = jobs.map(job => `
    <div class="cron-item">
      <div class="cron-info">
        <h4>${escapeHtml(job.label || job.id)}</h4>
        <p>${escapeHtml(job.schedule)} → ${escapeHtml(job.command)}</p>
      </div>
      <div class="cron-actions">
        <button class="btn btn-danger" onclick="removeCron('${job.id}')">Remove</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('addCronBtn')?.addEventListener('click', async () => {
  const schedule = prompt('Schedule (cron format, e.g., */5 * * * *):');
  const command = prompt('Command:');
  const label = prompt('Label (optional):');
  
  if (schedule && command) {
    await apiCall('/api/cron', {
      method: 'POST',
      body: JSON.stringify({ schedule, command, label })
    });
    loadCron();
    showToast('Cron job added', 'success');
  }
});

async function removeCron(id) {
  if (confirm('Remove this cron job?')) {
    await apiCall(`/api/cron/${id}`, { method: 'DELETE' });
    loadCron();
    showToast('Cron job removed', 'success');
  }
}

// ============ SETTINGS ============
function initSettings() {
  document.getElementById('connectBtn')?.addEventListener('click', connectToGateway);
  
  document.getElementById('reloadConfigBtn')?.addEventListener('click', async () => {
    setLoading('configEditor', true);
    const config = await apiCall('/api/config');
    setLoading('configEditor', false);
    if (config) {
      const editor = document.getElementById('configEditor');
      if (editor) editor.value = JSON.stringify(config, null, 2);
    }
  });
  
  document.getElementById('saveConfigBtn')?.addEventListener('click', async () => {
    try {
      const config = JSON.parse(document.getElementById('configEditor')?.value || '{}');
      const result = await apiCall('/api/config', {
        method: 'POST',
        body: JSON.stringify(config)
      });
      
      if (result) {
        showToast('Config saved', 'success');
      }
    } catch (e) {
      showToast('Invalid JSON: ' + e.message, 'error');
    }
  });
  
  // Load initial config
  document.getElementById('reloadConfigBtn')?.click();
}

// Window controls
document.getElementById('gatewayStatus')?.addEventListener('click', async () => {
  const status = await apiCall('/status');
  if (status) {
    showToast('Gateway is running', 'success');
  }
});
