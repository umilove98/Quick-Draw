import type { Box, CharState } from './actions.js';
import { CHAR_H, CHAR_W } from './constants.js';
import type { Player } from './world.js';

// hurtbox는 AABB(축 정렬), hitbox는 OBB(회전 + facing 미러).
// OBB는 corners + axes로 표현 — 회전 매트릭스만으로는 facing 미러를 깔끔히 못 합쳐서.

export interface AbsBox {
  x: number;     // left
  y: number;     // top
  w: number;
  h: number;
}

// 4 corners(world 좌표) + SAT 분리축 2개(local x/y의 world 단위 벡터)
export interface OBB {
  corners: [number, number][];
  axes: [[number, number], [number, number]];
}

export function aabb(a: AbsBox, b: AbsBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x
      && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function absHurtbox(p: Player): AbsBox {
  return {
    x: p.x - CHAR_W / 2,
    y: p.y - CHAR_H,
    w: CHAR_W,
    h: CHAR_H,
  };
}

// 회전 좌표계 설명:
//   1) hitbox는 facing-forward 기준으로 정의됨 (forward = local +x).
//   2) dash 벡터(state.dashDx, dashDy)를 facing-forward로 변환해 회전각 결정.
//      dashDx_forward = dashDx * facing.  (facing=-1이면 dash도 좌측 → forward 기준 +1)
//   3) 회전 적용 후, facing으로 좌우 미러링해 world 좌표로 변환.
// 이렇게 분리해야 facing=-1 + 수평 dash가 "좌측 미러"로만 처리되고
// hitbox 위/아래는 절대 뒤집히지 않음.
export function getActiveHitOBB(p: Player, state: CharState): OBB | null {
  if (state.kind !== 'active') return null;

  const hb: Box = state.action.hitbox;

  // forward-frame 회전각의 cos/sin
  const cosF = state.dashDx * p.facing;
  const sinF = state.dashDy;

  // hitbox local 4 corners (forward-frame, mirror 적용 전)
  const lx0 = hb.x, lx1 = hb.x + hb.w;
  const ly0 = hb.y, ly1 = hb.y + hb.h;

  const localCorners: [number, number][] = [
    [lx0, ly0], [lx1, ly0], [lx1, ly1], [lx0, ly1],
  ];

  // local → world: R_forward 회전 → facing 좌우 미러 → translate.
  // 회전축은 캐릭터 상체 중앙(p.x, p.y - CHAR_H/2). hitbox 정의도 그 origin-centered여야
  // 모든 dash 방향에서 캐릭터 정중앙 기준으로 hitbox가 뻗음.
  const pivotX = p.x;
  const pivotY = p.y - CHAR_H / 2;
  const corners: [number, number][] = localCorners.map(([lx, ly]) => {
    const rx = lx * cosF - ly * sinF;
    const ry = lx * sinF + ly * cosF;
    return [pivotX + rx * p.facing, pivotY + ry];
  });

  // SAT 분리축: hitbox local x/y의 world 단위 벡터
  // local-x: forward-frame (cosF, sinF) → mirror → (facing*cosF, sinF)
  // local-y: forward-frame (-sinF, cosF) → mirror → (-facing*sinF, cosF)
  const axes: [[number, number], [number, number]] = [
    [p.facing * cosF, sinF],
    [-p.facing * sinF, cosF],
  ];

  return { corners, axes };
}

// SAT (Separating Axis Theorem). OBB와 AABB의 4개 축에 대해 투영 겹침 검사.
export function obbVsAabb(obb: OBB, box: AbsBox): boolean {
  const boxC: [number, number][] = [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x + box.w, box.y + box.h],
    [box.x, box.y + box.h],
  ];

  const axes: [number, number][] = [
    obb.axes[0],
    obb.axes[1],
    [1, 0],
    [0, 1],
  ];

  for (const [ax, ay] of axes) {
    let oMin = Infinity, oMax = -Infinity;
    for (const [x, y] of obb.corners) {
      const proj = x * ax + y * ay;
      if (proj < oMin) oMin = proj;
      if (proj > oMax) oMax = proj;
    }
    let bMin = Infinity, bMax = -Infinity;
    for (const [x, y] of boxC) {
      const proj = x * ax + y * ay;
      if (proj < bMin) bMin = proj;
      if (proj > bMax) bMax = proj;
    }
    if (oMax < bMin || bMax < oMin) return false;
  }
  return true;
}
