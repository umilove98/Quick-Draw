import type { KeyboardState } from '../input/keyboard.js';
import type { MouseState } from '../input/mouse.js';
import type { InputSource } from '../input/sources.js';
import type { InputSnapshot } from '../input/types.js';
import { DT_MS } from '../sim/constants.js';
import { step, type World } from '../sim/world.js';

// 고정 타임스텝 + accumulator 패턴.
// rAF는 가변 간격(60Hz, 144Hz, 탭 비활성 시 0)이지만 step()은 항상 1/TICK_HZ로 호출.
// 잉여 시간(acc % DT_MS)은 렌더링 보간 alpha로만 사용 — sim에는 절대 돌려주지 않는다.

const MAX_ACC_TICKS = 5; // 탭 전환 후 폭주 방지

export type RenderFn = (world: World, alpha: number) => void;

export interface LoopHandle {
  stop(): void;
  // 디버깅/HUD용
  getStats(): { fps: number; tickRate: number; tick: number };
}

export function startLoop(opts: {
  world: World;
  sources: InputSource[];
  kb: KeyboardState;
  mouse?: MouseState;
  render: RenderFn;
}): LoopHandle {
  const { world, sources, kb, mouse, render } = opts;
  let acc = 0;
  let last = performance.now();
  let raf = 0;

  // FPS / TPS 측정
  let frames = 0;
  let ticks = 0;
  let lastStat = last;
  let fps = 0;
  let tickRate = 0;

  const tick = (now: number): void => {
    const dt = now - last;
    last = now;
    acc = Math.min(acc + dt, MAX_ACC_TICKS * DT_MS);

    while (acc >= DT_MS) {
      const inputs: InputSnapshot[] = sources.map((s) => s.sample(world.tick, world));
      step(world, inputs);
      kb.commitTick();
      mouse?.commitTick();
      acc -= DT_MS;
      ticks++;
    }

    const alpha = acc / DT_MS;
    render(world, alpha);
    frames++;

    if (now - lastStat >= 1000) {
      fps = frames;
      tickRate = ticks;
      frames = 0;
      ticks = 0;
      lastStat = now;
    }

    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);

  return {
    stop: () => cancelAnimationFrame(raf),
    getStats: () => ({ fps, tickRate, tick: world.tick }),
  };
}
