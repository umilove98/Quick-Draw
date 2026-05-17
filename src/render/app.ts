import { Application } from 'pixi.js';
import { STAGE_H, STAGE_W } from '../sim/constants.js';

export async function createPixiApp(mountEl: HTMLElement): Promise<Application> {
  const app = new Application();

  await app.init({
    width: STAGE_W,
    height: STAGE_H,
    background: '#1a1c22',
    antialias: false,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });

  // PixiJS v8: app.canvas (v7의 app.view 대체)
  mountEl.appendChild(app.canvas);
  return app;
}
