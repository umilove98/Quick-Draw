// InputSnapshot: 매 tick 시뮬레이션이 소비하는 단일 입력 형식.
// 로컬·AI·(미래의)리모트 모두 같은 구조체를 만들어 sim에 전달한다.
// 이게 그대로 미래 롤백 넷코드의 wire format이 된다.
export interface InputSnapshot {
  tick: number;

  // 좌우/상하 입력 (이번 tick에 눌려있는 상태). 8방향 사선 dash에 사용.
  dirX: -1 | 0 | 1;
  dirY: -1 | 0 | 1;   // -1: 위(W), 1: 아래(S)

  // held = 이번 tick에 눌려있음
  // pressed = 이번 tick에 새로 눌림 (edge)
  jump: boolean;
  jumpPressed: boolean;

  attack: boolean;
  attackPressed: boolean;

  dodge: boolean;
  dodgePressed: boolean;

  // 마우스 월드 좌표 (조준용; M3에서 본격적으로 쓰임)
  aimX: number;
  aimY: number;
}

export const emptySnapshot = (tick: number): InputSnapshot => ({
  tick,
  dirX: 0,
  dirY: 0,
  jump: false,
  jumpPressed: false,
  attack: false,
  attackPressed: false,
  dodge: false,
  dodgePressed: false,
  aimX: 0,
  aimY: 0,
});
