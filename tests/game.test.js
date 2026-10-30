const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// 실제 브라우저 게임 엔진 코드를 로드한다. 테스트용 공격 규칙 복제본은 두지 않는다.
const src = fs.readFileSync(path.join(__dirname, '../public/game.js'), 'utf8');
const engine = src.slice(0, src.indexOf('// ===================== 네트워크 ====================='));
const context = { navigator: {}, console };
vm.runInNewContext(engine + '\nglobalThis.TestGame = Game;', context);
const Game = context.TestGame;
const emptyBoard = () => Array.from({ length: 22 }, () => Array(10).fill(0));
function setupClear(g, count, keepOtherBlocks = true) {
  g.board = emptyBoard();
  // I 세로 블록이 한 줄씩 완성하는 형태: 연속한 4줄을 준비한다.
  for (let y = 22 - count; y < 22; y++) {
    g.board[y].fill(8);
    g.board[y][5] = 0;
  }
  if (keepOtherBlocks) g.board[10][0] = 8;
  g.cur = { type: 'I', rot: 1, x: 3, y: 18 };
  g.lastRotate = false;
  // count=4인 경우만 아래 네 줄을 모두 완성할 수 있다.
}
function setupTetris(g, keepOtherBlocks = true) {
  setupClear(g, 4, keepOtherBlocks);
}
function events(g, type) { return g.events.filter(e => e.t === type); }

test('테트리스 4줄은 4줄 공격, 연속 테트리스는 B2B 보너스 1줄', () => {
  const g = new Game(123, { multi: true });
  setupTetris(g);
  g.lock();
  assert.equal(g.lines, 4);
  assert.equal(g.attackSent, 4);
  assert.equal(events(g, 'attack')[0].n, 4);
  g.events.length = 0;
  setupTetris(g);
  g.lock();
  assert.equal(g.lines, 8);
  assert.equal(g.attackSent, 9);
  assert.equal(events(g, 'attack')[0].n, 5);
  assert.ok(g.b2b);
});

test('공격을 먼저 상쇄하고 남은 양만 전송한다', () => {
  const g = new Game(23, { multi: true });
  g.addGarbage(2, 44);
  setupTetris(g);
  g.lock();
  assert.equal(g.pendingGarbage(), 0);
  assert.equal(events(g, 'counter')[0].n, 2);
  assert.equal(events(g, 'attack')[0].n, 2);
  assert.equal(g.attackSent, 2);
  assert.equal(g.lastAttacker, null, '상쇄된 공격에 KO 공로를 주면 안 됨');
});

test('공격이 가비지를 모두 상쇄하지 못할 때 상대에게 전송하지 않는다', () => {
  const g = new Game(45, { multi: true });
  g.addGarbage(6, 42);
  setupTetris(g);
  g.lock();
  assert.equal(g.pendingGarbage(), 2);
  assert.equal(events(g, 'counter')[0].n, 4);
  assert.equal(events(g, 'attack').length, 0);
  assert.equal(g.attackSent, 0);
  assert.equal(g.lastAttacker, null);
  g.events.length = 0;
  g.board = emptyBoard();
  g.cur = { type: 'O', rot: 0, x: 4, y: 20 };
  g.lock();
  assert.equal(g.pendingGarbage(), 0);
  assert.equal(g.lastAttacker, 42, '실제로 보드에 들어온 가비지만 기록');
  assert.equal(events(g, 'garbageIn')[0].n, 2);
});

test('솔로 모드는 라인을 지워도 상대에게 공격을 보낸 것으로 표시하지 않는다', () => {
  const g = new Game(12);
  setupTetris(g);
  g.lock();
  assert.equal(g.lines, 4);
  assert.equal(g.attackSent, 0);
  assert.equal(events(g, 'attack').length, 0);
});

test('퍼펙트 클리어 공격은 10줄이고 잘못된 가비지는 무시한다', () => {
  const g = new Game(54, { multi: true });
  g.addGarbage(0, 1);
  g.addGarbage(-3, 1);
  assert.equal(g.pendingGarbage(), 0);
  setupTetris(g, false);
  g.lock();
  assert.equal(g.attackSent, 10);
});

test('떨어지는 중 자동 중력은 마지막 성공한 T회전 판정을 취소하지 않는다', () => {
  const g = new Game(3);
  g.cur = { type: 'T', rot: 0, x: 3, y: 5 };
  g.lastRotate = true;
  g.update(1000);
  assert.equal(g.lastRotate, true);
});

test('서로 떨어진 여러 줄 클리어도 사이에 낀 줄의 배치를 보존한다', () => {
  const g = new Game(5, { multi: true });
  g.board = emptyBoard();
  for (const y of [18, 20]) { g.board[y].fill(8); g.board[y][5] = 0; }
  g.board[19][0] = 2;
  g.cur = { type: 'I', rot: 1, x: 3, y: 18 };
  g.lock();
  assert.equal(g.lines, 2);
  assert.equal(g.board[20][0], 2);
});
