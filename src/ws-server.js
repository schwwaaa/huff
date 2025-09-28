// ws-server.js (port 8787)
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8787 });
// const wss = new WebSocket.Server({ port: 17777 });
const meta = new Map(); // ws -> {role}

wss.on('connection', (ws) => {
  meta.set(ws, { role: 'unknown' });

  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      try {
        const msg = JSON.parse(String(data));
        if (msg?.type === 'hello' && (msg.role === 'index' || msg.role === 'canvas')) {
          meta.set(ws, { role: msg.role });
        }
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client !== ws) client.send(JSON.stringify(msg));
        });
      } catch {}
      return;
    }
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        const r = meta.get(client);
        if (r?.role === 'canvas') client.send(data, { binary: true });
      }
    });
  });
  ws.on('close', () => meta.delete(ws));
});
console.log('WS relay on ws://127.0.0.1:8787');
