# Pokémon Slot Machine — World Story Generation Scope v38

## 기준
- GitHub main 확인: `b321f0f4b4aa547968efaf6cc0ccd7dc937f36f3`
- main의 `js/market.js` blob: `2ae8fa75b65cb6a427f178b4fd4bb13c32592db6`
- 이번 v38은 직전 작업물 `AsymmetricMarket_v37` 위에 세대/지역 시장 범위를 추가했다.
- GitHub에는 커밋/푸시하지 않았다.

## 변경 목적
세계관 DB가 만든 장소/스토리 뉴스는 그 사건이 속한 세대의 포켓몬에게만 실제 가격 영향을 준다.
일반 시장 뉴스는 세대 제한 없이 기존처럼 전 세대를 대상으로 할 수 있다.

예시:
- `3세대 · 호연지방 · 불꽃타입 세계관 뉴스`
  - 3세대 포켓몬만 가격 반응 후보
  - 그 안에서 Fire 타입/상성/직접지목 여부와 v37의 종목별 비대칭 반응으로 강도가 갈림
  - 1·2·4~9세대는 해당 세계관 뉴스 가격 효과 0
- `불꽃타입 일반 시장 뉴스`
  - 세대 필터 없음
  - 1~9세대 전체에서 기존 타입/상성 규칙에 따라 반응 가능

## 구현
`newsScopeMatchesPokemon(entry, pokemon)` 추가.

규칙:
```js
if (!entry?.worldStory) return true;
if (!Number.isInteger(entry.generation)) return true;
return pokemon?.generation === entry.generation;
```

이 범위 검사를 두 군데에 적용했다.
1. `newsEffect()` — 실제 가격/거래활동 효과를 다른 세대로 전파하지 않음.
2. `marketReactionSignal()` — 직접지목 뉴스라도 세대가 다르면 새 급등/급락 패턴을 시작하지 못하게 이중 차단.

`generation`이 없는 과거 세계관 뉴스는 기존 저장 호환을 위해 전역 동작을 유지한다. 새로 생성되는 세계관 DB 뉴스에는 이미 `generation`이 들어가므로 새 뉴스는 세대 범위가 정상 적용된다.

## QA
- Syntax: `node --check` 통과
- 범위 테스트:
  - 3세대 세계관 뉴스 영향 세대: `[3]`
  - 다른 세대 가격 효과: `0`
  - 다른 세대 direct-card 우회: 차단
  - 일반 시장 뉴스 scope 허용 세대: `[1,2,3,4,5,6,7,8,9]`
- 안정성: 1,025종 × 2,000 Tick = 2,050,000 card-ticks
- `validMarket()`: true
- JSON 저장/복원 후 `validMarket()`: true
- 가격 NaN/Infinity/범위 오류: 없음
- 거래 24h circular buffer: 144 정상

자세한 결과는 `QA_2000_TICKS.json` 참고.
