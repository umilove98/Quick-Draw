# Quick-Draw — 1v1 발도술 격투 게임

웹 기반 1대1 실시간 액션 격투 프로토타입. 0.5초 dash 공격 windup ↔ 즉발 회피의 합으로 심리전을 주고받는 게임. 사무라이의 발도술 — 한 방의 깨끗한 히트로 라운드가 끝난다.

**상태**: 프로토타입. 현재 M5(3선승 + AI) 완료, M6(game feel) 진행 예정.

---

## 빌드 / 실행

```
npm run dev      # Vite dev server, http://127.0.0.1:5173
npm run build    # tsc -b && vite build
npx tsc --noEmit # 타입체크만
npm test         # vitest (현재 sim/ 단위 테스트 없음, 추후 추가 예정)
```

---

## 디렉토리 구조

```
src/
  sim/        — 순수 시뮬레이션. Pixi/DOM/performance.now() 의존 절대 금지
    constants.ts          TICK_HZ, 물리 상수, 쿨다운 등 (게임 필 튜닝 진입점)
    actions.ts            ActionData/DodgeData/CharState 정의 (캐릭터 액션 데이터 형식)
    world.ts              Player, RoundState, step() — sim의 진입점
    collision.ts          OBB(hitbox) vs AABB(hurtbox) — SAT 알고리즘
    characters/samurai.ts 발도술 프레임 데이터 (windup/active/recovery, hitbox)
  input/      — 모든 입력 출처(키보드/마우스/AI/미래의 리모트)는 InputSnapshot 하나로 통일
    types.ts              InputSnapshot — 미래 롤백 넷코드의 wire format
    keyboard.ts           held/pressed(edge) 분리, blur 시 클리어
    mouse.ts              PointerEvent 기반
    sources.ts            LocalSource, KeyMap (P1/P2 기본 매핑)
  ai/agent.ts             AISource implements InputSource — 사람과 같은 파이프라인
  render/     — Pixi 렌더링. sim을 읽기만 함
    app.ts                Pixi 부트스트랩
    view.ts               캐릭터/스테이지/잔상 렌더
    debugOverlay.ts       F1 토글 — hitbox(OBB)/hurtbox(AABB)/state 라벨
  app/
    loop.ts               고정 타임스텝 + accumulator
    main.ts               와이어링 (HUD, F1/F2 핸들러)
```

**의존 방향**: `sim/`은 어떤 다른 디렉토리도 import 하지 않는다. `input/ai/render/app`은 `sim/`을 import 한다. 이 방향이 반대로 가면 결정론과 미래 롤백 넷코드가 깨진다.

---

## 핵심 아키텍처 원칙

### 1. 고정 타임스텝 (`TICK_HZ = 60`)
`requestAnimationFrame` + accumulator. 모니터 주사율과 무관하게 sim은 정확히 60Hz로 호출. 프레임 데이터는 이 값을 전제로 작성됨. 잉여 시간(`acc % DT_MS`)은 렌더 보간 `alpha`로만 쓰이고 sim에는 절대 안 돌려준다.

### 2. sim 순수성
`step(world, inputs)`는 입력만 받아 world를 변형. `Math.random()`/`Date.now()`/`performance.now()` 금지. AI는 자체 PRNG(mulberry32) 사용 — sim 외부.

### 3. 입력 추상화
`InputSnapshot`이 단일 형식. 키보드/마우스/AI/(미래의)리모트 모두 동일 구조 만들어 sim에 전달. sim 입장에선 누가 입력했는지 모름.

### 4. 액션 = 데이터
캐릭터 액션은 `ActionData`/`DodgeData` 리터럴로 정의. 새 캐릭터 추가 = `characters/<name>.ts` 추가 + (필요시) 새 `CharState` kind 1개. 코어 엔진 변경 없음.

---

## 게임 디자인 규칙 (변경 시 반드시 사용자 확인)

이 규칙들은 코드만 봐서는 자명하지 않은 **의도된 디자인**이다. 메모리(`MEMORY.md`) 참조.

- **액션 발동 시 캐릭터 정지**: windup 동안 `vx=0, vy=0`, 입력 무시. 발도술의 묵직한 끊김이 게임 필의 핵심. (`feedback_action_freeze`)
- **회피는 i-frame 아니다**: dodge는 빠른 이동만 제공, 무적 시간 없음. `isInvulnerable()`은 항상 false. 회피의 본질은 "거리/속도로 hitbox 밖으로 나가기". (`feedback_dodge_no_iframe`)
- **동시 hit = Double KO**: 같은 tick에 양쪽이 서로 맞추면 둘 다 +1, `winnerId=null`(무승부). `resolveHits()`가 2단계로 처리 — 1단계 모든 hit 평가 후 2단계 결과 결정. (`feedback_double_ko`)
- **공격 후 land 전엔 회피 불가**: `dodgeLockedUntilGround` 플래그. 공중 공격의 책임을 강제하는 룰.
- **쿨다운**: 공격 2초(120 tick), 회피 1초(60 tick). 게임 밸런스 핵심 수치.
- **비대칭 중력**: 낙하 시 `FALL_GRAVITY_MULT=1.7`. 격투/플랫포머 표준 트릭.

**타깃 모드**: P1 vs AI, P1 vs 원격 P2. 핫시트 인간 vs 인간은 타깃 아님 (P2 키매핑은 디버깅용으로만 유지). (`project_target_modes`)

---

## OBB hitbox 좌표계 (주의 요함)

`getActiveHitOBB()`의 회전 시스템은 미묘하다. 수정 전 반드시 이해할 것.

- **hitbox 정의**: `facing-forward` 기준. `forward = local +x`. 사무라이는 `x:-150, w:150` → forward 끝점이 origin.
- **회전 pivot**: `(p.x, p.y - CHAR_H/2)` — 캐릭터 **상체 중앙**. 발이 아니라.
- **회전각**: `cosF = dashDx * facing`, `sinF = dashDy`. dash 방향을 forward-frame으로 변환한 뒤 회전.
- **facing 미러**: 회전 후 corners와 axes 둘 다에 `x *= facing` 적용.
- **OBB 표현**: `corners[4]` + `axes[2]`. 회전 매트릭스만으로는 facing 미러를 깔끔히 못 합쳐서.
- **렌더**: `debugOverlay`는 `Graphics.poly(points)`로 4 corner 직접 그림.

수정 시 F1 디버그 오버레이로 모든 dash 방향(←, →, ↑, ↗, ↙ 등)에서 hitbox가 캐릭터 정중앙에서 뻗는지 시각 확인 필수.

---

## 디버깅

- **F1**: hitbox/hurtbox/state 라벨 토글. 격투게임 개발의 생명줄.
- **F2**: P2를 AI ↔ 키보드 토글 (디버깅용).
- **HUD**: fps/tps/tick, 라운드 점수, 각 플레이어 state/방향/쿨다운 표시.
- **공격 시 캐릭터 색 변화**: orange-red lerp. 상대가 회피로 반응할 reaction window의 시각 단서.

---

## 코드 컨벤션

- **TypeScript strict** + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`. 배열 인덱싱 시 `arr[i]!` 또는 분기 처리.
- **PixiJS v8 API**: `new Application()` 후 `await app.init()`. `Graphics`는 `.rect().fill()` / `.poly().stroke()` 체이닝.
- **주석**: 의도/제약/함정 위주. 코드가 *무엇*을 하는지 설명하는 주석은 쓰지 않음. 게임 디자인 규칙 코멘트는 보존할 것 (변경 시 의도 파악에 필요).
- **상태머신**: tagged union(`CharState`). switch가 `noFallthroughCasesInSwitch`로 강제됨.
- **태스크 도구**: 작업이 여러 단계로 쪼개지면 TodoWrite로 추적.

---

## 사용자 컨텍스트

- 한국어로 소통. 게임 디자인 의도가 한국어로 전달되니 메모리 노트도 한국어.
- 프로그래밍 경험은 있으나 **게임 개발은 처음**. 격투게임 컨벤션을 설명하면서 진행할 것 (예: "프레임 데이터", "i-frame", "hitstop" 등의 용어는 짧게 풀어 설명).
- 빠른 iteration 선호. 변경하면 HMR로 즉시 보고 피드백.
- **사용자의 디자인 결정을 우선**. 격투게임 일반 컨벤션과 달라도(예: dodge에 i-frame 없음) 그 결정을 따른다.

---

## 미래 계획 (Phase 2 이후)

코어 아키텍처가 분리돼 있어 나중에 끼워 넣어도 안 깨짐:

- **온라인 멀티 / 롤백 넷코드**: `RemoteInputSource` + `step()` 위에 롤백 래퍼.
- **추가 캐릭터**: 닌자(그림자 질주), 초능력자(벼락) — 새 `ActionData` + 필요시 새 state kind 1개.
- **에셋/애니메이션**: 박스 → `Sprite`.
- **PC 패키징**: Tauri로 감싸기 (~10MB 번들, 코드 변경 없음).
- **리플레이**: 시드 + `InputSnapshot` 배열 저장 → 결정론 sim으로 재현.

원본 계획서: `C:\Users\user\.claude\plans\sorted-honking-dawn.md`.
