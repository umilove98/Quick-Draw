import type { InputSource } from '../input/sources.js';
import { emptySnapshot, type InputSnapshot } from '../input/types.js';
import type { CharState } from '../sim/actions.js';
import type { World } from '../sim/world.js';

// 단순 반응형 AI. World를 read-only로 보고 InputSnapshot 합성.
// 인간과 같은 입력 파이프라인 — sim 입장에선 누가 입력했는지 모름.
//
// 핵심 디자인:
//  - 풀 게임 상태 보고 즉시 반응하면 무패. 따라서 "반응 지연 버퍼"로 N tick 전 상태를 본다.
//  - 미스 확률로 가끔 회피 실패 — 인간처럼.
//  - sim/와 별개의 PRNG (시드 기반). sim 결정론에 영향 없음.

export interface AIOptions {
  reactionDelay?: number;     // 기본 4 ticks (~67ms). 이 만큼 지연된 상태로 결정.
  attackRange?: number;       // 이 거리 이내면 공격 시도 (기본 220px)
  idealRange?: number;        // 이 거리 유지 (기본 200px)
  missChance?: number;        // 회피 결정을 무시할 확률 (기본 0.1 = 10%)
  seed?: number;
}

interface FoeObservation {
  kind: CharState['kind'];
  windupFrame: number;         // windup인 경우 진행도 (그 외 0)
}

export class AISource implements InputSource {
  private readonly history: FoeObservation[] = [];
  private readonly opts: Required<AIOptions>;
  private readonly rng: () => number;

  constructor(private readonly myId: number, opts: AIOptions = {}) {
    this.opts = {
      reactionDelay: opts.reactionDelay ?? 4,
      attackRange: opts.attackRange ?? 220,
      idealRange: opts.idealRange ?? 200,
      missChance: opts.missChance ?? 0.1,
      seed: opts.seed ?? (0x42 + myId * 7919),
    };
    this.rng = mulberry32(this.opts.seed);
  }

  sample(tick: number, world: World): InputSnapshot {
    const me = world.players[this.myId];
    const foe = world.players[1 - this.myId];
    const snap = emptySnapshot(tick);
    if (!me || !foe) return snap;

    // 매치 종료 시: Space로 재시작 자동 누르기 (사용자 편의)
    if (world.round.status === 'matchOver') {
      // 5초 정도 기다렸다가 Space — 잠깐 화면 보고 재시작
      if (world.tick - world.round.endedAt > 300) {
        snap.jump = true;
        snap.jumpPressed = true;
      }
      return snap;
    }

    // 라운드 사이엔 입력 없음
    if (world.round.status !== 'active') return snap;

    // 상대 state 관찰 기록
    this.history.push({
      kind: foe.state.kind,
      windupFrame: foe.state.kind === 'windup' ? foe.state.frame : 0,
    });
    if (this.history.length > 60) this.history.shift();

    // 반응 지연 적용한 관찰 — N tick 전의 상태를 보고 결정
    const obsIdx = Math.max(0, this.history.length - 1 - this.opts.reactionDelay);
    const observed = this.history[obsIdx] ?? this.history[this.history.length - 1]!;

    const towardFoe: 1 | -1 = foe.x > me.x ? 1 : -1;
    const awayFromFoe: 1 | -1 = -towardFoe as 1 | -1;
    const distance = Math.abs(me.x - foe.x);

    // 1) 회피: 상대가 windup 중이면 (반응 지연 적용된 관찰 기준)
    //    내가 idle이고 cooldown이 풀렸을 때만. 미스 확률로 가끔 못 봄.
    if (
      observed.kind === 'windup'
      && me.state.kind === 'idle'
      && me.dodgeCooldown <= 0
      && this.rng() > this.opts.missChance
    ) {
      snap.dirX = awayFromFoe;
      snap.dodge = true;
      snap.dodgePressed = true;
      return snap;
    }

    // 2) 공격: 가까이 있고 cooldown 풀렸으면
    if (
      distance < this.opts.attackRange
      && me.state.kind === 'idle'
      && me.attackCooldown <= 0
    ) {
      snap.dirX = towardFoe;
      snap.attack = true;
      snap.attackPressed = true;
      return snap;
    }

    // 3) 이동: 거리 조절 (스페이싱)
    if (distance > this.opts.idealRange + 30) {
      snap.dirX = towardFoe;
    } else if (distance < this.opts.idealRange - 30) {
      snap.dirX = awayFromFoe;
    } else {
      snap.dirX = 0;
    }
    return snap;
  }
}

// PRNG (sim/rng.ts와 별개 — AI는 sim 외부, 자체 시드)
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
