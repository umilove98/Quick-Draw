import { Container, Graphics, type Application } from 'pixi.js';
import { CHAR_H, CHAR_W, GROUND_Y, STAGE_H, STAGE_W } from '../sim/constants.js';
import type { Player, World } from '../sim/world.js';

// windup telegraph: 공격자가 0.5초 동안 색이 변해 상대가 회피로 대응할 수 있게 한다.
// 진행도(t)에 따라 점점 진해지면 "곧 active" 강도가 시각적으로 증가 — 게임 디자인 핵심 신호.
const WINDUP_COLOR = 0xff6b3d;       // 주황빨강
const DODGE_COLOR = 0x6dd9e3;        // 시안 — i-frame 시각 신호

function lerpHexColor(from: string, to: number, t: number): number {
  const f = parseInt(from.slice(1), 16);
  const fr = (f >> 16) & 0xff, fg = (f >> 8) & 0xff, fb = f & 0xff;
  const tr = (to >> 16) & 0xff, tg = (to >> 8) & 0xff, tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return (r << 16) | (g << 8) | b;
}

function bodyColor(p: Player, baseColor: string): number | string {
  if (p.hitFlashFrames > 0) return '#ffffff';
  if (p.state.kind === 'windup') {
    const t = p.state.frame / p.state.action.windupFrames;
    const blend = 0.4 + 0.55 * t;
    return lerpHexColor(baseColor, WINDUP_COLOR, blend);
  }
  if (p.state.kind === 'dodge') {
    return DODGE_COLOR;
  }
  return baseColor;
}

// 시뮬레이션의 거울. World를 읽어 Pixi 씬 그래프를 갱신한다.
// 잔상(afterimage)과 hit flash 같은 순수 시각 효과는 여기서만 처리 — sim에 누수되지 않게.

interface PlayerView {
  body: Graphics;
}

const PLAYER_COLORS = ['#e3c46d', '#6d9ee3'];

interface Afterimage {
  x: number;
  y: number;
  facing: 1 | -1;
  color: string;
  age: number;       // ticks elapsed
  maxAge: number;
}

const AFTERIMAGE_MAX_AGE = 18;     // ~300ms — active 종료 후 자연스럽게 페이드
const AFTERIMAGE_START_ALPHA = 0.55;

export class WorldView {
  readonly stage: Container;
  private readonly groundLayer: Container;
  private readonly afterimageLayer: Container;
  private readonly characterLayer: Container;

  private readonly playerViews = new Map<number, PlayerView>();
  private readonly afterimages: Afterimage[] = [];
  private lastSeenTick = -1;

  constructor(app: Application) {
    this.stage = new Container();
    app.stage.addChild(this.stage);

    // z-order: ground < afterimage < character
    this.groundLayer = new Container();
    this.afterimageLayer = new Container();
    this.characterLayer = new Container();
    this.stage.addChild(this.groundLayer, this.afterimageLayer, this.characterLayer);

    const ground = new Graphics();
    ground.rect(0, GROUND_Y, STAGE_W, STAGE_H - GROUND_Y).fill('#2a2e38');
    ground.rect(0, GROUND_Y, STAGE_W, 2).fill('#3a3f4e');
    this.groundLayer.addChild(ground);
  }

  sync(world: World, _alpha: number): void {
    // Tick 경계에서만 잔상 기록/노화. 렌더 frame과 sim tick은 다르므로 한 번만.
    if (world.tick !== this.lastSeenTick) {
      this.lastSeenTick = world.tick;
      this.advanceAfterimages(world);
    }

    // 캐릭터 mirror
    for (const p of world.players) {
      let pv = this.playerViews.get(p.id);
      if (!pv) {
        const body = new Graphics();
        pv = { body };
        this.characterLayer.addChild(body);
        this.playerViews.set(p.id, pv);
      }
      const baseColor = PLAYER_COLORS[p.id] ?? '#cccccc';
      const color = bodyColor(p, baseColor);
      pv.body.clear();
      pv.body.rect(-CHAR_W / 2, -CHAR_H, CHAR_W, CHAR_H).fill(color);
      pv.body.position.set(p.x, p.y);
      pv.body.scale.x = p.facing;
    }
  }

  private advanceAfterimages(world: World): void {
    // active(공격) 또는 dodge(회피) 동안 잔상 기록.
    for (const p of world.players) {
      if (p.state.kind === 'active') {
        this.afterimages.push({
          x: p.x,
          y: p.y,
          facing: p.facing,
          color: PLAYER_COLORS[p.id] ?? '#cccccc',
          age: 0,
          maxAge: AFTERIMAGE_MAX_AGE,
        });
      } else if (p.state.kind === 'dodge') {
        // 회피 잔상은 시안 톤 — i-frame을 시각적으로 강조
        this.afterimages.push({
          x: p.x,
          y: p.y,
          facing: p.facing,
          color: '#6dd9e3',
          age: 0,
          maxAge: AFTERIMAGE_MAX_AGE,
        });
      }
    }

    // 노화 + 만료 제거
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const a = this.afterimages[i]!;
      a.age++;
      if (a.age >= a.maxAge) this.afterimages.splice(i, 1);
    }

    // 다시 그리기 (max 잔상 ~수십 개라 단순 재생성으로 충분)
    while (this.afterimageLayer.children.length > 0) {
      this.afterimageLayer.children[0]!.destroy();
    }
    for (const a of this.afterimages) {
      const g = new Graphics();
      g.rect(-CHAR_W / 2, -CHAR_H, CHAR_W, CHAR_H).fill(a.color);
      g.position.set(a.x, a.y);
      g.scale.x = a.facing;
      const t = a.age / a.maxAge; // 0 → 1
      g.alpha = AFTERIMAGE_START_ALPHA * (1 - t);
      this.afterimageLayer.addChild(g);
    }
  }
}
