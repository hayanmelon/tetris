'use strict';
// ===================== 상수 =====================
const COLS = 10, ROWS = 22, VIS = 20, HIDDEN = ROWS - VIS;
const COLORS = [null, '#29d8f0', '#f7d63b', '#a64df0', '#4fe06a', '#f04a4a', '#3b6cf7', '#f79b2e', '#7a7f99'];
const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']; // 인덱스+1 = 색상
const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};
// SRS 회전 상태 미리 계산 (시계방향 행렬 회전 = SRS 상태)
const ROT = {};
for (const t of TYPES) {
  ROT[t] = [SHAPES[t]];
  for (let r = 1; r < 4; r++) {
    const p = ROT[t][r - 1], n = p.length;
    ROT[t].push(p.map((row, y) => row.map((_, x) => p[n - 1 - x][y])));
  }
}
// SRS 월킥 (SRS 좌표: y 위쪽이 +)
const KICK_JLSTZ = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],     '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],    '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};
const KICK_I = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]], '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]], '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]], '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]], '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};
const COMBO_TABLE = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
const LOCK_DELAY = 500, MAX_RESETS = 15, GARBAGE_CAP = 10;
const TARGET_NAMES = { random: '랜덤', ko: 'KO노림', attackers: '반격', badges: '강자' };

// ===================== 유틸 =====================
const $ = s => document.querySelector(s);
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } }
function toast(msg, ms = 1800) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), ms);
}
function vibrate(p) { if (settings.vibe && navigator.vibrate) try { navigator.vibrate(p); } catch {} }
const settings = { sound: store('t8sound') !== '0', vibe: true };

// ===================== 사운드 (WebAudio 합성) =====================
const Sound = {
  ctx: null, master: null, musicGain: null, musicTimer: null, musicStep: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = settings.sound ? 0.5 : 0;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.18; this.musicGain.connect(this.master);
    } catch { this.ctx = null; }
  },
  tone(freq, dur, type = 'square', vol = 0.2, slide = 0, when = 0, dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2) {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * dur, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); g.gain.value = vol;
    s.buffer = buf; s.connect(g); g.connect(this.master); s.start();
  },
  move() { this.tone(520, 0.03, 'square', 0.05); },
  rotate() { this.tone(760, 0.05, 'triangle', 0.12, 200); },
  soft() { this.tone(300, 0.02, 'square', 0.03); },
  hard() { this.tone(160, 0.12, 'square', 0.25, -100); this.noise(0.08, 0.15); },
  lock() { this.tone(220, 0.05, 'triangle', 0.12); },
  hold() { this.tone(440, 0.06, 'sine', 0.15, 300); },
  clear(n, special) {
    const base = [0, 523, 659, 784, 1046][n] || 523;
    for (let i = 0; i < n + (special ? 2 : 0); i++) this.tone(base * Math.pow(1.122, i), 0.12, 'square', 0.12, 0, i * 0.05);
    if (n >= 4 || special) this.noise(0.25, 0.1);
  },
  garbage() { this.tone(110, 0.25, 'sawtooth', 0.2, -60); },
  ko() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.15, 'square', 0.15, 0, i * 0.07)); },
  over() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.25, 0, i * 0.18)); },
  count(go) { this.tone(go ? 1046 : 523, go ? 0.4 : 0.15, 'square', 0.2); },
  win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.2, 'square', 0.18, 0, i * 0.12)); },
  // 코로베이니키 (러시아 민요, 퍼블릭 도메인)
  MELODY: [
    [76,2],[71,1],[72,1],[74,2],[72,1],[71,1],[69,2],[69,1],[72,1],[76,2],[74,1],[72,1],[71,3],[72,1],[74,2],[76,2],[72,2],[69,2],[69,4],
    [0,1],[74,2],[77,1],[81,2],[79,1],[77,1],[76,3],[72,1],[76,2],[74,1],[72,1],[71,2],[71,1],[72,1],[74,2],[76,2],[72,2],[69,2],[69,4],
  ],
  BASS: [40,52,40,52,45,57,45,57,44,56,44,56,45,57,45,57, 38,50,38,50,36,48,36,48,44,56,44,56,45,57,45,57],
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    let next = this.ctx.currentTime + 0.1, mi = 0, bi = 0, mt = 0, bt = 0;
    const beat = 0.16;
    const sched = () => {
      while (next < this.ctx.currentTime + 0.4) {
        if (mt <= 0) {
          const [n, d] = this.MELODY[mi % this.MELODY.length]; mi++;
          if (n) this.tone(440 * Math.pow(2, (n - 69) / 12), d * beat * 0.9, 'square', 0.5, 0, next - this.ctx.currentTime, this.musicGain);
          mt = d;
        }
        if (bt <= 0) {
          const n = this.BASS[bi % this.BASS.length]; bi++;
          this.tone(440 * Math.pow(2, (n - 69) / 12), beat * 1.8, 'triangle', 0.9, 0, next - this.ctx.currentTime, this.musicGain);
          bt = 2;
        }
        mt--; bt--; next += beat;
      }
    };
    sched(); this.musicTimer = setInterval(sched, 100);
  },
  stopMusic() { clearInterval(this.musicTimer); this.musicTimer = null; },
  setOn(on) { settings.sound = on; store('t8sound', on ? '1' : '0'); if (this.master) this.master.gain.value = on ? 0.5 : 0; },
};

// ===================== 게임 엔진 =====================
class Game {
  constructor(seed, opts = {}) {
    this.rng = mulberry32(seed);
    this.multi = !!opts.multi;
    this.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
    this.bag = []; this.queue = [];
    this.hold = null; this.canHold = true;
    this.score = 0; this.lines = 0; this.level = 1; this.combo = -1; this.b2b = false;
    this.pieces = 0; this.attackSent = 0; this.kos = 0; this.tetrises = 0; this.tspins = 0;
    this.garbageQueue = []; this.lastAttacker = null;
    this.over = false; this.time = 0;
    this.gravAcc = 0; this.lockTimer = 0; this.lockResets = 0; this.lowestY = 0;
    this.lastRotate = false; this.lastKick = 0; this.softDrop = false;
    this.events = []; // 렌더러/네트워크에 전달할 이벤트
    this.garbageRng = mulberry32(seed ^ 0x9e3779b9 ^ (opts.id || 0) * 7919);
    while (this.queue.length < 6) this.fillQueue();
    this.spawn();
  }
  fillQueue() {
    if (!this.bag.length) {
      this.bag = TYPES.slice();
      for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
    }
    this.queue.push(this.bag.pop());
  }
  gravity() { // 초당 셀 수 (가이드라인 공식)
    const l = Math.min(this.level, 20);
    return 1 / Math.pow(0.8 - (l - 1) * 0.007, l - 1);
  }
  shape(p = this.cur) { return ROT[p.type][p.rot]; }
  collide(type, rot, x, y) {
    const s = ROT[type][rot];
    for (let r = 0; r < s.length; r++) for (let c = 0; c < s.length; c++) {
      if (!s[r][c]) continue;
      const bx = x + c, by = y + r;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && this.board[by][bx]) return true;
    }
    return false;
  }
  spawn(type) {
    if (!type) { type = this.queue.shift(); this.fillQueue(); }
    const size = ROT[type][0].length;
    this.cur = { type, rot: 0, x: Math.floor((COLS - size) / 2), y: type === 'I' ? HIDDEN - 2 : HIDDEN - 1 };
    if (size === 2) this.cur.x = 4;
    this.lockTimer = 0; this.lockResets = 0; this.lowestY = this.cur.y; this.gravAcc = 0; this.lastRotate = false;
    if (this.collide(type, 0, this.cur.x, this.cur.y)) {
      this.cur.y--;
      if (this.collide(type, 0, this.cur.x, this.cur.y)) { this.gameOver(); return; }
    }
    // 스폰 직후 1칸 하강 (가이드라인)
    if (!this.collide(type, 0, this.cur.x, this.cur.y + 1)) this.cur.y++;
  }
  onGround() { return this.collide(this.cur.type, this.cur.rot, this.cur.x, this.cur.y + 1); }
  resetLock() {
    if (this.onGround() && this.lockResets < MAX_RESETS) { this.lockTimer = 0; this.lockResets++; }
  }
  move(dx) {
    if (this.over) return false;
    const c = this.cur;
    if (!this.collide(c.type, c.rot, c.x + dx, c.y)) {
      c.x += dx; this.lastRotate = false; this.resetLock(); Sound.move(); return true;
    }
    return false;
  }
  rotate(dir) {
    if (this.over) return false;
    const c = this.cur;
    if (c.type === 'O') { Sound.rotate(); return true; }
    const to = (c.rot + dir + 4) % 4;
    const kicks = (c.type === 'I' ? KICK_I : KICK_JLSTZ)[c.rot + '>' + to];
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (!this.collide(c.type, to, c.x + kx, c.y - ky)) {
        c.x += kx; c.y -= ky; c.rot = to;
        this.lastRotate = true; this.lastKick = i;
        this.resetLock(); Sound.rotate();
        if (c.y > this.lowestY) { this.lowestY = c.y; this.lockResets = 0; }
        return true;
      }
    }
    return false;
  }
  softStep() {
    const c = this.cur;
    if (!this.collide(c.type, c.rot, c.x, c.y + 1)) {
      c.y++; this.score += 1; this.lastRotate = false;
      if (c.y > this.lowestY) { this.lowestY = c.y; this.lockResets = 0; }
      return true;
    }
    return false;
  }
  ghostY() {
    const c = this.cur; let y = c.y;
    while (!this.collide(c.type, c.rot, c.x, y + 1)) y++;
    return y;
  }
  hardDrop() {
    if (this.over) return;
    const c = this.cur, gy = this.ghostY(), dist = gy - c.y;
    if (dist > 0) this.lastRotate = false;
    this.score += dist * 2;
    this.events.push({ t: 'hard', x: c.x, y0: c.y, y1: gy, type: c.type, rot: c.rot });
    c.y = gy;
    Sound.hard(); vibrate(15);
    this.lock();
  }
  doHold() {
    if (this.over || !this.canHold) return;
    const t = this.cur.type;
    if (this.hold) { const h = this.hold; this.hold = t; this.spawn(h); }
    else { this.hold = t; this.spawn(); }
    this.canHold = false; Sound.hold();
  }
  checkTSpin() {
    const c = this.cur;
    if (c.type !== 'T' || !this.lastRotate) return 0;
    const occ = (x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && this.board[y][x] !== 0);
    const corners = [occ(c.x, c.y), occ(c.x + 2, c.y), occ(c.x + 2, c.y + 2), occ(c.x, c.y + 2)]; // TL TR BR BL
    const n = corners.filter(Boolean).length;
    if (n < 3) return 0;
    const front = [[0, 1], [1, 2], [2, 3], [3, 0]][c.rot];
    if (corners[front[0]] && corners[front[1]]) return 2;
    return this.lastKick === 4 ? 2 : 1; // 1 = 미니
  }
  lock() {
    const c = this.cur, s = this.shape();
    const tspin = this.checkTSpin();
    let above = true;
    for (let r = 0; r < s.length; r++) for (let x = 0; x < s.length; x++) {
      if (!s[r][x]) continue;
      const by = c.y + r;
      if (by >= 0) this.board[by][c.x + x] = TYPES.indexOf(c.type) + 1;
      if (by >= HIDDEN) above = false;
    }
    this.pieces++;
    // 라인 클리어
    const cleared = [];
    for (let y = 0; y < ROWS; y++) if (this.board[y].every(v => v)) cleared.push(y);
    for (const y of cleared) { this.board.splice(y, 1); this.board.unshift(new Array(COLS).fill(0)); }
    const n = cleared.length;
    let attack = 0, label = '', special = false;
    if (n || tspin) {
      const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
      if (tspin === 2) { label = 'T-SPIN ' + (names[n] || ''); attack = [0, 2, 4, 6][n]; this.score += [400, 800, 1200, 1600][n] * this.level; this.tspins++; }
      else if (tspin === 1) { label = 'T-SPIN MINI ' + (names[n] || ''); attack = [0, 0, 1, 2][n]; this.score += [100, 200, 400][n] * this.level; }
      else { label = names[n]; attack = [0, 0, 1, 2, 4][n]; this.score += [0, 100, 300, 500, 800][n] * this.level; }
      special = n === 4 || (tspin && n > 0);
      if (n === 4) this.tetrises++;
    }
    let b2bNow = false;
    if (n) {
      if (special) { if (this.b2b) { attack += 1; b2bNow = true; } this.b2b = true; }
      else this.b2b = false;
      this.combo++;
      attack += COMBO_TABLE[Math.min(this.combo, COMBO_TABLE.length - 1)];
      if (this.combo > 0) this.score += 50 * this.combo * this.level;
      const pc = this.board.every(row => row.every(v => !v));
      if (pc) { attack = 10; this.score += 3000 * this.level; this.events.push({ t: 'text', s: 'PERFECT CLEAR', big: true, color: '#f7d63b' }); }
      this.lines += n;
      if (!this.multi) this.level = 1 + Math.floor(this.lines / 10);
      Sound.clear(n, special); vibrate(n >= 4 ? [30, 30, 60] : 20);
    } else {
      this.combo = -1;
      Sound.lock();
    }
    if (label) this.events.push({ t: 'text', s: label, big: special, color: special ? '#f7d63b' : '#fff' });
    if (b2bNow) this.events.push({ t: 'text', s: 'BACK-TO-BACK', color: '#ff7ad9' });
    if (this.combo > 0) this.events.push({ t: 'text', s: this.combo + ' COMBO', color: '#4dd8ff' });
    if (n) this.events.push({ t: 'clear', rows: cleared, n });

    // 공격: 대기 가비지 상쇄 후 송신
    if (attack > 0) {
      while (attack > 0 && this.garbageQueue.length) {
        const g = this.garbageQueue[0], k = Math.min(g.n, attack);
        g.n -= k; attack -= k; if (!g.n) this.garbageQueue.shift();
      }
      if (attack > 0) { this.attackSent += attack; this.events.push({ t: 'attack', n: attack }); }
    } else if (!n && this.garbageQueue.length) {
      this.applyGarbage();
    }
    this.canHold = true;
    this.events.push({ t: 'locked' });
    if (above && !n) { this.gameOver(); return; }
    this.spawn();
  }
  addGarbage(n, from) {
    this.garbageQueue.push({ n, from, t: this.time });
    this.lastAttacker = from;
    Sound.garbage();
  }
  applyGarbage() {
    let total = 0;
    while (this.garbageQueue.length && total < GARBAGE_CAP) {
      const g = this.garbageQueue[0], k = Math.min(g.n, GARBAGE_CAP - total);
      const hole = Math.floor(this.garbageRng() * COLS);
      for (let i = 0; i < k; i++) {
        const top = this.board.shift();
        if (top.some(v => v)) this.toppedByGarbage = true;
        const row = new Array(COLS).fill(8); row[hole] = 0;
        this.board.push(row);
      }
      total += k; g.n -= k; if (!g.n) this.garbageQueue.shift();
    }
    if (total) { this.events.push({ t: 'garbageIn', n: total }); vibrate([40, 30, 40]); }
    if (this.toppedByGarbage) this.gameOver();
  }
  pendingGarbage() { return this.garbageQueue.reduce((a, g) => a + g.n, 0); }
  height() {
    for (let y = 0; y < ROWS; y++) if (this.board[y].some(v => v)) return ROWS - y;
    return 0;
  }
  gameOver() {
    if (this.over) return;
    this.over = true; this.events.push({ t: 'over' });
  }
  update(dt) {
    if (this.over) return;
    this.time += dt;
    if (this.multi) this.level = Math.min(15, 1 + Math.floor(this.time / 30000));
    const g = this.softDrop ? Math.max(this.gravity() * 20, 20) : this.gravity();
    this.gravAcc += g * dt / 1000;
    while (this.gravAcc >= 1) {
      this.gravAcc -= 1;
      const c = this.cur;
      if (!this.collide(c.type, c.rot, c.x, c.y + 1)) {
        c.y++; this.lastRotate = false;
        if (this.softDrop) { this.score += 1; Sound.soft(); }
        if (c.y > this.lowestY) { this.lowestY = c.y; this.lockResets = 0; }
      } else { this.gravAcc = 0; break; }
    }
    if (this.onGround()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY || this.lockResets >= MAX_RESETS && this.lockTimer >= 100) this.lock();
    } else this.lockTimer = 0;
  }
  serialize() {
    let s = '';
    for (let y = HIDDEN; y < ROWS; y++) s += this.board[y].join('');
    return s;
  }
}

// ===================== 네트워크 =====================
const Net = {
  ws: null, id: null, room: null, connected: false, handlers: {}, retry: 0,
  connect() {
    if (location.protocol === 'file:') { this.status('오프라인 모드 (솔로만 가능)', 'bad'); return; }
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    try { this.ws = new WebSocket(url); } catch { this.status('서버에 연결할 수 없음', 'bad'); return; }
    this.ws.onopen = () => { this.connected = true; this.retry = 0; this.status('온라인 · 서버 연결됨', 'ok'); this.emit('open'); };
    this.ws.onclose = () => {
      const wasIn = !!this.room;
      this.connected = false; this.room = null; this.status('연결 끊김 · 재연결 중…', 'bad');
      if (wasIn) this.emit('disconnect');
      setTimeout(() => this.connect(), Math.min(8000, 1000 * 2 ** this.retry++));
    };
    this.ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.emit(m.t, m); };
  },
  send(m) { if (this.connected && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
  on(t, f) { this.handlers[t] = f; },
  emit(t, m) { const f = this.handlers[t]; if (f) f(m); },
  status(txt, cls) { const el = $('#netStatus'); el.textContent = txt; el.className = 'net ' + (cls || ''); },
};

// ===================== 앱 상태 =====================
const App = {
  screen: 'menu', game: null, mode: 'solo', // solo | multi
  players: [], opponents: new Map(), targetMode: store('t8target') || 'random',
  paused: false, countdown: 0, results: null, host: null, pendingJoin: null,
  fx: { texts: [], particles: [], flashes: [], shake: 0, beams: [], trails: [] },
  myName() { return ($('#nameInput').value.trim() || 'Player').slice(0, 12); },
};

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  App.screen = id;
  if (id === 'game') { resize(); requestAnimationFrame(resize); }
}

// ---------- 메뉴 ----------
$('#nameInput').value = store('t8name') || ('플레이어' + Math.floor(Math.random() * 900 + 100));
$('#nameInput').addEventListener('change', () => store('t8name', App.myName()));
const params = new URLSearchParams(location.search);
const pathRoom = location.pathname.match(/^\/r\/([A-Za-z0-9]{5})/);
const inviteCode = (params.get('room') || (pathRoom && pathRoom[1]) || '').toUpperCase();
if (inviteCode) { $('#codeInput').value = inviteCode; App.pendingJoin = inviteCode; }

$('#btnSolo').onclick = () => { Sound.init(); startSolo(); };
$('#btnCreate').onclick = () => {
  Sound.init(); store('t8name', App.myName());
  if (!Net.connected) return toast('서버에 연결되지 않았습니다');
  Net.send({ t: 'create', name: App.myName() });
};
$('#btnJoin').onclick = () => {
  Sound.init(); store('t8name', App.myName());
  const code = $('#codeInput').value.trim().toUpperCase();
  if (code.length !== 5) return toast('5자리 방 코드를 입력하세요');
  if (!Net.connected) return toast('서버에 연결되지 않았습니다');
  Net.send({ t: 'join', code, name: App.myName() });
};
$('#codeInput').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

// ---------- 로비 ----------
const AVATAR = ['#29d8f0', '#f7d63b', '#a64df0', '#4fe06a', '#f04a4a', '#3b6cf7', '#f79b2e', '#ff7ad9'];
function avatarColor(id) { return AVATAR[id % AVATAR.length]; }

function renderLobby() {
  const r = App.roomInfo; if (!r) return;
  $('#roomCode').textContent = r.code;
  $('#playerCount').textContent = r.players.length;
  const ul = $('#playerList'); ul.innerHTML = '';
  for (const p of r.players) {
    const li = document.createElement('li');
    if (p.id === Net.id) li.classList.add('me');
    li.innerHTML = `<div class="av" style="background:${avatarColor(p.id)}"></div><div class="nm"></div>` +
      (p.id === r.host ? '<span class="tag host">방장</span>' : p.ready ? '<span class="tag rdy">준비</span>' : '');
    li.querySelector('.nm').textContent = p.name;
    if (p.wins) { const sm = document.createElement('small'); sm.textContent = `🏆 ${p.wins}승`; li.querySelector('.nm').appendChild(sm); }
    ul.appendChild(li);
  }
  for (let i = r.players.length; i < 8; i++) {
    const li = document.createElement('li'); li.className = 'empty'; li.textContent = '빈 자리'; ul.appendChild(li);
  }
  const isHost = r.host === Net.id;
  const me = r.players.find(p => p.id === Net.id);
  $('#btnStart').style.display = isHost ? '' : 'none';
  $('#btnReady').style.display = isHost ? 'none' : '';
  $('#btnReady').textContent = me && me.ready ? '준비 취소' : '준비';
  $('#btnReady').classList.toggle('primary', !(me && me.ready));
  const others = r.players.filter(p => p.id !== r.host);
  const allReady = others.every(p => p.ready);
  $('#lobbyHint').textContent = isHost
    ? (r.players.length < 2 ? '친구를 초대하세요 · 혼자서도 시작할 수 있어요' : allReady ? '모두 준비 완료! 게임을 시작하세요' : `준비 대기 중 (${others.filter(p => p.ready).length}/${others.length})`)
    : '방장이 게임을 시작하길 기다리는 중…';
}
function inviteUrl() { return `${location.origin}/r/${App.roomInfo.code}`; }
$('#btnInvite').onclick = async () => {
  const url = inviteUrl();
  const text = `${App.myName()}님이 테트리스 대전에 초대했어요! 방 코드: ${App.roomInfo.code}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Tetris Royale 8', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('초대 링크가 복사되었습니다 📋'); }
  catch { prompt('초대 링크를 복사하세요', url); }
};
$('#btnLeave').onclick = () => { Net.send({ t: 'leave' }); App.roomInfo = null; show('menu'); history.replaceState(null, '', '/'); };
$('#btnReady').onclick = () => { const me = App.roomInfo.players.find(p => p.id === Net.id); Net.send({ t: 'ready', v: !(me && me.ready) }); };
$('#btnStart').onclick = () => { Sound.init(); Net.send({ t: 'start' }); };
function syncTargetUI() {
  document.querySelectorAll('#targetModes button').forEach(b => b.classList.toggle('on', b.dataset.m === App.targetMode));
  $('#btnTarget').textContent = '🎯 ' + TARGET_NAMES[App.targetMode];
}
document.querySelectorAll('#targetModes button').forEach(b => b.onclick = () => { App.targetMode = b.dataset.m; store('t8target', App.targetMode); syncTargetUI(); });
syncTargetUI();

// ---------- 네트워크 핸들러 ----------
Net.on('open', () => {
  if (App.pendingJoin) { const c = App.pendingJoin; App.pendingJoin = null; Net.send({ t: 'join', code: c, name: App.myName() }); }
});
Net.on('hello', m => { Net.id = m.id; });
Net.on('error', m => toast(m.msg));
Net.on('disconnect', () => {
  toast('서버 연결이 끊어졌습니다');
  if (App.mode === 'multi') { App.game = null; hideOverlay(); show('menu'); }
});
Net.on('room', m => {
  App.roomInfo = m; App.host = m.host; Net.room = m.code;
  if (App.screen === 'menu') { show('lobby'); history.replaceState(null, '', '/r/' + m.code); }
  for (const p of m.players) {
    const o = App.opponents.get(p.id); if (o) o.name = p.name;
  }
  renderLobby();
  if (App.screen === 'game' && App.results) renderResults();
});
Net.on('start', m => {
  App.mode = 'multi';
  App.opponents.clear();
  for (const p of m.players) if (p.id !== Net.id) App.opponents.set(p.id, { id: p.id, name: p.name, board: '0'.repeat(200), alive: true, h: 0, g: 0, place: 0, flash: 0 });
  startGame(m.seed, !m.solo);
});
Net.on('board', m => { const o = App.opponents.get(m.id); if (o) { o.board = m.b; o.h = m.h; o.g = m.g; } });
Net.on('garbage', m => { if (App.game && !App.game.over) { App.game.addGarbage(m.n, m.from); App.fx.shake = 6; } });
Net.on('attackfx', m => {
  App.fx.beams.push({ from: m.from, to: m.to, n: m.n, t: 0 });
  const o = App.opponents.get(m.to); if (o) o.flash = 1;
  if (m.from === Net.id && App.game) App.game.lastTargetId = m.to; // 내 타겟 하이라이트
});
Net.on('dead', m => {
  const o = App.opponents.get(m.id);
  if (o) { o.alive = false; o.place = m.place; o.flash = 1; }
  if (m.by === Net.id && m.id !== Net.id) { /* ko 메시지에서 처리 */ }
});
Net.on('ko', m => {
  if (!App.game) return;
  App.game.kos++;
  const o = App.opponents.get(m.victim);
  pushText('K.O.! ' + (o ? o.name : ''), '#ff4d6d', true);
  Sound.ko(); vibrate([50, 40, 80]);
});
Net.on('left', m => { const o = App.opponents.get(m.id); if (o && App.game) { o.alive = false; o.left = true; } });
Net.on('end', m => {
  App.results = m;
  if (App.game) App.game.over = true;
  if (m.winner === Net.id) { Sound.win(); }
  Sound.stopMusic();
  setTimeout(renderResults, m.winner === Net.id ? 600 : 0);
});

// ===================== 게임 시작/종료 =====================
function startSolo() {
  App.mode = 'solo'; App.opponents.clear();
  startGame(Math.floor(Math.random() * 2 ** 31), false);
}
function startGame(seed, multi) {
  App.results = null; App.paused = false;
  App.fx = { texts: [], particles: [], flashes: [], shake: 0, beams: [], trails: [] };
  App.game = new Game(seed, { multi, id: Net.id || 0 });
  App.game.online = App.mode === 'multi';
  App.countdown = 3000;
  $('#btnTarget').style.display = multi ? '' : 'none';
  $('#btnPause').style.display = App.mode === 'solo' ? '' : 'none';
  $('#btnSound').textContent = settings.sound ? '🔊' : '🔇';
  show('game'); hideOverlay();
  showCountdown(3);
  lastBoardSent = 0;
}
function showCountdown(n) {
  const ov = $('#overlay'); ov.classList.remove('hidden');
  ov.style.background = 'transparent'; ov.style.backdropFilter = 'none'; ov.style.pointerEvents = 'none';
  ov.innerHTML = `<div class="big">${n || 'GO!'}</div>`;
  Sound.count(!n);
}
function hideOverlay() {
  const ov = $('#overlay'); ov.classList.add('hidden'); ov.innerHTML = '';
  ov.style.background = ''; ov.style.backdropFilter = ''; ov.style.pointerEvents = '';
}
function fmtTime(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function statsHTML(g) {
  return `<div class="stat-grid">
    <div><small>점수</small><b>${g.score.toLocaleString()}</b></div><div><small>라인</small><b>${g.lines}</b></div>
    <div><small>레벨</small><b>${g.level}</b></div><div><small>시간</small><b>${fmtTime(g.time)}</b></div>
    <div><small>테트리스</small><b>${g.tetrises}</b></div><div><small>T-스핀</small><b>${g.tspins}</b></div>
    ${App.mode === 'multi' ? `<div><small>공격</small><b>${g.attackSent}</b></div><div><small>K.O.</small><b>${g.kos}</b></div>` : `<div><small>PPS</small><b>${(g.pieces / Math.max(1, g.time / 1000)).toFixed(2)}</b></div><div><small>최고점</small><b>${Number(store('t8best') || 0).toLocaleString()}</b></div>`}
  </div>`;
}
function onGameOver() {
  const g = App.game;
  Sound.stopMusic(); Sound.over(); vibrate([80, 50, 120]);
  if (App.mode === 'solo') {
    const best = Number(store('t8best') || 0), nb = g.score > best;
    if (nb) store('t8best', g.score);
    setTimeout(() => {
      const ov = $('#overlay'); ov.classList.remove('hidden');
      ov.innerHTML = `<h2>GAME OVER</h2>${nb ? '<p style="color:#f7d63b;font-weight:800">🎉 신기록!</p>' : ''}${statsHTML(g)}
        <button class="btn primary" id="ovRetry">다시 하기</button><button class="btn" id="ovMenu">메뉴로</button>`;
      $('#ovRetry').onclick = startSolo;
      $('#ovMenu').onclick = () => { App.game = null; hideOverlay(); show('menu'); };
    }, 700);
  } else {
    Net.send({ t: 'dead', by: g.lastAttacker, lines: g.lines });
    setTimeout(() => {
      if (App.results) return;
      const ov = $('#overlay'); ov.classList.remove('hidden');
      ov.innerHTML = `<h2>K.O.</h2><p style="color:#9aa3d6">다른 플레이어들의 경기를 관전 중…</p>${statsHTML(g)}`;
      ov.style.background = '#0b0d1f99';
      ov.style.pointerEvents = 'none';
    }, 600);
  }
}
function renderResults() {
  const m = App.results; if (!m) return;
  const ov = $('#overlay'); ov.classList.remove('hidden'); ov.style.background = ''; ov.style.pointerEvents = '';
  const win = m.winner === Net.id;
  const isHost = App.roomInfo && App.roomInfo.host === Net.id;
  const me = App.roomInfo && App.roomInfo.players.find(p => p.id === Net.id);
  const rows = m.results.map(r => `<li class="${r.id === Net.id ? 'me' : ''}"><span class="pl">${r.place}</span><span class="nm">${escapeHTML(r.name)}</span><span class="st">KO ${r.kos} · ${r.lines}L</span></li>`).join('');
  ov.innerHTML = `<h2 style="color:${win ? '#f7d63b' : '#fff'}">${win ? '🏆 승리!' : m.results.length === 1 ? '게임 종료' : '경기 종료'}</h2>
    <ul class="results">${rows}</ul>
    ${App.game ? statsHTML(App.game) : ''}
    ${isHost ? '<button class="btn primary" id="ovAgain">다시 시작</button>' : `<button class="btn ${me && me.ready ? '' : 'primary'}" id="ovReady">${me && me.ready ? '준비 취소' : '다시 하기 (준비)'}</button>`}
    <button class="btn" id="ovLobby">로비로</button>`;
  if (isHost) $('#ovAgain').onclick = () => Net.send({ t: 'start' });
  else $('#ovReady').onclick = () => Net.send({ t: 'ready', v: !(me && me.ready) });
  $('#ovLobby').onclick = () => { App.game = null; App.results = null; hideOverlay(); show('lobby'); renderLobby(); };
}
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ===================== 게임 버튼 =====================
function bindBtn(sel, fn) {
  const el = $(sel);
  el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
  el.addEventListener('mousedown', e => { e.preventDefault(); fn(); });
}
function canPlay() { const g = App.game; return g && !g.over && !App.paused && App.countdown <= 0; }
bindBtn('#btnHold', () => { if (canPlay()) App.game.doHold(); });
bindBtn('#btnRot', () => { if (canPlay()) App.game.rotate(1); });
// 십자키: 좌우는 누르고 있으면 자동 반복(DAS), 아래는 누르는 동안 소프트드롭, 위는 하드드롭
function bindPad(sel, down, up) {
  const el = $(sel);
  const start = e => { e.preventDefault(); el.classList.add('on'); Sound.init(); if (canPlay()) down(); };
  const end = e => { e.preventDefault(); if (!el.classList.contains('on')) return; el.classList.remove('on'); if (up) up(); };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('pointerleave', end);
  el.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
}
bindPad('#dLeft', () => { App.game.move(-1); das = { dir: -1, t: 0, arr: 0 }; }, () => { if (das.dir === -1) das.dir = 0; });
bindPad('#dRight', () => { App.game.move(1); das = { dir: 1, t: 0, arr: 0 }; }, () => { if (das.dir === 1) das.dir = 0; });
bindPad('#dDown', () => { App.game.softDrop = true; }, () => { if (App.game) App.game.softDrop = false; });
bindPad('#dUp', () => App.game.hardDrop());
bindBtn('#btnTarget', () => {
  const ks = Object.keys(TARGET_NAMES); App.targetMode = ks[(ks.indexOf(App.targetMode) + 1) % ks.length];
  store('t8target', App.targetMode); syncTargetUI(); toast('공격 타겟: ' + TARGET_NAMES[App.targetMode], 1000);
});
bindBtn('#btnSound', () => {
  Sound.init(); Sound.setOn(!settings.sound); $('#btnSound').textContent = settings.sound ? '🔊' : '🔇';
  if (settings.sound && canPlay()) Sound.startMusic();
});
bindBtn('#btnPause', () => { if (App.mode === 'solo' && App.game && !App.game.over && App.countdown <= 0) togglePause(); });
function togglePause() {
  App.paused = !App.paused;
  if (App.paused) {
    Sound.stopMusic();
    const ov = $('#overlay'); ov.classList.remove('hidden');
    ov.innerHTML = `<h2>일시정지</h2><button class="btn primary" id="ovResume">계속하기</button><button class="btn" id="ovRestart">다시 시작</button><button class="btn" id="ovQuit">메뉴로</button>`;
    $('#ovResume').onclick = togglePause;
    $('#ovRestart').onclick = startSolo;
    $('#ovQuit').onclick = () => { App.game = null; App.paused = false; hideOverlay(); show('menu'); };
  } else { hideOverlay(); if (settings.sound) Sound.startMusic(); }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && App.mode === 'solo' && App.screen === 'game' && canPlay()) togglePause();
});

// ===================== 터치 컨트롤 =====================
const touch = { id: null, x0: 0, y0: 0, t0: 0, lastX: 0, lastY: 0, moved: false, dropped: false, axis: null, samples: [] };
const mainCv = $('#main'), oppCv = $('#opp');
function cellPx() { return Math.max(18, layout.cell * 0.85); }

function holdHit(x, y) {
  const h = layout.holdBox; return h && x >= h.x - 6 && x <= h.x + h.w + 6 && y >= h.y - 6 && y <= h.y + h.h + 6;
}
mainCv.addEventListener('touchstart', e => {
  e.preventDefault(); Sound.init();
  if (!canPlay()) return;
  const t = e.changedTouches[0];
  const r = mainCv.getBoundingClientRect();
  if (holdHit(t.clientX - r.left, t.clientY - r.top)) { App.game.doHold(); return; }
  if (touch.id !== null) { // 두번째 손가락 = 반시계 회전
    App.game.rotate(-1); return;
  }
  Object.assign(touch, { id: t.identifier, x0: t.clientX, y0: t.clientY, t0: performance.now(), lastX: t.clientX, lastY: t.clientY, moved: false, dropped: false, axis: null, samples: [[t.clientX, t.clientY, performance.now()]] });
}, { passive: false });

mainCv.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!canPlay()) return;
  const t = [...e.changedTouches].find(t => t.identifier === touch.id); if (!t || touch.dropped) return;
  const g = App.game, cp = cellPx(), now = performance.now();
  touch.samples.push([t.clientX, t.clientY, now]);
  while (touch.samples.length > 2 && now - touch.samples[0][2] > 100) touch.samples.shift();
  const dx = t.clientX - touch.x0, dy = t.clientY - touch.y0;
  if (!touch.axis && Math.hypot(dx, dy) > 12) {
    touch.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : (dy < 0 ? 'up' : 'down');
  }
  if (Math.hypot(dx, dy) > 10) touch.moved = true;
  // 위로 빠른 스와이프 = 하드드롭
  const s0 = touch.samples[0], vy = (t.clientY - s0[1]) / Math.max(1, now - s0[2]);
  if (touch.axis === 'up' && (dy < -cp * 1.6 || vy < -0.9) && dy < -24) { touch.dropped = true; g.hardDrop(); return; }
  // 좌우 이동 (손가락을 따라감)
  if (touch.axis === 'h' || (touch.axis === 'down' && Math.abs(t.clientX - touch.lastX) > cp * 1.2)) {
    let mx = t.clientX - touch.lastX;
    while (mx >= cp) { g.move(1); touch.lastX += cp; mx -= cp; }
    while (mx <= -cp) { g.move(-1); touch.lastX -= cp; mx += cp; }
    // 좌우 이동 중 아래로 많이 내리면 소프트드롭으로 전환
    if (touch.axis === 'h' && t.clientY - touch.lastY > cp * 2.2 && Math.abs(dy) > Math.abs(dx) * 0.8) touch.axis = 'down';
  }
  // 아래 드래그 = 빠르게 내리기 (드래그 거리만큼 내려감)
  if (touch.axis === 'down') {
    let my = t.clientY - touch.lastY; const step = cp * 0.7;
    while (my >= step) { if (g.softStep()) Sound.soft(); touch.lastY += step; my -= step; }
    g.softDrop = true;
  }
}, { passive: false });

function endTouch(e) {
  e.preventDefault();
  const t = [...e.changedTouches].find(t => t.identifier === touch.id); if (!t) return;
  const dt = performance.now() - touch.t0;
  if (App.game) App.game.softDrop = false;
  if (canPlay() && !touch.dropped) {
    const dx = t.clientX - touch.x0, dy = t.clientY - touch.y0;
    if (!touch.moved && dt < 300) App.game.rotate(1); // 탭 = 시계방향 회전
    else if (dy < -40 && Math.abs(dy) > Math.abs(dx) * 1.3 && dt < 350) App.game.hardDrop(); // 짧은 플릭
  }
  touch.id = null;
}
mainCv.addEventListener('touchend', endTouch, { passive: false });
mainCv.addEventListener('touchcancel', endTouch, { passive: false });

// 마우스 (데스크탑 테스트용) — 클릭 회전
mainCv.addEventListener('mousedown', e => { Sound.init(); if (canPlay()) { const r = mainCv.getBoundingClientRect(); if (holdHit(e.clientX - r.left, e.clientY - r.top)) App.game.doHold(); else App.game.rotate(1); } });

// 키보드 (DAS/ARR)
const keys = {}; let das = { dir: 0, t: 0 };
window.addEventListener('keydown', e => {
  if (App.screen !== 'game' || e.target.tagName === 'INPUT') return;
  Sound.init();
  if (e.repeat) { e.preventDefault(); return; }
  keys[e.code] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (App.mode === 'solo' && App.game && !App.game.over) togglePause(); return; }
  if (!canPlay()) return;
  const g = App.game;
  switch (e.code) {
    case 'ArrowLeft': g.move(-1); das = { dir: -1, t: 0, arr: 0 }; break;
    case 'ArrowRight': g.move(1); das = { dir: 1, t: 0, arr: 0 }; break;
    case 'ArrowDown': g.softDrop = true; break;
    case 'ArrowUp': case 'KeyX': g.rotate(1); break;
    case 'KeyZ': case 'ControlLeft': g.rotate(-1); break;
    case 'Space': g.hardDrop(); break;
    case 'KeyC': case 'ShiftLeft': g.doHold(); break;
    default: return;
  }
  e.preventDefault();
});
window.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'ArrowDown' && App.game) App.game.softDrop = false;
  if ((e.code === 'ArrowLeft' && das.dir === -1) || (e.code === 'ArrowRight' && das.dir === 1)) {
    das.dir = keys.ArrowLeft ? -1 : keys.ArrowRight ? 1 : 0; das.t = 0;
  }
});

// ===================== 렌더링 =====================
const ctx = mainCv.getContext('2d'), octx = oppCv.getContext('2d');
let DPR = 1;
const layout = { cell: 20, bx: 0, by: 0, W: 0, H: 0, holdBox: null };

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  const vw = window.innerWidth;
  const nOpp = App.opponents.size;
  // 상단 상대 보드 영역
  let oppH = 0;
  if (nOpp) {
    const cols = Math.min(nOpp, 7);
    const mw = Math.min(64, (vw - 16 - (cols - 1) * 6) / cols);
    oppH = Math.round(mw * 2 + 22);
  }
  oppCv.style.height = oppH + 'px'; oppCv.style.display = nOpp ? 'block' : 'none';
  oppCv.width = vw * DPR; oppCv.height = oppH * DPR;
  const rect = mainCv.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  mainCv.width = W * DPR; mainCv.height = H * DPR;
  const cell = Math.floor(Math.min((W - 24) / 19.6, (H - 16) / VIS) * 2) / 2;
  layout.cell = cell; layout.W = W; layout.H = H;
  layout.bx = Math.round((W - cell * COLS) / 2 + cell * 0.15);
  layout.by = Math.round((H - cell * VIS) / 2);
  const side = cell * 4.1;
  layout.holdBox = { x: layout.bx - cell * 0.6 - side - 6, y: layout.by, w: side, h: cell * 3.2 };
  layout.nextX = layout.bx + cell * COLS + 8;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = (n >> 8 & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}
const blockCache = new Map();
function blockSprite(color, size) {
  const key = color + size;
  if (blockCache.has(key)) return blockCache.get(key);
  const c = document.createElement('canvas'), s = Math.ceil(size * DPR);
  c.width = c.height = s;
  const x = c.getContext('2d'), b = Math.max(1, s * 0.12);
  x.fillStyle = color; x.fillRect(0, 0, s, s);
  x.fillStyle = shade(color, 70); x.beginPath(); x.moveTo(0, 0); x.lineTo(s, 0); x.lineTo(s - b, b); x.lineTo(b, b); x.lineTo(b, s - b); x.lineTo(0, s); x.fill();
  x.fillStyle = shade(color, -70); x.beginPath(); x.moveTo(s, s); x.lineTo(0, s); x.lineTo(b, s - b); x.lineTo(s - b, s - b); x.lineTo(s - b, b); x.lineTo(s, 0); x.fill();
  const gr = x.createLinearGradient(0, b, 0, s - b); gr.addColorStop(0, shade(color, 25)); gr.addColorStop(1, shade(color, -15));
  x.fillStyle = gr; x.fillRect(b, b, s - 2 * b, s - 2 * b);
  x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(b * 1.6, b * 1.6, s * 0.22, s * 0.12);
  blockCache.set(key, c);
  return c;
}
function drawBlock(c, x, y, size, color, alpha = 1) {
  c.globalAlpha = alpha;
  c.drawImage(blockSprite(color, size), x, y, size, size);
  c.globalAlpha = 1;
}
function drawPiece(c, type, cx, cy, size, alpha = 1) { // 중앙 정렬 미리보기
  const s = ROT[type][0];
  let minX = 9, maxX = -1, minY = 9, maxY = -1;
  s.forEach((row, y) => row.forEach((v, x) => { if (v) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); } }));
  const w = (maxX - minX + 1) * size, h = (maxY - minY + 1) * size;
  const col = COLORS[TYPES.indexOf(type) + 1];
  s.forEach((row, y) => row.forEach((v, x) => { if (v) drawBlock(c, cx - w / 2 + (x - minX) * size, cy - h / 2 + (y - minY) * size, size, alpha < 1 ? '#555a77' : col, 1); }));
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
function panel(c, x, y, w, h, title) {
  c.fillStyle = 'rgba(14,18,48,0.85)'; roundRect(c, x, y, w, h, 10); c.fill();
  c.strokeStyle = 'rgba(107,132,255,0.35)'; c.lineWidth = 1.5; c.stroke();
  if (title) { c.fillStyle = '#9aa3d6'; c.font = `800 ${Math.max(10, layout.cell * 0.5)}px system-ui`; c.textAlign = 'center'; c.fillText(title, x + w / 2, y - 6); }
}
function pushText(s, color = '#fff', big = false) {
  App.fx.texts.push({ s, color, big, t: 0 });
  if (App.fx.texts.length > 4) App.fx.texts.shift();
}

function render(dt) {
  const g = App.game; if (!g) return;
  const { cell, bx, by, W, H } = layout;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const fx = App.fx;
  let sx = 0, sy = 0;
  if (fx.shake > 0) { sx = (Math.random() - 0.5) * fx.shake; sy = (Math.random() - 0.5) * fx.shake; fx.shake = Math.max(0, fx.shake - dt * 0.03); }
  ctx.translate(sx, sy);

  // 보드 배경
  const bw = cell * COLS, bh = cell * VIS;
  const height = g.height();
  const danger = height > 15 && !g.over;
  ctx.fillStyle = danger ? `rgba(60,10,20,${0.85 + 0.1 * Math.sin(performance.now() / 150)})` : 'rgba(8,10,30,0.92)';
  ctx.shadowColor = danger ? '#f04a4a' : '#4b6bff'; ctx.shadowBlur = 24;
  roundRect(ctx, bx - 4, by - 4, bw + 8, bh + 8, 8); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = danger ? '#f04a4a' : 'rgba(107,132,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < COLS; x++) { ctx.moveTo(bx + x * cell + 0.5, by); ctx.lineTo(bx + x * cell + 0.5, by + bh); }
  for (let y = 1; y < VIS; y++) { ctx.moveTo(bx, by + y * cell + 0.5); ctx.lineTo(bx + bw, by + y * cell + 0.5); }
  ctx.stroke();

  // 고정 블록
  for (let y = HIDDEN - 1; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const v = g.board[y][x];
    if (v) drawBlock(ctx, bx + x * cell, by + (y - HIDDEN) * cell, cell, g.over ? '#3a3f5c' : COLORS[v], y < HIDDEN ? 0.5 : 1);
  }
  // 하드드롭 잔상
  for (const tr of fx.trails) {
    tr.t += dt; const a = 1 - tr.t / 220; if (a <= 0) continue;
    const s = ROT[tr.type][tr.rot], col = COLORS[TYPES.indexOf(tr.type) + 1];
    const grad = ctx.createLinearGradient(0, by + (tr.y0 - HIDDEN) * cell, 0, by + (tr.y1 - HIDDEN) * cell);
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(1, col);
    ctx.globalAlpha = a * 0.5; ctx.fillStyle = grad;
    for (let c = 0; c < s.length; c++) {
      let top = -1; for (let r = 0; r < s.length; r++) if (s[r][c]) { top = r; break; }
      if (top < 0) continue;
      ctx.fillRect(bx + (tr.x + c) * cell + 2, by + (tr.y0 + top - HIDDEN) * cell, cell - 4, (tr.y1 - tr.y0) * cell);
    }
    ctx.globalAlpha = 1;
  }
  fx.trails = fx.trails.filter(t => t.t < 220);

  if (!g.over) {
    const c = g.cur, s = ROT[c.type][c.rot], col = COLORS[TYPES.indexOf(c.type) + 1];
    // 고스트
    const gy = g.ghostY();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = 0.55;
    for (let r = 0; r < s.length; r++) for (let x = 0; x < s.length; x++) if (s[r][x] && gy + r >= HIDDEN) {
      ctx.fillStyle = col; ctx.globalAlpha = 0.14; ctx.fillRect(bx + (c.x + x) * cell + 1, by + (gy + r - HIDDEN) * cell + 1, cell - 2, cell - 2);
      ctx.globalAlpha = 0.6; ctx.strokeRect(bx + (c.x + x) * cell + 2, by + (gy + r - HIDDEN) * cell + 2, cell - 4, cell - 4);
    }
    ctx.globalAlpha = 1;
    // 현재 블럭 (락 진행시 살짝 어둡게)
    const lockA = g.onGround() ? 1 - Math.min(1, g.lockTimer / LOCK_DELAY) * 0.35 : 1;
    for (let r = 0; r < s.length; r++) for (let x = 0; x < s.length; x++) if (s[r][x] && c.y + r >= HIDDEN - 1) {
      drawBlock(ctx, bx + (c.x + x) * cell, by + (c.y + r - HIDDEN) * cell, cell, col, c.y + r < HIDDEN ? 0.5 * lockA : lockA);
    }
  }
  // 상단 숨김영역 가리기 (보드 위로 살짝 보이는 부분)
  ctx.save(); ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 4, 0, bw + 8, by - 4);
  ctx.restore();

  // 라인 클리어 플래시
  for (const f of fx.flashes) {
    f.t += dt; const a = 1 - f.t / 300; if (a <= 0) continue;
    ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
    const ex = (1 - a) * bw * 0.15;
    ctx.fillRect(bx - ex, by + (f.y - HIDDEN) * cell + cell * (1 - a) / 2, bw + ex * 2, cell * a);
  }
  fx.flashes = fx.flashes.filter(f => f.t < 300);

  // 가비지 미터
  const pend = g.pendingGarbage();
  const mx = bx - cell * 0.55 - 4, mw = cell * 0.4;
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(mx, by, mw, bh);
  if (pend) {
    const ph = Math.min(VIS, pend) * cell;
    ctx.fillStyle = pend >= 8 ? '#ff2d55' : pend >= 4 ? '#ff8a3d' : '#ffd23d';
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(performance.now() / 90);
    ctx.fillRect(mx, by + bh - ph, mw, ph);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    for (let i = 1; i < Math.min(VIS, pend); i++) { ctx.beginPath(); ctx.moveTo(mx, by + bh - i * cell); ctx.lineTo(mx + mw, by + bh - i * cell); ctx.stroke(); }
  }

  // HOLD
  const hb = layout.holdBox;
  panel(ctx, hb.x, hb.y + cell * 0.7, hb.w, hb.h, 'HOLD');
  if (g.hold) drawPiece(ctx, g.hold, hb.x + hb.w / 2, hb.y + cell * 0.7 + hb.h / 2, cell * 0.8, g.canHold ? 1 : 0.4);

  // 스탯
  const stX = hb.x + hb.w / 2;
  let stY = hb.y + cell * 0.7 + hb.h + cell * 1.2;
  ctx.textAlign = 'center';
  const stat = (label, val, color = '#fff') => {
    ctx.fillStyle = '#7a84c0'; ctx.font = `700 ${cell * 0.45}px system-ui`; ctx.fillText(label, stX, stY);
    ctx.fillStyle = color; ctx.font = `900 ${cell * 0.8}px system-ui`; ctx.fillText(val, stX, stY + cell * 0.85);
    stY += cell * 1.85;
  };
  if (App.mode === 'multi' && g.multi) {
    const alive = [...App.opponents.values()].filter(o => o.alive).length + (g.over ? 0 : 1);
    stat('생존', `${alive}/${App.opponents.size + 1}`, '#4fe06a');
    stat('K.O.', g.kos, '#ff4d6d');
    stat('공격', g.attackSent);
    stat('라인', g.lines);
    stat('레벨', g.level);
  } else {
    stat('점수', g.score > 99999 ? Math.floor(g.score / 1000) + 'K' : g.score);
    stat('라인', g.lines);
    stat('레벨', g.level);
    stat('시간', fmtTime(g.time));
  }

  // NEXT
  const nx = layout.nextX, nw = cell * 4.1;
  panel(ctx, nx, by + cell * 0.7, nw, cell * 13.6, 'NEXT');
  g.queue.slice(0, 5).forEach((t, i) => {
    const sz = i === 0 ? cell * 0.85 : cell * 0.68;
    const cy = i === 0 ? by + cell * 2.5 : by + cell * 2.7 + cell * 2.55 * i;
    drawPiece(ctx, t, nx + nw / 2, cy, sz);
  });
  // 콤보/B2B 상태 표시
  let iy = by + cell * 15.4;
  ctx.textAlign = 'center';
  if (g.b2b) { ctx.fillStyle = '#ff7ad9'; ctx.font = `900 ${cell * 0.55}px system-ui`; ctx.fillText('B2B', nx + nw / 2, iy); iy += cell * 0.9; }
  if (g.combo > 0) { ctx.fillStyle = '#4dd8ff'; ctx.font = `900 ${cell * 0.55}px system-ui`; ctx.fillText(g.combo + ' REN', nx + nw / 2, iy); iy += cell * 0.9; }
  if (App.mode === 'multi' && g.multi) {
    ctx.fillStyle = '#7a84c0'; ctx.font = `700 ${cell * 0.42}px system-ui`; ctx.fillText('TARGET', nx + nw / 2, by + bh - cell * 1.1);
    ctx.fillStyle = '#ffd23d'; ctx.font = `900 ${cell * 0.5}px system-ui`; ctx.fillText(TARGET_NAMES[App.targetMode], nx + nw / 2, by + bh - cell * 0.4);
  }

  // 파티클
  for (const p of fx.particles) {
    p.t += dt; p.vy += 0.0012 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const a = 1 - p.t / p.life; if (a <= 0) continue;
    ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.s, p.s);
  }
  ctx.globalAlpha = 1;
  fx.particles = fx.particles.filter(p => p.t < p.life);

  // 텍스트 팝업
  let ty = by + bh * 0.38;
  for (const t of fx.texts) {
    t.t += dt; const life = t.big ? 1500 : 1100;
    const a = Math.min(1, (life - t.t) / 300); if (a <= 0) continue;
    const sc = t.t < 120 ? 1.4 - t.t / 120 * 0.4 : 1;
    ctx.save();
    ctx.translate(bx + bw / 2, ty - t.t * 0.02);
    ctx.scale(sc, sc); ctx.globalAlpha = a;
    const fs = t.big ? cell * 1.05 : cell * 0.75;
    ctx.font = `900 ${fs}px system-ui`; ctx.textAlign = 'center';
    let w = ctx.measureText(t.s).width;
    if (w > bw * 0.98) { ctx.scale(bw * 0.98 / w, bw * 0.98 / w); }
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(t.s, 0, 0);
    ctx.fillStyle = t.color; ctx.shadowColor = t.color; ctx.shadowBlur = t.big ? 20 : 8; ctx.fillText(t.s, 0, 0);
    ctx.restore();
    ty += t.big ? cell * 1.3 : cell * 1;
  }
  fx.texts = fx.texts.filter(t => t.t < (t.big ? 1500 : 1100));

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function renderOpponents(dt) {
  const opps = [...App.opponents.values()];
  if (!opps.length) return;
  const vw = oppCv.width / DPR, vh = oppCv.height / DPR;
  octx.setTransform(DPR, 0, 0, DPR, 0, 0);
  octx.clearRect(0, 0, vw, vh);
  const cols = Math.min(opps.length, 7), gap = 6;
  const mw = Math.min(64, (vw - 16 - (cols - 1) * gap) / cols);
  const mc = mw / COLS, mh = mc * VIS;
  const total = cols * mw + (cols - 1) * gap;
  let x0 = (vw - total) / 2;
  const target = App.game && App.game.lastTargetId;
  opps.forEach((o, i) => {
    const x = x0 + i * (mw + gap), y = 2;
    o.pos = { x: x + mw / 2, y: y + mh / 2 };
    octx.fillStyle = 'rgba(8,10,30,0.9)'; octx.fillRect(x, y, mw, mh);
    for (let r = 0; r < VIS; r++) for (let c = 0; c < COLS; c++) {
      const v = +o.board[r * COLS + c];
      if (v) { octx.fillStyle = o.alive ? COLORS[v] : '#3a3f5c'; octx.fillRect(x + c * mc, y + r * mc, mc - 0.5, mc - 0.5); }
    }
    if (o.g && o.alive) { octx.fillStyle = '#ff2d55'; const gh = Math.min(VIS, o.g) * mc; octx.fillRect(x - 2.5, y + mh - gh, 2, gh); }
    if (o.flash > 0) { octx.fillStyle = `rgba(255,80,80,${o.flash * 0.5})`; octx.fillRect(x, y, mw, mh); o.flash = Math.max(0, o.flash - dt / 400); }
    octx.strokeStyle = target === o.id ? '#ffd23d' : o.h > 15 && o.alive ? '#f04a4a' : 'rgba(107,132,255,0.45)';
    octx.lineWidth = target === o.id ? 2 : 1; octx.strokeRect(x + 0.5, y + 0.5, mw - 1, mh - 1);
    if (!o.alive) {
      octx.fillStyle = 'rgba(0,0,0,0.55)'; octx.fillRect(x, y, mw, mh);
      octx.fillStyle = '#ff4d6d'; octx.font = `900 ${mw * 0.28}px system-ui`; octx.textAlign = 'center';
      octx.fillText(o.left ? 'OUT' : 'K.O.', x + mw / 2, y + mh / 2);
      if (o.place) { octx.fillStyle = '#fff'; octx.font = `800 ${mw * 0.22}px system-ui`; octx.fillText('#' + o.place, x + mw / 2, y + mh / 2 + mw * 0.3); }
    }
    octx.fillStyle = '#cfd6ff'; octx.font = `700 ${Math.max(9, Math.min(11, mw * 0.18))}px system-ui`; octx.textAlign = 'center';
    let nm = o.name; while (octx.measureText(nm).width > mw + gap - 2 && nm.length > 1) nm = nm.slice(0, -1);
    octx.fillText(nm, x + mw / 2, y + mh + 13);
  });
  // 공격 빔 (상대→상대)
  for (const b of App.fx.beams) {
    b.t += dt;
    const from = b.from === Net.id ? { x: vw / 2, y: vh + 30 } : App.opponents.get(b.from)?.pos;
    const to = b.to === Net.id ? { x: vw / 2, y: vh + 30 } : App.opponents.get(b.to)?.pos;
    if (!from || !to) continue;
    const p = Math.min(1, b.t / 350), a = 1 - Math.max(0, (b.t - 350) / 250);
    const px = from.x + (to.x - from.x) * p, py = from.y + (to.y - from.y) * p - Math.sin(p * Math.PI) * 25;
    octx.globalAlpha = Math.max(0, a);
    octx.fillStyle = b.to === Net.id ? '#ff2d55' : b.from === Net.id ? '#ffd23d' : '#ff8a3d';
    octx.beginPath(); octx.arc(px, py, 2 + Math.min(6, b.n), 0, Math.PI * 2); octx.fill();
    octx.globalAlpha = 1;
  }
  App.fx.beams = App.fx.beams.filter(b => b.t < 600);
}

// ===================== 이벤트 처리 =====================
let lastBoardSent = 0;
function handleEvents() {
  const g = App.game; if (!g) return;
  const { cell, bx, by } = layout;
  let boardDirty = false;
  for (const e of g.events) {
    switch (e.t) {
      case 'text': pushText(e.s, e.color, e.big); break;
      case 'hard': App.fx.trails.push({ ...e, t: 0 }); App.fx.shake = Math.max(App.fx.shake, 3); break;
      case 'clear':
        for (const y of e.rows) {
          App.fx.flashes.push({ y, t: 0 });
          for (let i = 0; i < 14; i++) App.fx.particles.push({
            x: bx + Math.random() * cell * COLS, y: by + (y - HIDDEN + 0.5) * cell,
            vx: (Math.random() - 0.5) * 0.5, vy: -Math.random() * 0.5 - 0.1, s: Math.random() * cell * 0.3 + 2,
            color: COLORS[1 + Math.floor(Math.random() * 7)], t: 0, life: 600 + Math.random() * 400,
          });
        }
        if (e.n >= 4) App.fx.shake = 10;
        break;
      case 'attack':
        if (App.mode === 'multi') {
          Net.send({ t: 'attack', n: e.n, mode: App.targetMode, lines: g.lines });
        }
        break;
      case 'garbageIn': App.fx.shake = 8; boardDirty = true; break;
      case 'locked': boardDirty = true; break;
      case 'over': boardDirty = true; onGameOver(); break;
    }
  }
  g.events.length = 0;
  if (App.mode === 'multi' && (boardDirty || performance.now() - lastBoardSent > 2000)) {
    lastBoardSent = performance.now();
    Net.send({ t: 'board', b: g.serialize(), h: g.height(), g: g.pendingGarbage() });
  }
}

// ===================== 메인 루프 =====================
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(50, now - lastT); lastT = now;
  if (App.screen === 'game' && App.game) {
    const g = App.game;
    if (App.countdown > 0) {
      const before = Math.ceil(App.countdown / 1000);
      App.countdown -= dt;
      const after = Math.ceil(App.countdown / 1000);
      if (App.countdown <= 0) { showCountdown(0); setTimeout(() => { if (App.countdown <= 0 && !App.paused && !(App.game && App.game.over)) hideOverlay(); }, 600); if (settings.sound) Sound.startMusic(); }
      else if (after !== before) showCountdown(after);
    } else if (!App.paused) {
      // 키보드 DAS
      if (das.dir) { das.t += dt; if (das.t >= 150) { das.arr = (das.arr || 0) + dt; while (das.arr >= 30) { g.move(das.dir); das.arr -= 30; } } }
      g.update(dt);
    }
    handleEvents();
    render(dt);
    renderOpponents(dt);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
Net.connect();
