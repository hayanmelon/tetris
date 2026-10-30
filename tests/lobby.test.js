const test = require('node:test');
const assert = require('node:assert/strict');
const lobby = require('../lobby');
function player() {
  const ws = { readyState: 1, messages: [], send(data) { this.messages.push(JSON.parse(data)); } };
  const connection = lobby.connect(ws);
  return { ws, message: m => connection.message(JSON.stringify(m)), latest: t => ws.messages.filter(m => m.t === t).at(-1) };
}

test('공격은 자신이 아닌 살아있는 상대에게만 전달되고 상한이 적용된다', () => {
  const a = player(), b = player();
  a.message({ t: 'create', name: 'A' });
  b.message({ t: 'join', code: a.latest('room').code, name: 'B' });
  a.message({ t: 'start' });
  a.message({ t: 'attack', n: 300, mode: 'random', lines: 4 });
  assert.equal(b.latest('garbage').n, 20);
  assert.equal(a.latest('garbage'), undefined);
  assert.equal(b.latest('attackfx').to, b.latest('room').players[1].id);
});

test('상대에게 공격을 보내지 않아도 보드 갱신으로 총 라인 수가 동기화된다', () => {
  const a = player(), b = player();
  a.message({ t: 'create', name: 'A' });
  b.message({ t: 'join', code: a.latest('room').code, name: 'B' });
  a.message({ t: 'start' });
  a.message({ t: 'board', b: '0'.repeat(200), h: 0, g: 0, lines: 7 });
  b.message({ t: 'dead', lines: 0 });
  const winner = a.latest('end').results[0];
  assert.equal(winner.name, 'A');
  assert.equal(winner.lines, 7);
});
