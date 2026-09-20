# MARKET NEWS 스토리 에피소드 모달

기준 main: `f88b4deb4235368197e42383189e1741e8cca6f7`

## 변경 내용
- MARKET NEWS의 `스토리: ... · n/n 단계` 문구를 보라색 버튼으로 변경.
- 클릭하면 MARKET NEWS 카드 안이 아니라 중앙 `dialog` 모달로 표시.
- 우측 상단 X 버튼으로 닫기.
- 현재 뉴스가 속한 StoryArc의 1단계부터 현재 단계까지 제목/설명을 시간순으로 표시.
- 새로 생성되는 핵심 StoryArc 단계는 `market.worldNewsState.storyHistory`에 저장해 최근 뉴스 5개 제한과 별개로 보존.
- 중간 브리핑(interlude)은 에피소드 단계 기록에서 제외.
- 기존 저장 데이터에 과거 단계 기록이 없으면 세계관 DB의 StoryArc/Event를 기준으로 누락 단계를 복원 표시하고 복원 안내 문구를 붙임.
- 동일 StoryArc가 다시 시작될 수 있으므로 `storyRunId`로 실행 회차를 구분.

## 수정 파일
- `js/world-news.js`
- `js/market.js`
- `js/market-view.js`

`index.html`과 `css/style.css`는 수정하지 않았습니다. 스토리 모달 DOM과 필요한 스타일은 `market-view.js`가 한 번만 동적으로 생성합니다.

## QA
- `node --check` 3개 파일 통과.
- 1,025개 합성 포켓몬 데이터로 2,000 Tick 장기 시뮬레이션.
- 100 Tick 간격 `validMarket()` 검사 및 최종 검사 통과.
- StoryArc 단계 기록/중복 방지/순서 검사 통과.
- 완료된 4단계 StoryArc에서 1/4, 2/4, 3/4, 4/4 전체 조회 확인.
- JSON 저장/복원 후 `migrateNewsSystem()` + `validMarket()` 통과.
- 가격 범위/NaN 검사 통과.
