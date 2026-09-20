# WORLD DB Integration Notes

## 현재 main 기준
- commit: `bc1d34cfdacea93e85403aa0fed8891c43a955a4`
- 기존 `js/market.js`, `js/market-view.js`는 수정하지 않았습니다.
- 이번 패키지는 세계관 DB만 추가합니다.

## 추천 경로
프로젝트 루트에 그대로 복사:

```text
data/world/
  world-index.json
  schema.json
  sources.json
  gen1-world.json
  ...
  gen9-world.json
Md/WORLD_DB_GUIDE.md
```

## 다음 구현 단계
1. `world-index.json` 로드
2. 현재 뉴스 스토리의 세대/지방 선택
3. `storyArcs` 중 하나 선택
4. 현재 stage의 Event 조회
5. Event의 sixW로 제목/설명 생성
6. 별도 MarketEffect에서 수혜/피해 계산

이번 버전에서는 기존 시장 가격변동 코드는 건드리지 않았습니다.
