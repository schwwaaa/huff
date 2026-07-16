#!/usr/bin/env node
/**
 * huff MIDI Bridge  v1.0
 * ──────────────────────────────────────────────────────────────────────────
 * Bridges all system MIDI inputs → WebSocket on ws://127.0.0.1:8788
 *
 * Works with:
 *   • Hardware USB controllers  (Korg nanoKONTROL, nanoKONTROL2, AKAI, etc.)
 *   • Virtual MIDI ports        (IAC Bus on macOS, loopMIDI on Windows)
 *   • Software synths / DAWs    (Max/MSP, Pure Data, Ableton, Bitwig, etc.)
 *
 * HOW TO RUN:
 *   1. Install deps once:  npm install easymidi ws
 *   2. Start bridge:       node src/midi-bridge.cjs
 *      Or via npm script:  npm run midi
 *
 * OPTIONAL PORT ARGUMENT:
 *   node src/midi-bridge.cjs 8789     (use a different WS port)
 *
 * MESSAGES SENT TO huff (JSON over WS):
 *   { type:"ports",   ports: ["name", ...] }                   on connect + hotplug
 *   { type:"cc",      cc:N, val:N, channel:N, port:"name" }    on CC message
 *   { type:"noteon",  note:N, vel:N, channel:N, port:"name" }  on Note On
 *   { type:"noteoff", note:N, vel:N, channel:N, port:"name" }  on Note Off
 *
 * ──────────────────────────────────────────────────────────────────────────
 */
'use strict';

// ── dependency check ─────────────────────────────────────────────────────────
let easymidi, WebSocketServer;
try { easymidi = require('easymidi'); } catch {
    console.error('\n[huff-midi] ✗  easymidi not found. Run:  npm install easymidi\n');
    process.exit(1);
}
try { ({ WebSocketServer } = require('ws')); } catch {
    console.error('\n[huff-midi] ✗  ws not found. Run:  npm install ws\n');
    process.exit(1);
}

const WS_PORT = parseInt(process.argv[2] || '8788', 10);

// ── helpers ───────────────────────────────────────────────────────────────────
function log(msg) { process.stdout.write('[huff-midi] ' + msg + '\n'); }
function warn(msg) { process.stderr.write('[huff-midi] ⚠  ' + msg + '\n'); }

// ── WebSocket relay server ────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT, host: '127.0.0.1' });
const clients = new Set();

wss.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        warn(`port ${WS_PORT} already in use. Is another bridge running?\nTry: node src/midi-bridge.cjs ${WS_PORT + 1}`);
        process.exit(1);
    }
    warn('WebSocketServer error: ' + err.message);
});

wss.on('listening', () => {
    log(`WS relay listening on ws://127.0.0.1:${WS_PORT}`);
    log('Open huff — MIDI pill will turn green when connected.\n');
});

wss.on('connection', ws => {
    clients.add(ws);
    // Send current port list immediately to the new client
    send(ws, { type: 'ports', ports: [...attached.keys()] });
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
    ws.on('message', raw => {
        // Accept optional text commands from the frontend
        try {
            const msg = JSON.parse(String(raw));
            if (msg.type === 'ping') send(ws, { type: 'pong' });
        } catch {}
    });
});

function send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch {}
}

function broadcast(obj) {
    const str = JSON.stringify(obj);
    for (const ws of clients) {
        try { ws.send(str); } catch {}
    }
}

// ── MIDI port management ───────────────────────────────────────────────────────
const attached = new Map(); // portName → easymidi.Input instance

function attachPort(name) {
    if (attached.has(name)) return;
    try {
        const inp = new easymidi.Input(name);

        inp.on('cc', msg => {
            broadcast({ type: 'cc', cc: msg.controller, val: msg.value,
                        channel: msg.channel, port: name });
        });
        inp.on('noteon', msg => {
            broadcast({ type: 'noteon', note: msg.note, vel: msg.velocity,
                        channel: msg.channel, port: name });
        });
        inp.on('noteoff', msg => {
            broadcast({ type: 'noteoff', note: msg.note, vel: msg.velocity,
                        channel: msg.channel, port: name });
        });
        // Program Change — broadcast for future use
        inp.on('program', msg => {
            broadcast({ type: 'program', program: msg.number,
                        channel: msg.channel, port: name });
        });
        // Pitch bend
        inp.on('pitch', msg => {
            broadcast({ type: 'pitch', value: msg.value,
                        channel: msg.channel, port: name });
        });

        attached.set(name, inp);
        log('✓ attached: ' + name);
    } catch (e) {
        warn('could not attach "' + name + '": ' + e.message);
    }
}

function detachPort(name) {
    const inp = attached.get(name);
    if (!inp) return;
    try { inp.close(); } catch {}
    attached.delete(name);
    log('✗ detached: ' + name);
}

function syncPorts() {
    let current;
    try { current = easymidi.getInputs(); } catch { current = []; }

    const prev = [...attached.keys()];

    // Attach new ports
    for (const name of current) attachPort(name);

    // Detach removed ports
    for (const name of prev) {
        if (!current.includes(name)) detachPort(name);
    }

    // Broadcast updated list if anything changed
    const next = [...attached.keys()];
    if (prev.join('|') !== next.join('|')) {
        broadcast({ type: 'ports', ports: next });
    }

    return current;
}

// ── startup ────────────────────────────────────────────────────────────────────
const initial = syncPorts();

if (initial.length === 0) {
    warn('No MIDI input ports found.');
    warn('Connect a USB controller or enable a virtual port, then restart.\n');
} else {
    log(`Found ${initial.length} port${initial.length > 1 ? 's' : ''}:`);
    initial.forEach((n, i) => log(`  [${i}] ${n}`));
    process.stdout.write('\n');
}

// Poll for hotplug every 2 s (easymidi does not emit hotplug events natively)
setInterval(syncPorts, 2000);

// ── graceful shutdown ──────────────────────────────────────────────────────────
function shutdown() {
    log('shutting down…');
    for (const [name] of attached) detachPort(name);
    wss.close();
    process.exit(0);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

log('Ready. Waiting for MIDI…');
