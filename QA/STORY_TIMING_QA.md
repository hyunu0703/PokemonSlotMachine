# Story Timing Independence QA

## 기준
- 최신 GitHub `main`: `820aab69cdd94ce195282ee8717fac7c19d86647`
- 이번 수정은 직전에 전달한 Story Branching 수정본의 후속 패치다.
- GitHub에는 commit / push 하지 않았다.

## 문제
기존 분기 버전은 `opening / branch / outcome`을 뽑을 때 외부에서 받은 `random()`을 추가로 소비했다.
그 결과 분기 기능 자체가 후속 뉴스 간격 추첨의 난수 순서에 간접 영향을 줄 수 있었다.

## 수정
### 분기 RNG
`storyRunId + phase`를 이용한 독립 난수 스트림으로 분리했다.
분기 결과를 계산할 때 더 이상 시장/스토리 스케줄용 `random()`을 소비하지 않는다.

### 후속 에피소드 RNG
`storyRunId + nextStageIndex`를 이용한 별도 독립 난수 스트림으로 분리했다.
분기 결과, 타입 추첨, 다른 시장 랜덤 호출 수가 바뀌어도 이미 결정된 후속 에피소드 간격은 영향을 받지 않는다.

### 후속 간격
기존 균등 `2~5 Tick`은 평균 3.5 Tick = 약 35분이었다.
새 가중치는 다음과 같다.

- 2 Tick / 20분: 45%
- 3 Tick / 30분: 35%
- 4 Tick / 40분: 15%
- 5 Tick / 50분: 5%

이론 평균은 2.8 Tick = 약 28분이다.

## 10,000회 타이밍 시뮬레이션
실측:

- 20분: 4,550회 / 45.50%
- 30분: 3,551회 / 35.51%
- 40분: 1,426회 / 14.26%
- 50분: 473회 / 4.73%
- 범위 밖: 0회
- 평균: 2.7822 Tick = 약 27.82분

## 독립성 테스트
동일 StoryArc / 동일 시작시각에서 최근 루트 기록만 서로 다르게 만들어 분기 결과를 다르게 발생시켰다.

- 실행 A nature: neutral
- 실행 B nature: positive
- 다음 Stage delay A: 5 Tick
- 다음 Stage delay B: 5 Tick
- 예정 시각 동일: true

즉 분기 결과가 달라도 후속 에피소드 스케줄은 변하지 않는다.

## 분기 회귀 테스트
분리 후에도 기존 스토리 분기 기능이 유지되는지 검사했다.

- `positive / neutral / negative`의 `opening × branch × outcome` 27개 조합 모두 출현
- 1,200회 연속 StoryArc 실행에서 완전히 동일한 route의 즉시 반복: 0회
- 최근 루트 기억 기능 유지

## 저장 호환
`STORY_STATE_VERSION`을 3으로 올렸고 v1/v2/v3를 모두 migration 대상으로 인정한다.
기존 저장 데이터를 초기화하지 않는다.

기존 활성 스토리에 이전 버전에서 지나치게 긴 `nextDueTime`이 남아 있는 경우, 현재 시점 기준 남은 대기를 최대 4 Tick(40분)으로 한 번 보정할 수 있도록 했다.
