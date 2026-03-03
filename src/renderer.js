// OpenClaw Hub - Renderer Process

// State
let currentTab = 'dashboard';
let currentChannel = null;
let gatewayUrl = localStorage.getItem('gatewayUrl') || '';
let apiKey = localStorage.getItem('apiKey') || '';
let terminal = null;
let terminalSocket = null;
let reconnectInterval = null;
let heartbeatInterval = null;
let heartbeatPaused = false;
let heartbeatIntervalSec = 30;
let activityLogs = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  log('OpenClaw Hub started');
  initTabs();
  initChat();
  initTerminal();
  initSettings();
  initHeartbeat();
  
  // Load saved gateway URL
  if (gatewayUrl) {
    document.getElementById('gatewayUrl').value = gatewayUrl;
    connectToGateway();
  }
});

// ============ TABS ============
function initTabs() {
  const navBtns = document.querySelectorAll('.nav-btn');
  
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const tabs = ['dashboard', 'chat', 'terminal', 'sessions', 'nodes', 'ollama', 'cron', 'logs', 'settings'];
      const idx = parseInt(e.key) - 1;
      if (tabs[idx]) switchTab(tabs[idx]);
    }
  });
}

function switchTab(tab) {
  currentTab = tab;
  
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tab}`);
  });
  
  const titles = {
    dashboard: 'Dashboard',
    chat: 'Chat',
    terminal: 'Terminal',
    sessions: 'Sessions',
    nodes: 'Nodes',
    ollama: 'Ollama',
    cron: 'Cron Jobs',
    logs: 'Activity Logs',
    settings: 'Settings'
  };
  document.getElementById('tabTitle').textContent = titles[tab] || tab;
  
  // Load tab data
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'sessions') loadSessions();
  if (tab === 'nodes') loadNodes();
  if (tab === 'ollama') loadOllama();
  if (tab === 'cron') loadCron();
  if (tab === 'terminal' && terminal) {
    setTimeout(() => terminal?.fit?.(), 100);
  }
}

// ============ LOGGING ============
function log(message, level = 'info') {
  const time = new Date().toLocaleTimeString();
  activityLogs.unshift({ time, message, level });
  if (activityLogs.length > 100) activityLogs.pop();
  
  const container = document.getElementById('logsContainer');
  if (container) {
    container.innerHTML = activityLogs.slice(0, 50).map(l => 
      `<div class="log-entry ${l.level}"><span class="log-time">${l.time}</span>${escapeHtml(l.message)}</div>`
    ).join('');
  }
}

// ============ TOASTS ============
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span> <span>${escapeHtml(message)}</span>`;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
  
  log(message, type === 'error' ? 'error' : 'info');
}

// ============ API ============
async function apiCall(endpoint, options = {}) {
  if (!gatewayUrl) return null;
  
  const url = `${gatewayUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
    ...options.headers
  };
  
  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    updateConnectionStatus(false);
    return null;
  }
}

// ============ CONNECTION ============
function updateConnectionStatus(online) {
  const statusDot = document.getElementById('statusDot');
  const statusIndicator = document.querySelector('.status-indicator');
  const statusText = document.getElementById('statusText');
  
  if (statusDot) statusDot.classList.toggle('online', online);
  if (statusText) statusText.textContent = online ? 'Connected' : 'Disconnected';
  
  if (!online && gatewayUrl && !reconnectInterval) {
    log('Connection lost, attempting reconnect...', 'warn');
    reconnectInterval = setInterval(async () => {
      const status = await apiCall('/status');
      if (status) {
        updateConnectionStatus(true);
        showToast('Reconnected!', 'success');
        log('Reconnected to gateway');
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
    }, 10000);
  } else if (online && reconnectInterval) {
    clearInterval(reconnectInterval);
    reconnectInterval = null;
  }
}

async function connectToGateway() {
  const url = document.getElementById('gatewayUrl')?.value;
  const key = document.getElementById('apiKey')?.value;
  
  if (!url) {
    showToast('Please enter a gateway URL', 'error');
    return;
  }
  
  gatewayUrl = url;
  apiKey = key;
  localStorage.setItem('gatewayUrl', url);
  localStorage.setItem('apiKey', key);
  
  log(`Connecting to ${url}...`);
  const status = await apiCall('/status');
  
  if (status) {
    updateConnectionStatus(true);
    showToast('Connected to gateway', 'success');
    log('Connected to gateway successfully');
    loadChannels();
    loadDashboard();
  } else {
    showToast('Failed to connect', 'error');
    log('Failed to connect to gateway', 'error');
  }
}

// ============ HEARTBEAT ============
function initHeartbeat() {
  const savedInterval = localStorage.getItem('heartbeatInterval');
  if (savedInterval) {
    heartbeatIntervalSec = parseInt(savedInterval);
    document.getElementById('heartbeatInterval').value = heartbeatIntervalSec;
  }
  
  startHeartbeat();
  
  document.getElementById('toggleHeartbeat')?.addEventListener('click', () => {
    heartbeatPaused = !heartbeatPaused;
    document.getElementById('toggleHeartbeat').textContent = heartbeatPaused ? 'Resume' : 'Pause';
    document.getElementById('heartbeatStatus').textContent = heartbeatPaused 
      ? 'Heartbeat paused' 
      : `Heartbeat active - checking every ${heartbeatIntervalSec}s`;
    
    if (!heartbeatPaused) startHeartbeat();
  });
  
  document.getElementById('saveHeartbeatSettings')?.addEventListener('click', () => {
    heartbeatIntervalSec = parseInt(document.getElementById('heartbeatInterval')?.value || 30);
    localStorage.setItem('heartbeatInterval', heartbeatIntervalSec);
    showToast('Heartbeat settings saved', 'success');
    if (!heartbeatPaused) {
      stopHeartbeat();
      startHeartbeat();
    }
  });
}

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  heartbeatInterval = setInterval(async () => {
    if (heartbeatPaused || !gatewayUrl) return;
    
    const status = await apiCall('/status');
    const pulse = document.getElementById('heartbeatPulse');
    const statusEl = document.getElementById('heartbeatStatus');
    
    if (status) {
      if (pulse) pulse.style.background = 'var(--accent-success)';
      if (statusEl) statusEl.textContent = `✓ Gateway healthy - ${new Date().toLocaleTimeString()}`;
      log('Heartbeat OK');
    } else {
      if (pulse) pulse.style.background = 'var(--accent-danger)';
      if (statusEl) statusEl.textContent = '⚠ Gateway offline!';
      showToast('Gateway is offline!', 'error');
      log('Heartbeat FAILED - gateway offline', 'error');
    }
  }, heartbeatIntervalSec * 1000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// ============ DASHBOARD ============
async function loadDashboard() {
  const status = await apiCall('/status');
  const sessions = await apiCall('/api/sessions') || [];
  const nodes = await apiCall('/api/nodes') || [];
  const cron = await apiCall('/api/cron') || [];
  
  document.getElementById('statSessions').textContent = sessions.length;
  document.getElementById('statNodes').textContent = nodes.filter(n => n.online).length;
  document.getElementById('statCron').textContent = cron.length;
  
  if (status?.uptime) {
    const hrs = Math.floor(status.uptime / 3600);
    const mins = Math.floor((status.uptime % 3600) / 60);
    document.getElementById('statUptime').textContent = `${hrs}h ${mins}m`;
  }
}

// ============ CHAT ============
function initChat() {
  document.getElementById('sendBtn')?.addEventListener('click', sendMessage);
  document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

async function loadChannels() {
  const channels = await apiCall('/api/channels');
  if (!channels) return;
  
  const container = document.getElementById('channels');
  container.innerHTML = channels.map(ch => `
    <div class="channel-item ${currentChannel === ch.id ? 'active' : ''}" data-id="${ch.id}">
      <span>#</span> <span>${escapeHtml(ch.name || ch.id)}</span>
    </div>
  `).join('');
  
  container.querySelectorAll('.channel-item').forEach(item => {
    item.addEventListener('click', () => selectChannel(item.dataset.id));
  });
  
  if (channels.length > 0 && !currentChannel) {
    selectChannel(channels[0].id);
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
  const messages = await apiCall(`/api/channels/${channelId}/messages?limit=50`);
  const container = document.getElementById('chatMessages');
  
  if (!messages || messages.length === 0) {
    container.innerHTML = `<div class="welcome-message"><h2>#${channelId}</h2><p>No messages yet</p></div>`;
    return;
  }
  
  container.innerHTML = messages.map(msg => `
    <div class="message">
      <div class="message-header">
        <span class="message-author">${escapeHtml(msg.author || 'User')}</span>
        <span class="message-time">${new Date(msg.timestamp).toLocaleString()}</span>
      </div>
      <div class="message-content">${escapeHtml(msg.content)}</div>
    </div>
  `).join('');
  
  container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message || !currentChannel) return;
  
  input.value = '';
  await apiCall('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ channel: currentChannel, message })
  });
  loadMessages(currentChannel);
  log(`Sent message to #${currentChannel}`);
}

// ============ TERMINAL ============
function initTerminal() {
  document.querySelector('[data-tab="terminal"]')?.addEventListener('click', async () => {
    if (!terminal) await initXterm();
  });
  
  document.getElementById('terminalClear')?.addEventListener('click', () => terminal?.clear());
  document.getElementById('terminalKill')?.addEventListener('click', () => {
    if (terminalSocket) {
      terminalSocket.close();
      terminalSocket = null;
      terminal?.writeln('\x1b[33mDisconnected\x1b[0m');
    }
  });
}

async function initXterm() {
  const container = document.getElementById('terminal');
  if (!container || terminal) return;
  
  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
    theme: { background: '#0d1117', foreground: '#e6edf3', cursor: '#58a6ff' }
  });
  
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(container);
  fitAddon.fit();
  
  terminal.onData(data => {
    if (terminalSocket?.readyState === WebSocket.OPEN) {
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
    terminalSocket.onopen = () => terminal?.writeln('\x1b[32mConnected to OpenClaw Terminal\x1b[0m');
    terminalSocket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'output') terminal?.write(data.data);
    };
    terminalSocket.onclose = () => terminal?.writeln('\x1b[31mDisconnected\x1b[0m');
    terminalSocket.onerror = () => terminal?.writeln('\x1b[31mConnection error\x1b[0m');
  } catch (e) {
    terminal?.writeln('\x1b[31mFailed to connect\x1b[0m');
  }
}

// ============ SESSIONS ============
async function loadSessions() {
  const sessions = await apiCall('/api/sessions') || [];
  const container = document.getElementById('sessionsList');
  
  if (sessions.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted)">No active sessions</p>';
    return;
  }
  
  container.innerHTML = sessions.map(s => `
    <div class="session-item">
      <div class="session-info">
        <h4>${escapeHtml(s.label || s.sessionKey)}</h4>
        <p>${s.runtime} • ${s.status || 'active'}</p>
      </div>
      <div class="session-actions">
        <button class="btn btn-secondary" onclick="sendToSession('${s.sessionKey}')">Message</button>
        <button class="btn btn-danger" onclick="killSession('${s.sessionKey}')">Kill</button>
      </div>
    </div>
  `).join('');
}

async function killSession(sessionKey) {
  if (!confirm('Kill this session?')) return;
  await apiCall(`/api/sessions/${sessionKey}`, { method: 'DELETE' });
  loadSessions();
  showToast('Session killed', 'success');
  log(`Killed session: ${sessionKey}`);
}

function sendToSession(sessionKey) {
  const message = prompt('Message:');
  if (!message) return;
  apiCall('/api/sessions/send', {
    method: 'POST',
    body: JSON.stringify({ sessionKey, message })
  });
  showToast('Message sent', 'success');
  log(`Sent message to session: ${sessionKey}`);
}

document.getElementById('spawnSessionBtn')?.addEventListener('click', async () => {
  const label = prompt('Session label:');
  const runtime = prompt('Runtime (subagent/acp):', 'subagent');
  const task = prompt('Initial task (optional):');
  if (!label) return;
  
  await apiCall('/api/spawn', {
    method: 'POST',
    body: JSON.stringify({ label, runtime, task })
  });
  loadSessions();
  showToast('Session spawned', 'success');
  log(`Spawned session: ${label}`);
});

// ============ NODES ============
async function loadNodes() {
  const nodes = await apiCall('/api/nodes') || [];
  const container = document.getElementById('nodesGrid');
  
  if (nodes.length === 0) {
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
  if (preview) preview.innerHTML = '<span>Loading...</span>';
  
  const result = await apiCall(`/api/nodes/${nodeId}/camera?snap=true`);
  if (result?.image && preview) {
    preview.innerHTML = `<img src="data:image/jpeg;base64,${result.image}" />`;
    log(`Camera snap: ${nodeId}`);
  } else if (preview) {
    preview.innerHTML = '<span>No camera</span>';
  }
}

async function nodeScreen(nodeId) {
  const preview = document.getElementById(`preview-${nodeId}`);
  if (preview) preview.innerHTML = '<span>Loading...</span>';
  
  const result = await apiCall(`/api/nodes/${nodeId}/screen`);
  if (result?.image && preview) {
    preview.innerHTML = `<img src="data:image/jpeg;base64,${result.image}" />`;
    log(`Screen capture: ${nodeId}`);
  } else if (preview) {
    preview.innerHTML = '<span>No screen</span>';
  }
}

document.getElementById('refreshNodesBtn')?.addEventListener('click', loadNodes);

// ============ OLLAMA ============
async function loadOllama() {
  const status = await apiCall('/status');
  const models = await apiCall('/api/ollama/models') || [];
  
  const select = document.getElementById('modelSelect');
  const list = document.getElementById('modelsList');
  
  if (select) {
    select.innerHTML = models.map(m => 
      `<option value="${escapeHtml(m.name)}" ${m.name === status?.model ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
    ).join('');
  }
  
  if (list) {
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
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
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
    loadOllama();
    log(`Changed Ollama model to: ${model}`);
  }
});

document.getElementById('refreshModelsBtn')?.addEventListener('click', loadOllama);

// ============ CRON ============
async function loadCron() {
  const jobs = await apiCall('/api/cron') || [];
  const container = document.getElementById('cronList');
  
  if (jobs.length === 0) {
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
  if (!schedule || !command) return;
  
  await apiCall('/api/cron', {
    method: 'POST',
    body: JSON.stringify({ schedule, command, label })
  });
  loadCron();
  showToast('Cron job added', 'success');
  log(`Added cron job: ${label || command}`);
});

async function removeCron(id) {
  if (!confirm('Remove this cron job?')) return;
  await apiCall(`/api/cron/${id}`, { method: 'DELETE' });
  loadCron();
  showToast('Cron job removed', 'success');
  log(`Removed cron job: ${id}`);
}

document.getElementById('clearLogsBtn')?.addEventListener('click', () => {
  activityLogs = [];
  document.getElementById('logsContainer').innerHTML = '<div class="log-entry"><span class="log-time">--:--:--</span>Logs cleared</div>';
});

// ============ SETTINGS ============
function initSettings() {
  document.getElementById('connectBtn')?.addEventListener('click', connectToGateway);
  
  document.getElementById('reloadConfigBtn')?.addEventListener('click', async () => {
    const config = await apiCall('/api/config');
    if (config) {
      document.getElementById('configEditor').value = JSON.stringify(config, null, 2);
    }
  });
  
  document.getElementById('saveConfigBtn')?.addEventListener('click', async () => {
    try {
      const config = JSON.parse(document.getElementById('configEditor')?.value || '{}');
      await apiCall('/api/config', { method: 'POST', body: JSON.stringify(config) });
      showToast('Config saved', 'success');
      log('Gateway config saved');
    } catch (e) {
      showToast('Invalid JSON: ' + e.message, 'error');
    }
  });
  
  document.getElementById('gatewayStatusBtn')?.addEventListener('click', async () => {
    const status = await apiCall('/status');
    if (status) {
      showToast('Gateway is running', 'success');
    }
  });
  
  // Load initial config
  document.getElementById('reloadConfigBtn')?.click();
}

// ============ UTILS ============
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
