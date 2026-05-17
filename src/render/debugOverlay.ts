import { Container, Graphics, Text, type Application } from 'pixi.js';
import { absHurtbox, getActiveHitOBB } from '../sim/collision.js';
import { CHAR_H } from '../sim/constants.js';
import type { World } from '../sim/world.js';

// 격투게임 프로토타입의 생명줄.
// hurtbox(초록 AABB), hitbox(빨강 OBB — dash 방향으로 회전), iframe(M4)을 시각화한다. F1 토글.

export class DebugOverlay {
  private readonly container: Container;
  private readonly hurtboxes = new Map<number, Graphics>();
  private readonly hitboxes = new Map<number, Graphics>();
  private readonly labels = new Map<number, Text>();
  private readonly stateLabels = new Map<number, Text>();

  constructor(app: Application) {
    this.container = new Container();
    this.container.visible = false;
    app.stage.addChild(this.container);
  }

  toggle(): void {
    this.container.visible = !this.container.visible;
  }

  get visible(): boolean {
    return this.container.visible;
  }

  sync(world: World): void {
    if (!this.container.visible) return;

    for (const p of world.players) {
      // hurtbox (초록 AABB 외곽)
      let hurt = this.hurtboxes.get(p.id);
      if (!hurt) {
        hurt = new Graphics();
        this.container.addChild(hurt);
        this.hurtboxes.set(p.id, hurt);
      }
      const ht = absHurtbox(p);
      hurt.clear().rect(ht.x, ht.y, ht.w, ht.h).stroke({ color: 0x4cd964, width: 2 });

      // hitbox (빨강 OBB — dash 방향으로 회전)
      let hit = this.hitboxes.get(p.id);
      if (!hit) {
        hit = new Graphics();
        this.container.addChild(hit);
        this.hitboxes.set(p.id, hit);
      }
      const hb = getActiveHitOBB(p, p.state);
      hit.clear();
      hit.position.set(0, 0);
      hit.rotation = 0;
      if (hb) {
        // OBB는 4 corners(world 좌표). polygon으로 직접 그림.
        const points: number[] = [];
        for (const [cx, cy] of hb.corners) {
          points.push(cx, cy);
        }
        hit.poly(points)
          .stroke({ color: 0xff3b30, width: 2 })
          .fill({ color: 0xff3b30, alpha: 0.18 });
      }

      // P1/P2 라벨
      let label = this.labels.get(p.id);
      if (!label) {
        label = new Text({
          text: `P${p.id + 1}`,
          style: { fontFamily: 'ui-monospace, monospace', fontSize: 12, fill: 0xffffff },
        });
        label.anchor.set(0.5, 1);
        this.container.addChild(label);
        this.labels.set(p.id, label);
      }
      label.position.set(p.x, p.y - CHAR_H - 18);

      // state 라벨
      let stateLabel = this.stateLabels.get(p.id);
      if (!stateLabel) {
        stateLabel = new Text({
          text: '',
          style: { fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: 0xa0a8b8 },
        });
        stateLabel.anchor.set(0.5, 1);
        this.container.addChild(stateLabel);
        this.stateLabels.set(p.id, stateLabel);
      }
      stateLabel.text = describeState(p.state);
      stateLabel.position.set(p.x, p.y - CHAR_H - 4);
    }
  }
}

function describeState(s: World['players'][number]['state']): string {
  switch (s.kind) {
    case 'idle': return 'idle';
    case 'windup': return `windup ${s.frame}/${s.action.windupFrames}  d(${s.dashDx.toFixed(2)},${s.dashDy.toFixed(2)})`;
    case 'active': return `active ${s.frame}/${s.action.activeFrames}${s.hitConfirmed ? ' HIT' : ''}`;
    case 'recovery': return `recovery ${s.frame}/${s.action.recoveryFrames}`;
    case 'dodge': return `dodge ${s.frame}/${s.data.frames}  d(${s.dashDx.toFixed(2)},${s.dashDy.toFixed(2)})`;
  }
}
