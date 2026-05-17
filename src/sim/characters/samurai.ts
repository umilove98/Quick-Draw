import type { ActionData, DodgeData } from '../actions.js';
import { CHAR_H } from '../constants.js';

// 사무라이 발도술.
// 30f windup (0.5s) — 게임 디자인의 핵심 수치. 상대가 회피로 반응할 reaction window.
// 6f active — 짧고 강한 hit 윈도우.
// 14f recovery — 빗맞으면 punish 받을 후딜.
export const SAMURAI_IAIJUTSU: ActionData = {
  name: 'samurai-iaijutsu',
  windupFrames: 30,
  activeFrames: 6,
  recoveryFrames: 14,
  dashSpeed: 1750,
  // hitbox 좌표계: 캐릭터 상체 중앙(p.x, p.y - CHAR_H/2)이 origin.
  //
  // forward range = [-150, 0] — hitbox forward 끝이 origin에 위치.
  // active 끝 시점에 캐릭터가 dash로 origin까지 이동했으니, hitbox 끝 = 캐릭터 위치 일치.
  // (이전 [0, L]이면 dash 끝 후에도 hitbox가 캐릭터 앞으로 L만큼 튀어나감.)
  //
  // lateral h = CHAR_W (=48) — 캐릭터 너비와 동일.
  // 수직/대각 회전 시 좌우 폭이 캐릭터 폭을 넘지 않게.
  hitbox: {
    x: -150,                 // forward 시작 (origin 뒤쪽 150)
    y: -24,                  // 상체 중앙 위/아래 24
    w: 150,                  // forward 길이 → 끝점이 origin
    h: 48,
  },
};

// 회피 — 즉발, 거리는 공격 dash와 동일(175px), 속도는 1.5배(2625).
// frames=4 (67ms) * 2625/60 = 175px. 공격 6f * 1750/60 = 175px 와 일치.
// 회피는 i-frame 아니므로(memory: feedback_dodge_no_iframe) 거리/속도가 곧 회피의 본질.
export const SAMURAI_DODGE: DodgeData = {
  name: 'samurai-dodge',
  frames: 4,
  speed: 2625,
};
