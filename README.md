# Tetris Royale 8

최대 8인 실시간 온라인 대전 모바일 테트리스 (세로 모드).

## 실행
```
npm install
npm start        # http://localhost:3000
```
`PORT` 환경변수로 포트 변경. 휴대폰에서 접속하려면 서버를 공개 주소(예: Render, Fly.io, Railway)에 배포하세요.

## Cloudflare 배포 (Workers + Durable Objects)
Pages가 아니라 **Workers**로 만들어야 멀티플레이 서버가 동작합니다.
1. 대시보드 → Workers 및 Pages → 생성 → **Worker** 탭 → "리포지토리 가져오기(Import a repository)" → `tetris` 선택
2. 빌드 명령: 비워둠 · 배포 명령: `npx wrangler deploy` (기본값)
3. 배포 후 나오는 `https://tetris-royale-8.<계정>.workers.dev` 주소로 접속

CLI: `npx wrangler login && npm run deploy`

## 조작
| 동작 | 터치 | 키보드 |
|---|---|---|
| 시계방향 회전 | ⟳ 버튼 · 보드 탭 | ↑ / X |
| 반시계 회전 | 두 손가락 탭 | Z |
| 좌우 이동 | 십자키 ◀▶ (첫 입력 즉시 이동, 길게 누르면 연속) · 스와이프 | ← → |
| 하드 드롭 | 십자키 ▲ · 위로 스와이프 | Space |
| 소프트 드롭 | 십자키 ▼ (누르는 동안) · 아래 드래그 | ↓ |
| 홀드 | HOLD 칸 탭 / HOLD 버튼 | C / Shift |

## 기능
- 방 만들기 → 5자리 코드 / 초대 링크 (`/r/CODE`, 모바일 공유 시트)로 친구 초대, 최대 8명
- 모든 플레이어가 같은 7-bag 블럭 순서 (공정한 시드)
- SRS 회전·월킥, 고스트, 홀드, NEXT 5개, 락 딜레이(15회 리셋)
- T-스핀/미니, 콤보, Back-to-Back, 퍼펙트 클리어, 가비지 상쇄(상쇄량과 실제 전송량 표시)
- 공격 타겟: 랜덤 / KO노림 / 반격 / 강자 (테트리스 99 스타일), KO 카운트
- 시간에 따라 속도 증가, 순위 결과 화면, 다시하기
- 솔로 마라톤 모드 + 최고점 저장, 코로베이니키 BGM·효과음, 진동
