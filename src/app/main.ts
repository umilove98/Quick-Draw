import { AISource } from '../ai/agent.js';
import { KeyboardState } from '../input/keyboard.js';
import { MouseState } from '../input/mouse.js';
import {
  DEFAULT_P1_KEYS,
  DEFAULT_P2_KEYS,
  LocalSource,
  type InputSource,
} from '../input/sources.js';
import { createWorld } from '../sim/world.js';
import { createPixiApp } from '../render/app.js';
import { DebugOverlay } from '../render/debugOverlay.js';
import { WorldView } from '../render/view.js';
import { startLoop } from './loop.js';

async function main(): Promise<void> {
  const stageEl = document.getElementById('stage');
  const hudEl = document.getElementById('hud');
  if (!stageEl || !hudEl) throw new Error('mount elements missing');

  window.addEventListener('contextmenu', (e) => e.preventDefault());

  const app = await createPixiApp(stageEl);
  const view = new WorldView(app);
  const debug = new DebugOverlay(app);

  const kb = new KeyboardState();
  kb.attach();
  const mouse = new MouseState();
  mouse.attach(app.canvas as unknown as HTMLElement);

  const world = createWorld();

  // P2 기본은 AI. F2로 토글.
  let p2Mode: 'ai' | 'keyboard' = 'ai';
  const sources: InputSource[] = [
    new LocalSource(kb, DEFAULT_P1_KEYS, mouse),
    new AISource(1),
  ];

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F1') {
      e.preventDefault();
      debug.toggle();
    } else if (e.code === 'F2') {
      e.preventDefault();
      p2Mode = p2Mode === 'ai' ? 'keyboard' : 'ai';
      sources[1] = p2Mode === 'ai'
        ? new AISource(1)
        : new LocalSource(kb, DEFAULT_P2_KEYS);
    }
  });

  const loop = startLoop({
    world,
    sources,
    kb,
    mouse,
    render: (w, alpha) => {
      view.sync(w, alpha);
      debug.sync(w);
    },
  });

  const updateHud = (): void => {
    const s = loop.getStats();
    const r = world.round;
    const score = `P1 ${r.scores[0]} - ${r.scores[1]} P2`;
    const winLabel = r.winnerId === null ? 'DOUBLE KO' : `P${r.winnerId + 1}`;
    const roundLine = r.status === 'matchOver'
      ? `MATCH ${r.winnerId === null ? 'DRAW' : winLabel + ' WINS'}   ${score}  —  Press SPACE to restart`
      : r.status === 'roundOver'
        ? `Round ${r.number}: ${winLabel}   ${score}`
        : `Round ${r.number}   ${score}`;

    const lines = [
      `fps ${s.fps}  tps ${s.tickRate}  tick ${s.tick}  [F1: debug ${debug.visible ? 'ON' : 'OFF'}]  [F2: P2 = ${p2Mode}]`,
      roundLine,
    ];
    for (const p of world.players) {
      const atkCd = p.attackCooldown > 0 ? `atk cd ${(p.attackCooldown / 60).toFixed(2)}s` : 'atk READY';
      let dgCd: string;
      if (p.dodgeCooldown > 0) dgCd = `dg cd ${(p.dodgeCooldown / 60).toFixed(2)}s`;
      else if (p.dodgeLockedUntilGround) dgCd = 'dg LOCKED(land)';
      else dgCd = 'dg READY';
      lines.push(
        `P${p.id + 1}: ${p.state.kind.padEnd(8)} ${p.grounded ? 'gnd' : 'air'} face ${p.facing > 0 ? '>' : '<'}  [${atkCd}] [${dgCd}]`,
      );
    }
    lines.push('');
    lines.push('P1: arrows move/aim, Space jump, Z attack, X dodge  (마우스 LMB/RMB도 가능)');
    lines.push('P2 (kb mode): WASD move/aim, ShiftL jump, Q attack, E dodge');
    hudEl.textContent = lines.join('\n');
    requestAnimationFrame(updateHud);
  };
  requestAnimationFrame(updateHud);
}

main().catch((err) => {
  console.error(err);
  document.body.innerText = `Error: ${err instanceof Error ? err.message : String(err)}`;
});
