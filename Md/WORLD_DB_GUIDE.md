# Pokémon World DB v1

기준 GitHub main commit: `bc1d34cfdacea93e85403aa0fed8891c43a955a4`

## 목적

1~9세대 메인라인 게임 세계관을 **육하원칙 뉴스 이벤트 생성**에 사용할 수 있도록 구조화한 데이터베이스입니다.

- 애니메이션/만화/TCG 전용 설정은 기본 정사에서 제외했습니다.
- 리메이크와 DLC는 원작 세계관을 보충하거나 공식 후속 이야기인 경우 포함합니다.
- `Pokémon LEGENDS 아르세우스`는 과거의 히스이/신오 역사로 포함합니다.
- 모든 NPC·모든 도로·모든 건물의 완전 목록이 아니라, **세계관과 뉴스 스토리를 이해·생성하는 데 필요한 핵심 정사 데이터**를 우선 수록했습니다.

## 파일

- `data/world/pokemon-world-db.json` : 1~9세대를 한 파일로 합친 통합 DB
- `data/world/world-index.json` : 전체 색인, 전역 타임라인, 뉴스 시스템 연결 규칙
- `data/world/schema.json` : DB 구조와 정사 정책
- `data/world/sources.json` : 공식 Pokémon 출처 목록
- `data/world/gen1-world.json` ~ `gen9-world.json` : 세대별 세계관 데이터

## DB 구조

| DB | 목적 |
|---|---|
| Region | 세대·지방·시대의 기준축 |
| Character | 인물·직업·소속·역할 |
| Place | 도시·마을·시설·유적·자연지역 |
| Organization | 조직·학교·리그·범죄집단 |
| Event | 정사 사건 + 육하원칙 |
| StoryArc | 사건을 시간순 뉴스 스토리로 연결 |
| Timeline | 사건의 시간 순서 보장 |
| Legendary/SpecialSpecies | 전설·환상·울트라비스트·패러독스 연결 |
| Phenomenon/Artifact/Technology | 지방 고유 현상과 장치·기술 |
| Research/Economy/Ecology/Culture | 뉴스 소재를 넓히는 사회·생활 세계관 |
| Relationship | 인물·조직·포켓몬·장소 사이 관계 |
| NewsDomain | 가격효과와 연결할 의미 태그 |


## 현재 데이터 규모

```text
{
  "regions": 14,
  "characters": 191,
  "places": 237,
  "organizations": 48,
  "events": 42,
  "competitions": 38,
  "festivals": 14,
  "history": 13,
  "myths": 18,
  "legendaryPokemon": 94,
  "specialSpecies": 4,
  "phenomena": 29,
  "artifacts": 44,
  "technology": 38,
  "research": 30,
  "institutions": 39,
  "companies": 11,
  "economy": 45,
  "ecology": 39,
  "biomes": 64,
  "transport": 29,
  "culture": 44,
  "media": 13,
  "security": 29,
  "disasters": 25,
  "relationships": 26,
  "storyArcs": 19,
  "quests": 50,
  "regionalRules": 27,
  "timeline": 41
}
```

## Event DB 예시

```json
{
  "id": "g3-event-seafloor",
  "nameKo": "해저동굴 전설 포켓몬 각성",
  "sixW": {
    "who": ["마적 또는 아강", "마그마단 또는 아쿠아단"],
    "when": "해당 작품 메인 스토리 진행 중",
    "where": ["해저동굴"],
    "what": "조직 수장이 그란돈 또는 가이오가를 깨운다.",
    "why": "육지 또는 바다를 극단적으로 확대하려는 이상을 실현하기 위해서.",
    "how": "고대의 구슬과 전설 포켓몬의 힘을 이용한다."
  },
  "outcome": "통제할 수 없는 이상기후가 호연 전역에 발생한다."
}
```

## 뉴스 시스템에서의 사용 방향

`StoryArc → Event → 육하원칙 → 제목/설명 생성` 순서로 사용합니다.

가격 계산은 문장 자체를 읽어서 결정하지 않고, 나중에 각 Event에 다음 필드를 추가하여 별도로 계산하는 것을 권장합니다.

```text
pokemonDexIds
marketGrades
beneficiaryTypes
victimTypes
beneficiaryTags
victimTags
activityTags
impactStrength
```

예를 들어 `호연 해저동굴 사건`은 세계관상 악재라도 `가이오가/물타입 관심 증가`와 `불꽃타입 피해`를 별개의 시장효과로 줄 수 있습니다.

## 정사/출처 주의

세대별 파일의 `defaultSourceIds`와 각 레코드의 `sourceIds`가 `sources.json`을 참조합니다. 공식 홈페이지가 모든 세부 NPC·도로를 하나의 문서로 제공하지 않기 때문에, 이 DB는 공식 게임 사이트/공식 회고자료에 의해 확인되는 큰 구조를 우선으로 정리하고 게임 본편의 정사적 명칭과 관계를 구조화했습니다.
