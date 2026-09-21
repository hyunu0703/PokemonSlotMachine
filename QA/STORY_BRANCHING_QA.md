# World News Story Branching QA

## 기준
- GitHub `main` 확인 시점: 2026-09-21
- 기준 커밋: `820aab69cdd94ce195282ee8717fac7c19d86647`
- 커밋 메시지: `[Feat] 뉴스 이벤트 문구 가독성 및 문법 개선`
- 변경 파일: `js/world-news.js`
- GitHub에는 commit / push 하지 않음

## 구조
기존 86개 Stage의 세계관 사실(인물, 장소, 사건)은 유지하면서 한 StoryArc 실행에 세 번만 방향을 결정한다.

1. `opening` — 초반 시드
2. `branch` — 중간 분기
3. `outcome` — 최종 결과

각 단계는 `positive / neutral / negative` 중 하나다. 따라서 스토리 하나의 최대 루트 조합은 `3 × 3 × 3 = 27`개다.
현재 DB는 StoryArc 19개, Stage 86개이므로 최대 513개의 완성 루트 조합을 갖는다.

## Stage 수별 phase 배치
- 3 Stage: O-B-R
- 4 Stage: O-B-B-R
- 5 Stage: O-O-B-B-R
- 6 Stage: O-O-B-B-B-R
- 7 Stage: O-O-B-B-B-R-R
- 8 Stage: O-O-O-B-B-B-R-R
- 9 Stage: O-O-O-B-B-B-B-R-R
- 10 Stage: O-O-O-B-B-B-B-B-R-R

O = opening, B = branch, R = outcome

## 비대칭 랜덤 / 최근 루트 기억
고정 33/33/33 추첨을 사용하지 않는다.

- opening: 직전 완료 루트의 시작 성격에 따라 다음 시작 가중치가 달라짐
- branch: opening 성격에 따라 전환 확률이 달라짐
- outcome: branch 성격에 따라 결과 확률이 달라짐
- 최근 6개 루트에서 자주 나온 성격은 가중치를 추가로 낮춤
- 바로 직전 전체 루트와 같은 성격은 추가 억제
- 같은 StoryArc에서 직전에 사용한 성격은 추가 억제
- 같은 StoryArc에서 `opening > branch > outcome`이 완전히 같은 루트는 연속으로 재등장하지 않음
- 최근 완료 루트 최대 18개를 `worldNewsState.recentRoutes`에 저장

## 기존 저장 데이터
`worldNewsState` 버전을 2로 올렸지만 v1을 바로 폐기하지 않는다.
기존 active story / history / cooldown을 유지하면서 새로운 route 필드를 보완한다.

## 시장 가격 연결
`market.js`의 기존 구조를 확인했다.

`generateWorldStoryNews()`가 반환한 `nature`를 `generateNews()`가 그대로 사용하고,
- positive -> `NEWS_CONFIG.price.positive`
- negative -> `NEWS_CONFIG.price.negative`
- neutral -> 방향 가격 영향 0

으로 연결한다.
따라서 이번 분기 엔진의 opening / branch / outcome 결과가 실제 가격 반응에 바로 반영된다.

단, Stage 사이의 단순 후속 브리핑은 같은 사건이 여러 Tick 동안 가격에 중복 충격을 주지 않도록 neutral을 유지한다.

## 문구 원칙
이전 2~3문장 제한을 제거했다.

이벤트 연결 Stage는 가능한 경우 다음 정보를 최대 5문장 안에 유지한다.
- 장소
- 주요 인물/기관
- 실제 사건(what)
- 이유(why)
- 진행 방법/how 또는 분기 상태

이벤트가 직접 연결되지 않은 Stage도 4문장으로 작성해 StoryArc, 현재 사건, 배경 흐름, 분기 상태를 함께 설명한다.

주요 인물 이름은 축약하거나 제거하지 않는다.

## 굵기 표시
`market-view.js` 최신 main의 기존 렌더링을 확인했다.

- 뉴스 제목: `<strong>`
- 설명: `storyName`, `regionName`, `sixW.who`, `sixW.where`, 포켓몬명, 타입을 `.market-news-keyword`로 강조
- `.market-news-keyword`는 `font-weight: 900`

따라서 새 문구에서도 지역 / 장소 / 주요 인물 / 스토리 / 포켓몬 / 타입 키워드 강조가 유지된다.

## 86 Stage × 3 문구 QA
총 258개 변형을 강제 생성해 검사했다.

- 빈 제목/설명: 0
- 제목 70자 초과: 0
- 설명 430자 초과: 0
- 3문장 미만: 0
- 5문장 초과: 0
- `때문'`, `위해서'`, `'라는 설명` 형태 문법 오류: 0
- 이벤트 주요 인물 누락: 0
- 이벤트 장소 누락: 0
- 평균 제목 길이: 32.1자
- 최대 제목 길이: 45자
- 평균 설명 길이: 203.7자
- 최대 설명 길이: 240자

## 런타임 테스트
3 Stage mock StoryArc를 실제 `world-news.js` 모듈로 실행했다.

예시 결과:
- opening: positive
- branch: neutral
- outcome: neutral
- routeKey: `positive>neutral>neutral`
- 완료 시 recentRoutes 저장 확인
- state version 2 migration 확인

별도 10,000회 route 추첨 테스트에서 27개 조합이 모두 출현했으며, 동일 완성 루트의 즉시 연속 반복은 0회였다.
