// Cloudflare Worker: 정적 파일은 Assets, WebSocket은 Durable Object 하나가 모든 방을 관리
import { DurableObject } from 'cloudflare:workers';
import lobby from '../lobby.js';

export class Lobby extends DurableObject {
  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const h = lobby.connect(server);
    server.addEventListener('message', e => h.message(e.data));
    server.addEventListener('close', () => h.close());
    server.addEventListener('error', () => h.close());
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(req, env) {
    if (req.headers.get('Upgrade') === 'websocket') {
      return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(req);
    }
    return env.ASSETS.fetch(req); // /r/CODE 등은 SPA 설정으로 index.html
  },
};
