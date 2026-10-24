// 멀티플레이 테트리스 서버: 정적 파일 + WebSocket 방 관리 (최대 8인)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MAX_PLAYERS = 8;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p.startsWith('/r/')) p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();
let nextId = 1;

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (rooms.has(c));
  return c;
}

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room, msg, except) {
  for (const p of room.players.values()) if (p !== except) send(p.ws, msg);
}
function roomState(room) {
  return {
    t: 'room', code: room.code, host: room.host, state: room.state,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, alive: p.alive, wins: p.wins, ready: p.ready,
    })),
  };
}

function startGame(room) {
  if (room.state === 'playing') return;
  room.state = 'playing';
  room.seed = Math.floor(Math.random() * 2 ** 31);
  room.ranking = [];
  room.startAt = Date.now();
  for (const p of room.players.values()) { p.alive = true; p.kos = 0; p.lines = 0; }
  broadcast(room, { t: 'start', seed: room.seed, players: roomState(room).players, solo: room.players.size === 1 });
  broadcast(room, roomState(room));
}

function checkEnd(room) {
  if (room.state !== 'playing') return;
  const alive = [...room.players.values()].filter(p => p.alive);
  const total = room.players.size;
  if ((total > 1 && alive.length <= 1) || alive.length === 0) {
    if (alive[0]) { alive[0].wins++; room.ranking.unshift(alive[0].id); alive[0].alive = false; }
    room.state = 'lobby';
    const results = room.ranking.map((id, i) => {
      const p = room.players.get(id);
      return p ? { id, name: p.name, place: i + 1, kos: p.kos, lines: p.lines } : null;
    }).filter(Boolean);
    broadcast(room, { t: 'end', results, winner: alive[0] ? alive[0].id : null });
    for (const p of room.players.values()) { p.alive = false; p.ready = false; }
    broadcast(room, roomState(room));
  }
}

function pickTarget(room, from, mode) {
  const others = [...room.players.values()].filter(p => p.alive && p !== from);
  if (!others.length) return null;
  if (mode === 'attackers') {
    const att = others.filter(p => p.target === from.id);
    if (att.length) return att[Math.floor(Math.random() * att.length)];
  }
  if (mode === 'ko') {
    // 보드가 가장 높은(위험한) 상대를 노림
    return others.reduce((a, b) => ((b.height || 0) > (a.height || 0) ? b : a));
  }
  if (mode === 'badges') return others.reduce((a, b) => ((b.kos || 0) > (a.kos || 0) ? b : a));
  // random: 같은 타겟을 잠시 유지
  if (from.target && room.players.get(from.target)?.alive && Math.random() < 0.7) return room.players.get(from.target);
  return others[Math.floor(Math.random() * others.length)];
}

function leave(ws) {
  const p = ws.player; if (!p || !p.room) return;
  const room = p.room;
  room.players.delete(p.id);
  p.room = null;
  if (!room.players.size) { rooms.delete(room.code); return; }
  if (room.host === p.id) room.host = room.players.keys().next().value;
  if (room.state === 'playing' && p.alive) {
    p.alive = false;
    room.ranking.unshift(p.id);
    broadcast(room, { t: 'dead', id: p.id, place: room.ranking.length });
  }
  broadcast(room, { t: 'left', id: p.id });
  broadcast(room, roomState(room));
  checkEnd(room);
}

wss.on('connection', ws => {
  const player = { id: nextId++, ws, name: 'Player', room: null, alive: false, wins: 0, ready: false, target: null, height: 0, kos: 0, lines: 0 };
  ws.player = player;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  send(ws, { t: 'hello', id: player.id });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const room = player.room;
    switch (m.t) {
      case 'create': {
        leave(ws);
        player.name = String(m.name || 'Player').slice(0, 12);
        const code = makeCode();
        const r = { code, players: new Map(), host: player.id, state: 'lobby', seed: 0, ranking: [] };
        rooms.set(code, r);
        r.players.set(player.id, player); player.room = r; player.wins = 0;
        send(ws, roomState(r));
        break;
      }
      case 'join': {
        player.name = String(m.name || 'Player').slice(0, 12);
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r) return send(ws, { t: 'error', msg: '방을 찾을 수 없습니다' });
        if (r.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: '방이 가득 찼습니다 (최대 8명)' });
        if (r.state === 'playing') return send(ws, { t: 'error', msg: '게임이 진행 중입니다. 잠시 후 다시 시도하세요' });
        leave(ws);
        r.players.set(player.id, player); player.room = r; player.wins = 0; player.alive = false;
        broadcast(r, roomState(r));
        break;
      }
      case 'leave': leave(ws); break;
      case 'ready':
        if (!room || room.state !== 'lobby') return;
        player.ready = !!m.v; broadcast(room, roomState(room));
        break;
      case 'start':
        if (!room || room.host !== player.id) return;
        startGame(room);
        break;
      case 'board':
        if (!room || room.state !== 'playing') return;
        player.height = m.h | 0;
        broadcast(room, { t: 'board', id: player.id, b: m.b, h: m.h, g: m.g }, player);
        break;
      case 'attack': {
        if (!room || room.state !== 'playing' || !player.alive) return;
        const n = Math.min(20, Math.max(0, m.n | 0));
        player.lines = m.lines | 0;
        if (!n) return;
        const target = pickTarget(room, player, m.mode);
        if (!target) return;
        player.target = target.id;
        send(target.ws, { t: 'garbage', n, from: player.id });
        broadcast(room, { t: 'attackfx', from: player.id, to: target.id, n });
        break;
      }
      case 'dead': {
        if (!room || room.state !== 'playing' || !player.alive) return;
        player.alive = false;
        player.lines = m.lines | 0;
        room.ranking.unshift(player.id);
        // KO 크레딧: 마지막으로 공격한 사람
        const killer = room.players.get(m.by);
        if (killer && killer !== player) { killer.kos++; send(killer.ws, { t: 'ko', victim: player.id }); }
        const place = room.players.size - room.ranking.length + 1;
        broadcast(room, { t: 'dead', id: player.id, place, by: m.by });
        broadcast(room, roomState(room));
        checkEnd(room);
        break;
      }
      case 'chat':
        if (!room) return;
        broadcast(room, { t: 'chat', id: player.id, name: player.name, msg: String(m.msg || '').slice(0, 60) });
        break;
      case 'ping': send(ws, { t: 'pong', ts: m.ts }); break;
    }
  });
  ws.on('close', () => leave(ws));
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 15000);

server.listen(PORT, () => console.log(`Tetris server on http://localhost:${PORT}`));
