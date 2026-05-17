// 캐릭터 액션을 데이터로 정의한다. 코어 엔진은 ActionData 형식을 알 뿐,
// 캐릭터별 특성(발도술/그림자질주/벼락 등)은 모두 데이터로 표현된다.
//
// hitbox/hurtbox 좌표계: 캐릭터의 (x, y) = 발 중앙. y는 화면 좌표(아래로 +).
// hitbox.x는 facing-forward 기준(양수=전방). 충돌 검사 시 facing<0이면 좌우 미러링.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ActionData {
  name: string;
  windupFrames: number;       // 준비동작 (이 동안 캐릭터 정지)
  activeFrames: number;       // 히트박스 활성 (이 동안 dash 전진)
  recoveryFrames: number;     // 후딜 (취소 불가)
  dashSpeed: number;          // active 동안 전진 속도 (px/s, facing 곱해 적용)
  hitbox: Box;                // active 동안의 hitbox (facing-forward 기준)
}

// 회피. windup 없는 즉발 액션. frames 동안 i-frame + 입력 방향 이동.
// 캐릭터마다 거리/지속이 다를 수 있게 데이터 분리.
export interface DodgeData {
  name: string;
  frames: number;             // 회피 지속 (= i-frame 윈도우)
  speed: number;              // px/s (정규화된 dash 벡터에 곱함)
}

// 캐릭터 상태머신.
// idle: 자유 입력 가능. 그 외 상태는 액션 진행 중 — 입력 무시.
//
// dashDx/dashDy: attack press 시점의 (dirX, dirY)를 정규화한 단위 벡터.
// active 동안 (vx, vy) = (dashDx, dashDy) * action.dashSpeed로 이동하며 hitbox도 이 방향으로 회전.
// windup에 미리 저장해두어 active 시작 시 그대로 전달.
export type CharState =
  | { kind: 'idle' }
  | { kind: 'windup'; frame: number; action: ActionData; dashDx: number; dashDy: number }
  | { kind: 'active'; frame: number; action: ActionData; dashDx: number; dashDy: number; hitConfirmed: boolean }
  | { kind: 'recovery'; frame: number; action: ActionData }
  | { kind: 'dodge'; frame: number; data: DodgeData; dashDx: number; dashDy: number };

// 현재 캐릭터에는 i-frame 액션이 없음. 회피는 "빠른 이동"으로 hitbox 밖으로 빠져나가는 것 —
// 무적 시간 아님. 이 함수는 미래에 진짜 i-frame 액션이 추가되면 그쪽에서 true 반환.
export function isInvulnerable(_s: CharState): boolean {
  return false;
}

export const initialState = (): CharState => ({ kind: 'idle' });
