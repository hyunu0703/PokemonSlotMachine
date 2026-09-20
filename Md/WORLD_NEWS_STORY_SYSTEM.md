# Pokémon World Story News System v25

## 기준

- GitHub `main` HEAD: `287e55b49e19fca40860f0195c2f4cc59bfc6656`
- Commit: `[Feat] 포켓몬 세계관 DB 추가`
- 기존 `data/world/pokemon-world-db.json`은 수정하지 않는다.
- 시장 가격 계산/거래량/쇼크/회복 로직은 기존 main 구조를 유지한다.

## 변경 파일

- `js/world-news.js` 신규
- `js/market.js` 수정
- `js/market-view.js` 수정

## 동작 방식

`js/world-news.js`는 다음 파일을 직접 읽는다.

```js
import worldDatabaseSource from '../data/world/pokemon-world-db.json' with { type: 'json' };
```

따라서 현재 main에 이미 존재하는 세계관 DB가 실제 뉴스 원본이다.

뉴스 생성 순서:

1. 1~9세대 `storyArcs` 중 한 스토리를 선택한다.
2. 최대 3개의 스토리를 동시에 기억한다.
3. 각 스토리는 `stage` 순서를 절대 거꾸로 진행하지 않는다.
4. 후속 핵심 사건은 2~5 Tick 뒤에 발생한다.
5. 사이 Tick에는 필요할 경우 `후속 브리핑` 중립 뉴스가 출력된다.
6. Event가 존재하는 stage는 `sixW`의 who/where/what/why/how를 설명문에 사용한다.
7. 이전 제목을 저장해서 다음 단계 설명에 `앞서 전해진 ...에 이어` 형태로 연결한다.
8. 마지막 stage가 끝난 StoryArc는 최근 목록에 저장해 즉시 같은 스토리가 반복되는 것을 줄인다.

## 저장되는 스토리 상태

기존 Save의 `market` 안에 다음 데이터가 추가된다.

```text
worldNewsState
  version
  sequence
  activeStories[]
    arcId
    generation
    regionId
    stageIndex
    startedAt
    lastTime
    nextDueTime
    lastTitle
  recentArcIds[]
```

`migrateNewsSystem()`에서 기존 Save에도 자동으로 `worldNewsState`를 생성한다.
별도의 Save Version 증가는 필요하지 않다.

## Market 화면

세계관 뉴스에는 다음 정보가 표시된다.

```text
뉴스 출처 · N세대 · 지역 · 후속 N/M · 호재/악재/중립
제목
육하원칙 기반 설명
스토리명 · 현재 단계
기존 시장 영향 대상
```

예시:

```text
호연 TV · 기자 개비 · 3세대 · 호연지방 · 후속 3/5 · 악재
해저동굴에서 전설 포켓몬 각성…추가 정황 포착

앞서 전해진 '굴뚝산에서 두 조직 충돌...' 소식에 이어
'육지와 바다의 충돌'과 관련된 후속 상황이 확인됐다...
```

## 가격 시스템과의 연결

이번 패치는 뉴스의 **스토리 생성/문구/기억 방식**을 세계관 DB 기반으로 변경한다.
가격 계산 공식 자체는 기존 main을 유지한다.

세계관 StoryArc가 특정 포켓몬을 직접 언급하면 해당 포켓몬을 `card` 뉴스 대상으로 연결한다.
직접 포켓몬이 없으면 사건 문맥에서 타입을 추론해 기존 타입 뉴스 효과를 사용한다.

즉 현재 단계는:

```text
World DB
→ StoryArc / Event / sixW
→ 뉴스 제목·설명·후속 기억
→ 기존 NEWS_CONFIG 가격 효과
→ 기존 Market 가격 엔진
```

향후 `세대/지역/등급/수혜/피해`별 MarketEffect DB를 추가하면 가격 영향도 세계관 사건과 완전히 분리할 수 있다.

## 검증

- `node --check js/world-news.js` 통과
- `node --check js/market.js` 통과
- `node --check js/market-view.js` 통과
- 현재 main의 `pokemon-world-db.json` Git blob SHA와 테스트 DB SHA 일치:
  `94e87803f8cd40384b584050157a65564a4b0caf`
- 1,025개 더미 레코드 기반 30 Tick 시뮬레이션에서:
  - `validMarket()` 통과
  - 최근 뉴스 5개 모두 World Story 필드 존재
  - `worldNewsState` 저장/진행 확인

전체 GitHub 테스트 스위트는 실행하지 않았다.
GitHub에는 commit/push하지 않았다.
