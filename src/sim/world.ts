import type { InputSnapshot } from '../input/types.js';
import { initialState, isInvulnerable, type CharState } from './actions.js';
import { SAMURAI_DODGE, SAMURAI_IAIJUTSU } from './characters/samurai.js';
import { absHurtbox, obbVsAabb, getActiveHitOBB } from './collision.js';
import {
  ATTACK_COOLDOWN_TICKS,
  CHAR_H,
  CHAR_W,
  DODGE_COOLDOWN_TICKS,
  FALL_GRAVITY_MULT,
  GRAVITY,
  GROUND_Y,
  HIT_FLASH_FRAMES,
  JUMP_VEL,
  MOVE_SPEED,
  ROUND_END_HOLD_TICKS,
  STAGE_W,
  TICK_HZ,
  WIN_TARGET,
} from './constants.js';

export interface Player {
  id: number;
  x: number;          // center X
  y: number;          // feet Y
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  state: CharState;
  hitFlashFrames: number;
  attackCooldown: number;  // tick 단위. > 0이면 attack 입력 무시.
  dodgeCooldown: number;
  // 공격 발동 후 다음 land까지 회피 불가. 공중 공격의 위험성을 강제하는 룰.
  dodgeLockedUntilGround: boolean;
}

// 라운드 / 매치 상태.
//   active: 진행 중. 일반 step 흐름.
//   roundOver: 누군가 hit 받음. ROUND_END_HOLD_TICKS 동안 멈췄다가 다음 라운드.
//   matchOver: 한 쪽이 WIN_TARGET 도달. Space로 재시작 대기.
export type RoundStatus = 'active' | 'roundOver' | 'matchOver';

export interface RoundState {
  number: number;                  // 1, 2, 3...
  scores: [number, number];        // [P1 라운드 승, P2 라운드 승]
  status: RoundStatus;
  winnerId: number | null;         // 가장 최근 라운드 승자 (없으면 null)
  endedAt: number;                 // status가 roundOver/matchOver로 바뀐 tick
}

export interface World {
  tick: number;
  players: Player[];
  round: RoundState;
}

function makePlayer(id: number, x: number, y: number, facing: 1 | -1): Player {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    facing,
    grounded: true,
    state: initialState(),
    hitFlashFrames: 0,
    attackCooldown: 0,
    dodgeCooldown: 0,
    dodgeLockedUntilGround: false,
  };
}

const SPAWN_SPREAD = 240;

function placePlayer(p: Player, id: number): void {
  p.x = id === 0 ? STAGE_W / 2 - SPAWN_SPREAD : STAGE_W / 2 + SPAWN_SPREAD;
  p.y = GROUND_Y;
  p.vx = 0;
  p.vy = 0;
  p.facing = id === 0 ? 1 : -1;
  p.grounded = true;
  p.state = initialState();
  p.hitFlashFrames = 0;
  p.attackCooldown = 0;
  p.dodgeCooldown = 0;
  p.dodgeLockedUntilGround = false;
}

export function createWorld(): World {
  return {
    tick: 0,
    players: [
      makePlayer(0, STAGE_W / 2 - SPAWN_SPREAD, GROUND_Y, 1),
      makePlayer(1, STAGE_W / 2 + SPAWN_SPREAD, GROUND_Y, -1),
    ],
    round: {
      number: 1,
      scores: [0, 0],
      status: 'active',
      winnerId: null,
      endedAt: 0,
    },
  };
}

export function resetRound(world: World): void {
  for (const p of world.players) placePlayer(p, p.id);
  world.round.status = 'active';
  world.round.winnerId = null;
}

export function resetMatch(world: World): void {
  resetRound(world);
  world.round.scores = [0, 0];
  world.round.number = 1;
}

// attack/dodge 시작 시점의 (dirX, dirY) → 정규화된 dash 단위 벡터.
// fallback은 caller가 결정: attack은 facing 정면, dodge는 facing 반대.
function normalizeDir(dx: number, dy: number, fallbackX: number, fallbackY: number): { dx: number; dy: number } {
  if (dx === 0 && dy === 0) {
    return { dx: fallbackX, dy: fallbackY };
  }
  const mag = Math.sqrt(dx * dx + dy * dy);
  return { dx: dx / mag, dy: dy / mag };
}

function applyInputAndState(p: Player, input: InputSnapshot): void {
  switch (p.state.kind) {
    case 'idle': {
      if (input.dirX !== 0) p.facing = input.dirX as 1 | -1;

      // 회피: 즉발. 입력 방향(없으면 facing 반대 = 뒤로 회피).
      // 1초 쿨다운 + 공격 후 land 전엔 잠김 (공중 공격 책임).
      if (input.dodgePressed && p.dodgeCooldown <= 0 && !p.dodgeLockedUntilGround) {
        const v = normalizeDir(input.dirX, input.dirY, -p.facing, 0);
        p.state = { kind: 'dodge', frame: 0, data: SAMURAI_DODGE, dashDx: v.dx, dashDy: v.dy };
        p.dodgeCooldown = DODGE_COOLDOWN_TICKS;
        p.vx = 0;
        p.vy = 0;
        break;
      }

      // 공격: windup 시작. 지상/공중 모두 가능. 2초 쿨다운.
      if (input.attackPressed && p.attackCooldown <= 0) {
        const v = normalizeDir(input.dirX, input.dirY, p.facing, 0);
        if (input.dirX !== 0) p.facing = input.dirX as 1 | -1;
        p.state = {
          kind: 'windup',
          frame: 0,
          action: SAMURAI_IAIJUTSU,
          dashDx: v.dx,
          dashDy: v.dy,
        };
        p.attackCooldown = ATTACK_COOLDOWN_TICKS;
        p.dodgeLockedUntilGround = true;  // 공격 후 land까지 회피 불가
        p.vx = 0;
        p.vy = 0;
        break;
      }

      // 일반 이동
      p.vx = input.dirX * MOVE_SPEED;
      if (input.jumpPressed && p.grounded) {
        p.vy = JUMP_VEL;
        p.grounded = false;
      }
      break;
    }
    case 'windup': {
      p.vx = 0;
      p.vy = 0;
      p.state.frame++;
      if (p.state.frame >= p.state.action.windupFrames) {
        p.state = {
          kind: 'active',
          frame: 0,
          action: p.state.action,
          dashDx: p.state.dashDx,
          dashDy: p.state.dashDy,
          hitConfirmed: false,
        };
      }
      break;
    }
    case 'active': {
      const speed = p.state.action.dashSpeed;
      p.vx = p.state.dashDx * speed;
      p.vy = p.state.dashDy * speed;
      p.state.frame++;
      if (p.state.frame >= p.state.action.activeFrames) {
        p.state = { kind: 'recovery', frame: 0, action: p.state.action };
        p.vx = 0;
        p.vy = 0;
      }
      break;
    }
    case 'recovery': {
      p.vx = 0;
      p.state.frame++;
      if (p.state.frame >= p.state.action.recoveryFrames) {
        p.state = { kind: 'idle' };
      }
      break;
    }
    case 'dodge': {
      const speed = p.state.data.speed;
      p.vx = p.state.dashDx * speed;
      p.vy = p.state.dashDy * speed;
      p.state.frame++;
      if (p.state.frame >= p.state.data.frames) {
        p.state = { kind: 'idle' };
        p.vx = 0;
        p.vy = 0;
      }
      break;
    }
  }
}

function applyPhysics(p: Player): void {
  const dt = 1 / TICK_HZ;

  // 액션 중엔 중력 무시(공중 정지/직선 dash/직선 회피)
  const gravityFrozen = p.state.kind === 'windup'
                     || p.state.kind === 'active'
                     || p.state.kind === 'dodge';
  if (!gravityFrozen) {
    const g = p.vy >= 0 ? GRAVITY * FALL_GRAVITY_MULT : GRAVITY;
    p.vy += g * dt;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const halfW = CHAR_W / 2;
  if (p.x < halfW) p.x = halfW;
  if (p.x > STAGE_W - halfW) p.x = STAGE_W - halfW;

  if (p.y - CHAR_H < 0) {
    p.y = CHAR_H;
    if (p.vy < 0) p.vy = 0;
  }

  if (p.y >= GROUND_Y) {
    p.y = GROUND_Y;
    p.vy = 0;
    p.grounded = true;
  } else {
    p.grounded = false;
  }
}

function resolveHits(world: World): void {
  // 1단계: 모든 attacker의 hit를 먼저 다 평가. 라운드 결과는 아직 결정 안 함.
  // 이렇게 해야 P1이 먼저 평가된다고 P2의 hit가 무시되지 않음 (Double KO 정확 처리).
  const hitTaken = new Set<number>();

  for (const attacker of world.players) {
    if (attacker.state.kind !== 'active') continue;
    if (attacker.state.hitConfirmed) continue;

    const hb = getActiveHitOBB(attacker, attacker.state);
    if (!hb) continue;

    for (const defender of world.players) {
      if (defender.id === attacker.id) continue;
      if (isInvulnerable(defender.state)) continue;
      const ht = absHurtbox(defender);
      if (obbVsAabb(hb, ht)) {
        defender.hitFlashFrames = HIT_FLASH_FRAMES;
        attacker.state.hitConfirmed = true;
        hitTaken.add(defender.id);
        break;
      }
    }
  }

  // 2단계: 라운드 결과 결정
  if (world.round.status !== 'active') return;
  if (hitTaken.size === 0) return;

  world.round.status = 'roundOver';
  world.round.endedAt = world.tick;

  if (hitTaken.size === 1) {
    // 한쪽만 hit. 맞은 쪽이 패배, 상대가 +1.
    const loserId = [...hitTaken][0]!;
    const winnerId = 1 - loserId;
    world.round.winnerId = winnerId;
    world.round.scores[winnerId] = (world.round.scores[winnerId] ?? 0) + 1;
  } else {
    // 양쪽 hit = Double KO. 양쪽 다 +1, winnerId = null(무승부).
    world.round.winnerId = null;
    world.round.scores[0] = (world.round.scores[0] ?? 0) + 1;
    world.round.scores[1] = (world.round.scores[1] ?? 0) + 1;
  }
}

export function step(world: World, inputs: ReadonlyArray<InputSnapshot>): void {
  // 매치 종료: Space(jumpPressed)로 재시작 대기. 시뮬레이션은 정지.
  if (world.round.status === 'matchOver') {
    for (const input of inputs) {
      if (input?.jumpPressed) {
        resetMatch(world);
        break;
      }
    }
    world.tick++;
    return;
  }

  // 라운드 종료: hold 시간 동안 캐릭터 정지. flash decay만 진행.
  if (world.round.status === 'roundOver') {
    for (const p of world.players) {
      if (p.hitFlashFrames > 0) p.hitFlashFrames--;
    }
    if (world.tick - world.round.endedAt >= ROUND_END_HOLD_TICKS) {
      const p1Won = (world.round.scores[0] ?? 0) >= WIN_TARGET;
      const p2Won = (world.round.scores[1] ?? 0) >= WIN_TARGET;
      if (p1Won || p2Won) {
        world.round.status = 'matchOver';
        world.round.endedAt = world.tick;
        // 양쪽 동시 WIN_TARGET 도달 = 매치 무승부 (Double KO로만 가능)
        world.round.winnerId = (p1Won && p2Won) ? null : (p1Won ? 0 : 1);
      } else {
        world.round.number++;
        resetRound(world);
      }
    }
    world.tick++;
    return;
  }

  // active 라운드 — 일반 step
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i]!;
    const input = inputs[i];
    if (!input) continue;
    applyInputAndState(p, input);
  }

  for (const p of world.players) {
    applyPhysics(p);
    if (p.hitFlashFrames > 0) p.hitFlashFrames--;
    if (p.attackCooldown > 0) p.attackCooldown--;
    if (p.dodgeCooldown > 0) p.dodgeCooldown--;
    // 땅에 닿으면 회피 잠금 해제
    if (p.grounded) p.dodgeLockedUntilGround = false;
  }

  resolveHits(world);

  world.tick++;
}
