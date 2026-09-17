# CODEX_TASK.md

# Pokémon Slot Collection Web Game — Implementation Specification

## 0. 실행 규칙

이 문서는 구현 명세다. 아래 규칙을 변경하거나 확장하지 않는다.

- 명시되지 않은 기능, 페이지, 확률, 시스템을 추가하지 않는다.
- React, Vue, Svelte, TypeScript, jQuery, Bootstrap, Tailwind, 외부 UI 프레임워크를 사용하지 않는다.
- 런타임 기술은 HTML + CSS + Vanilla JavaScript만 사용한다.
- 서버, 로그인, 회원가입, DB, 결제, 재화, 광고 시스템을 추가하지 않는다.
- SPIN 비용은 항상 0이다.
- Git push, 원격 저장소 변경, 배포를 실행하지 않는다.
- 외부 이미지/음원은 사용 권한이 확인되지 않으면 다운로드하거나 프로젝트에 포함하지 않는다.
- 구현에 필요한 판단값은 이 문서에 있는 값을 사용한다.
- 같은 역할의 시스템이나 파일을 중복 생성하지 않는다.
- 기능 구현 후 불필요한 코드, 중복 코드, 중복 이벤트 구독, 반복 DOM 검색을 제거한다.
- 애니메이션 중 반복 DOM 검색을 하지 않는다. 필요한 DOM 참조는 초기화 시 캐싱한다.
- SPIN 애니메이션은 `requestAnimationFrame` 기반으로 구현한다. 반복 `setInterval`을 사용하지 않는다.
- 획득 ID 존재 확인은 `Set`을 사용한다.
- 1,025개 데이터의 필터/검색/도감 갱신은 O(n) 이하로 처리한다.
- 중첩 전체 탐색으로 O(n²) 로직을 만들지 않는다.

---

# 1. 프로젝트 목적

한 페이지에서 다음 흐름을 실행하는 카드 수집 웹게임을 구현한다.

`HOME → SLOT → SPIN → 결과 → 카드 획득 → COLLECTION`

슬롯은 3종류다.

1. 일반 슬롯
2. 전설 슬롯
3. 환상 슬롯

SPIN 결과 3칸이 같은 포켓몬이면 해당 포켓몬 카드를 획득한다.

2칸만 같거나 3칸이 모두 다르면 실패다.

이미 획득한 포켓몬은 다시 획득할 수 없다.

---

# 2. 런타임 기술

- HTML5
- CSS3
- Vanilla JavaScript
- `localStorage`
- SPA 방식 단일 페이지
- PC / 태블릿 / 모바일 반응형

런타임에서 PokéAPI에 매번 요청하지 않는다.

PokéAPI 데이터는 개발 단계에서 한 번 수집하여 로컬 `data/pokemon-data.json`으로 저장한다.

---

# 3. 파일 구조

다음 구조를 사용한다.

```text
/
├─ index.html
├─ css/
│  └─ style.css
├─ js/
│  ├─ app.js
│  ├─ data.js
│  ├─ slot.js
│  └─ collection.js
├─ data/
│  └─ pokemon-data.json
├─ assets/
│  ├─ images/
│  │  ├─ slot/
│  │  ├─ card/
│  │  └─ ui/
│  └─ audio/
└─ DATA_SOURCES.md
```

역할:

- `app.js`
  - 앱 초기화
  - HOME / SLOT / COLLECTION / SETTINGS 화면 전환
  - localStorage 읽기/저장
  - 효과음/배경음 설정
  - 초기화 처리
- `data.js`
  - `pokemon-data.json` 로드
  - 데이터 검증
  - 타입 한글명/타입 색상 제공
- `slot.js`
  - 일반/전설/환상 슬롯 설정
  - 후보 선별
  - 당첨 판정
  - 실패 결과 생성
  - 슬롯 회전 애니메이션
  - 당첨 연출
- `collection.js`
  - 카드 렌더링
  - 수집률
  - 전체/일반/전설/환상 탭
  - 세대 필터
  - 타입 필터
  - 검색
  - 카드 상세 팝업

기능을 위해 추가 JavaScript 파일을 만들지 않는다.

---

# 4. 데이터 범위

전국도감 번호 `1~1025`만 사용한다.

폼, 메가진화, 지역 형태, 거다이맥스 형태 등을 별도 포켓몬 수로 추가하지 않는다.

총 포켓몬 수는 반드시 1,025다.

프로젝트 분류 기대값:

| 등급 | 수 |
|---|---:|
| 일반 | 931 |
| 전설 | 71 |
| 환상 | 23 |
| 합계 | 1025 |

PokéAPI species 기준 분류:

```text
is_mythical === true
→ mythical

else if is_legendary === true
→ legendary

else
→ normal
```

데이터 생성 후 931 / 71 / 23을 검증한다.

검증값이 다르면 임의로 숫자를 맞추지 않는다.
`DATA_SOURCES.md`에 실제 수와 차이를 기록한다.

---

# 5. pokemon-data.json 구조

각 레코드는 다음 필드를 가진다.

```json
{
  "id": 25,
  "dexNumber": 25,
  "nameKo": "피카츄",
  "nameEn": "pikachu",
  "generation": 1,
  "types": ["electric"],
  "grade": "normal",
  "slotImage": null,
  "cardImage": null
}
```

규칙:

- `id`: 전국도감 번호
- `dexNumber`: 전국도감 번호
- `nameKo`: PokéAPI 한국어 이름
- 한국어 이름이 없으면 영어 이름 사용
- `generation`: 1~9
- `types`: 1개 또는 2개
- `grade`: `normal`, `legendary`, `mythical`
- `slotImage`: 사용 권한 확인된 슬롯 이미지 경로. 없으면 `null`
- `cardImage`: 사용 권한 확인된 카드 전신 이미지 경로. 없으면 `null`

---

# 6. 외부 데이터 / 이미지 규칙

PokéAPI는 데이터 원본으로만 사용한다.

데이터 수집 대상:

- 전국도감 번호
- 한국어/영어 이름
- 세대
- 타입
- `is_legendary`
- `is_mythical`

이미지 규칙:

- 공개/포트폴리오 사용 권한이 명확하게 확인되지 않은 Pokémon 이미지, 팬아트, 카드 이미지를 프로젝트에 포함하지 않는다.
- 검색 결과의 이미지를 임의 다운로드하지 않는다.
- 사용 권한이 불명확하면 `slotImage`, `cardImage`를 `null`로 유지한다.
- 이미지가 `null`이면 UI는 깨지지 않아야 한다.
- 슬롯 이미지가 없으면 도감 번호가 들어간 원형 placeholder를 사용한다.
- 카드 이미지가 없으면 일반적인 몬스터 실루엣 placeholder를 사용한다.
- 권리 문제를 피하기 위해 특정 Pokémon을 그대로 재현한 신규 초상화를 자동 생성하지 않는다.
- 데이터/이미지 교체는 JSON의 이미지 경로만 변경하면 가능해야 한다.
- 자동 배포하지 않는다.

`DATA_SOURCES.md`에 다음을 기록한다.

- 데이터 출처
- 확인한 이용 조건/라이선스 링크
- 확인 날짜
- 이미지 사용 여부
- 이미지 사용을 보류했다면 그 이유

---

# 7. localStorage

저장 키:

```text
pokemonSlotSaveV1
```

저장 구조:

```json
{
  "version": 1,
  "collectedIds": [],
  "soundEnabled": true,
  "musicEnabled": true
}
```

규칙:

- `collectedIds`만 수집 상태로 사용한다.
- 수집률 숫자를 별도로 저장하지 않는다.
- 수집률은 `collectedIds`와 데이터에서 매번 계산한다.
- `Set<number>`로 변환하여 중복을 방지한다.
- 새로고침/재접속 후 유지한다.
- JSON이 손상되어 파싱되지 않으면 기본값으로 복구한다.
- 존재하지 않는 ID는 로드 시 제거한다.
- `collectedIds`의 중복 ID는 제거한다.
- 초기화는 `collectedIds`만 빈 배열로 만든다.
- 초기화해도 `soundEnabled`, `musicEnabled`는 유지한다.

---

# 8. 슬롯 설정

고정 설정:

```js
normal = {
  total: 931,
  candidateLimit: 10,
  winRate: 0.50
}

legendary = {
  total: 71,
  candidateLimit: 7,
  winRate: 0.20
}

mythical = {
  total: 23,
  candidateLimit: 4,
  winRate: 0.10
}
```

전체 당첨률은 남은 포켓몬 수와 관계없이 유지한다.

---

# 9. SPIN 공통 알고리즘

SPIN 1회는 정확히 다음 순서로 실행한다.

```text
1. 현재 슬롯 등급 확인
2. 현재 등급의 전체 포켓몬에서 획득 ID 제외
3. remaining 목록 생성
4. remaining.length === 0이면 SPIN 중단 + COMPLETE 표시
5. candidateCount = min(candidateLimit, remaining.length)
6. remaining에서 중복 없이 candidateCount마리 랜덤 선별
7. 이번 SPIN 후보 UI 갱신
8. Math.random() < winRate 로 당첨 여부 결정
9. 당첨/실패 결과 3칸 생성
10. isSpinning = true
11. 슬롯 회전 애니메이션 실행
12. 왼쪽 → 중앙 → 오른쪽 결과 표시
13. 당첨이면 당첨 연출 실행
14. 당첨 포켓몬 ID를 collectedIds에 1회 저장
15. COLLECTION / 수집률 / 남은 카드 수 갱신
16. isSpinning = false
```

SPIN 중 `SPIN` 버튼 재입력을 무시한다.

SPIN 중 슬롯 종류 변경도 막는다.

---

# 10. 후보 선별

획득하지 않은 포켓몬만 대상이다.

후보는 한 SPIN 안에서 중복되지 않는다.

예:

```text
일반 미획득 921마리
candidateLimit = 10
→ 921마리 중 서로 다른 10마리
```

후보 선별은 전체 배열을 무작위 정렬하지 않는다.

다음 중 하나로 처리한다.

- 부분 Fisher-Yates
- 중복 없는 O(n) 이하 선별

---

# 11. 당첨 확률

## 일반

후보 10마리일 때:

```text
전체 당첨 = 50%
특정 후보 1마리 당첨 = 50 / 10 = 5%
```

## 전설

후보 7마리일 때:

```text
전체 당첨 = 20%
특정 후보 1마리 당첨 = 20 / 7 ≈ 2.857142%
```

## 환상

후보 4마리일 때:

```text
전체 당첨 = 10%
특정 후보 1마리 당첨 = 10 / 4 = 2.5%
```

당첨 판정 후 후보 중 1마리를 균등 확률로 선택한다.

후보 수가 감소하면 개별 포켓몬의 당첨 확률만 올라간다.

예:

```text
일반 후보 9
전체 50%
각 후보 ≈ 5.555556%

일반 후보 5
전체 50%
각 후보 = 10%

일반 후보 1
전체 50%
해당 후보 = 50%
```

---

# 12. 당첨 결과 생성

당첨이면:

```text
후보 중 랜덤 1마리 선택
→ [A, A, A]
```

세 슬롯이 모두 같은 포켓몬이어야 한다.

당첨 포켓몬은 애니메이션 종료 후 한 번만 수집 상태에 추가한다.

---

# 13. 실패 결과 생성

후보가 2마리 이상이면 후보에서 3칸을 각각 균등 랜덤 선택한다.

단:

```text
[A, A, A]
```

형태는 허용하지 않는다.

3칸이 모두 같으면 마지막 칸을 다른 후보로 교체한다.

허용:

```text
[A, B, C]
[A, A, B]
[A, B, A]
[B, A, A]
```

실패에서 2개 일치는 아무 효과가 없다.

## 후보가 1마리만 남은 예외

전체 당첨률을 유지해야 하므로 실패 판정에서 `[A, A, A]`를 표시하지 않는다.

후보 1마리 + 실패 판정이면 슬롯 한 칸 이상에 수집 대상이 아닌 고정 `MISS` 심볼을 사용한다.

가능한 실패 결과 예:

```text
[A, A, MISS]
[A, MISS, A]
[MISS, A, A]
```

`MISS`는 포켓몬 데이터가 아니며 도감에 저장되지 않는다.

---

# 14. 슬롯 회전 방향

세 슬롯 모두 세로 방향으로 위에서 아래로 흐르는 것처럼 표시한다.

SPIN 시작 시 3개 슬롯이 동시에 움직인다.

흐름:

```text
동시 시작
→ 급가속
→ 최고 속도
→ 감속
→ 왼쪽 정지
→ 중앙 정지
→ 오른쪽 정지
```

슬롯 이미지가 빠르게 지나갈 때 Motion Blur 효과를 사용한다.

감속 시 Blur를 제거한다.

정지 시 각 슬롯에 작은 Bounce를 적용한다.

---

# 15. 슬롯 회전 시간

기본 정지 시간:

## 일반

```text
왼쪽: 1900ms
중앙: 2100ms
오른쪽: 2300ms
```

## 전설

```text
왼쪽: 2100ms
중앙: 2350ms
오른쪽: 2600ms
```

## 환상

```text
왼쪽: 2250ms
중앙: 2525ms
오른쪽: 2800ms
```

각 슬롯:

- 처음 350ms: 가속
- 마지막 500ms: 감속
- 그 사이: 최고 속도

첫 번째와 두 번째 최종 결과가 같으면 오른쪽 슬롯 정지 시간을 `+350ms` 추가한다.

이 추가 시간은 연출만 변경한다.

당첨 확률과 최종 결과는 변경하지 않는다.

---

# 16. 슬롯 정지 Bounce

각 슬롯 정지 시:

```text
최종 위치보다 아래로 8px
→ 위로 5px
→ 0px
```

전체 Bounce 시간:

```text
220ms
```

---

# 17. 당첨 카드 연출 공통 규칙

세 등급 모두 카드가 처음부터 완성된 형태로 바로 등장하지 않는다.

공통 흐름:

```text
3개 일치
→ 등급별 포켓몬 등장 연출
→ 당첨 포켓몬 전신 공개
→ 카드 프레임 생성
→ 포켓몬 전신이 카드의 일러스트 영역으로 이동/축소
→ 카드 앞면 완성
→ 도감번호 / 이름 / 타입 / 등급 표시
→ NEW CARD 또는 등급별 제목 표시
```

금지:

- 카드 뒤집기 금지
- `rotateX`, `rotateY`를 이용한 Flip 금지
- 카드 뒷면 생성 금지
- 카드가 회전하면서 앞면으로 바뀌는 연출 금지

카드는 생성되는 순간부터 앞면 방향을 유지한다.

---

# 18. 일반 슬롯 당첨 연출

목표 시간:

```text
약 2000ms
```

순서:

```text
1. 세 슬롯 1.04배 확대 + Bounce — 160ms
2. 하늘색/민트 Glow 표시 — 220ms
3. 작은 별 파티클 표시 — 350ms
4. 배경 오버레이 opacity 0.20 적용 — 180ms
5. 당첨 포켓몬 전신을 화면 중앙에 등장
   scale 0.70 → 1.08 → 1.00
   translateY 18px → 0
   duration 360ms
6. 포켓몬 전신을 위로 10px 이동 후 원위치시키는 작은 점프 — 260ms
7. 포켓몬 뒤에 카드 프레임 생성
   opacity 0 → 1
   scale 0.94 → 1.00
   duration 280ms
8. 포켓몬 전신을 카드 일러스트 영역으로 이동/축소 — 380ms
9. 도감번호 / 이름 / 타입 / 등급을 80ms 간격으로 순차 표시
10. NEW CARD 표시 — 220ms
```

일반 연출에서는 화면 흔들림을 사용하지 않는다.

---

# 19. 전설 슬롯 당첨 연출

목표 시간:

```text
약 3300ms
```

순서:

```text
1. 슬롯 결과 확정 후 180ms 정지
2. 화면 오버레이를 300ms 동안 opacity 0.45까지 어둡게
3. 슬롯 중앙에 금빛 균열 형태 효과 생성 — 420ms
4. 금빛 Glow 확산 — 300ms
5. 화면 컨테이너를 좌우 최대 4px로 흔들기 — 240ms
6. 당첨 포켓몬 전신 실루엣 중앙 등장 — 300ms
7. 실루엣 뒤에 큰 금빛 원형 Glow 생성 — 320ms
8. 120ms Flash
   Flash 최대 opacity 0.55
9. 실루엣을 실제 전신 모습으로 공개 — 360ms
10. 포켓몬 뒤에 카드 프레임 생성 — 300ms
11. 포켓몬 전신을 카드 일러스트 영역으로 이동/축소 — 450ms
12. 카드 외곽에 금빛 Glow 활성화 — 220ms
13. 도감번호 / 이름 / 타입 / 등급을 80ms 간격으로 순차 표시
14. LEGENDARY 표시 — 260ms
```

Flash는 순백색 화면으로 완전히 덮지 않는다.

---

# 20. 환상 슬롯 당첨 연출

목표 시간:

```text
약 4000ms
```

순서:

```text
1. 슬롯 결과 확정 후 200ms 정지
2. 화면 오버레이를 400ms 동안 opacity 0.38까지 어둡게
3. 화면 주변에 작은 라벤더/연핑크 별빛 생성 — 450ms
4. 별빛을 중앙으로 천천히 이동
5. 중앙에 빛나는 구체 생성
   scale 0.30 → 1.00
   duration 500ms
6. 구체 안에 당첨 포켓몬 전신 실루엣 표시 — 380ms
7. 실루엣 주변을 작은 빛 입자가 회전 — 500ms
8. 실루엣을 실제 전신 모습으로 천천히 공개 — 450ms
9. 화면 중앙에 원형 물결 효과 1회 확산 — 400ms
10. 포켓몬 뒤에 카드 프레임을 선이 그려지는 방식으로 생성 — 480ms
11. 포켓몬 전신을 카드 일러스트 영역으로 이동/축소 — 500ms
12. 카드 표면에 라벤더/연핑크 홀로그램 이동 효과 활성화
13. 도감번호 / 이름 / 타입 / 등급을 100ms 간격으로 순차 표시
14. MYTHICAL DISCOVERED 표시 — 280ms
```

환상 연출에서는 화면 흔들림과 Flash를 사용하지 않는다.

---

# 21. 실패 연출

실패에서는 당첨용 Glow, Flash, 카드 생성, 포켓몬 전신 등장, 파티클을 실행하지 않는다.

오른쪽 슬롯 정지 후 결과를 400ms 유지한다.

그 후 SPIN 버튼을 다시 활성화한다.

---

# 23. 카드 정보

획득 카드에는 정확히 다음 정보를 표시한다.

1. 전국도감 번호
2. 포켓몬 이름
3. 속성 타입
4. 등급: 일반 / 전설 / 환상
5. 속성 기반 외곽 테두리
6. 전신 일러스트 또는 placeholder

추가 능력치, HP, 공격력, 설명문, 기술을 넣지 않는다.

---

# 23. 카드 상세 UI

기본 상세 카드 크기:

```text
width: 320px
height: 460px
border-width: 6px
border-radius: 22px
```

배치:

```text
상단 왼쪽: No.###
상단 오른쪽: 등급 배지
중앙 상단: 포켓몬 이름
이름 아래: 타입 배지
중앙: 전신 일러스트
하단: 타입 아이콘/타입명
```

영역:

```text
번호/등급: 42px
이름: 44px
타입 배지: 34px
일러스트 영역: 270px
하단 타입: 50px
나머지: 내부 간격
```

전신 이미지:

```css
object-fit: contain;
max-width: 90%;
max-height: 90%;
```

---

# 24. 타입 색상

다음 색상을 고정 사용한다.

```text
normal   #A8A29E
fire     #F47B5A
water    #5BA9E6
electric #F2C94C
grass    #6FCF7B
ice      #7FDDE3
fighting #C96A5B
poison   #A875C7
ground   #CDAA6A
flying   #8EB8E8
psychic  #EA7FA5
bug      #9DBB4A
rock     #B69A67
ghost    #7F78B8
dragon   #6E72D8
dark     #625B67
steel    #9AA7B3
fairy    #ECA6D3
```

한글 라벨:

```text
normal   일반
fire     불꽃
water    물
electric 전기
grass    풀
ice      얼음
fighting 격투
poison   독
ground   땅
flying   비행
psychic  에스퍼
bug      벌레
rock     바위
ghost    고스트
dragon   드래곤
dark     악
steel    강철
fairy    페어리
```

---

# 25. 카드 테두리

타입 1개:

```text
해당 타입 색상 1개
```

타입 2개:

```text
135deg linear-gradient
첫 타입 0~45%
전환 45~55%
두 번째 타입 55~100%
```

둥근 모서리를 유지한다.

---

# 26. 등급별 카드 효과

## 일반

- 타입 테두리
- 약한 그림자

## 전설

- 타입 테두리
- 금빛 외부 Glow
- 작은 반짝임

## 환상

- 타입 테두리
- 라벤더/연핑크 Glow
- 작은 빛 입자
- 카드 표면에 느린 홀로그램 이동 효과

카드 구조와 정보 위치는 등급별로 변경하지 않는다.

---

# 27. 당첨 카드 팝업

현재 SLOT 화면 위에 modal로 표시한다.

구성:

```text
NEW CARD! 또는 등급별 제목

[320 x 460 카드]

[계속 SPIN] [도감 보기]
```

- `계속 SPIN`: 팝업 닫기 + 현재 슬롯 유지
- `도감 보기`: COLLECTION으로 이동 + 방금 획득한 카드가 보이도록 스크롤/강조

페이지 새로고침을 하지 않는다.

---

# 28. COLLECTION 구조

상단:

```text
COLLECTION
현재 수집 수 / 전체 수
진행률 바
```

탭:

```text
전체
일반
전설
환상
```

필터:

```text
세대: 전체 / 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9
타입: 전체 / 18개 타입
```

검색:

- 한국어 이름
- 영어 이름
- 도감 번호

입력 즉시 결과를 갱신한다.

기본 정렬:

```text
dexNumber 오름차순
```

---

# 29. COLLECTION 수집률

전체:

```text
획득 수 / 1025
```

일반 탭:

```text
획득 일반 수 / 931
```

전설 탭:

```text
획득 전설 수 / 71
```

환상 탭:

```text
획득 환상 수 / 23
```

진행률:

```text
획득 수 / 해당 전체 수 * 100
```

소수점 1자리까지 표시한다.

예:

```text
235 / 1025
22.9%
```

---

# 30. 획득 카드 표시

획득 카드는 실제 카드 디자인을 축소하여 표시한다.

Desktop 기본 Collection 카드:

```text
200 x 288px
```

Hover:

```text
translateY(-6px)
scale(1.02)
duration 180ms
```

클릭:

- 배경 어둡게
- 320 x 460 상세 카드 중앙 표시

---

# 31. 미획득 카드 표시

미획득 카드:

```text
No.025
???
검은/회색 실루엣
미획득
```

숨길 정보:

- 이름
- 속성

공개:

- 도감 번호

미획득 카드 클릭 시:

```text
아직 획득하지 않은 포켓몬입니다.
```

표시.

---

# 32. HOME

구성:

```text
게임 제목
"슬롯을 돌려 카드를 수집하세요."
[SLOT START]
현재 수집률
획득 수 / 1025
진행률 바
```

`SLOT START` 클릭:

```text
SLOT 화면으로 전환
```

---

# 33. SLOT 화면

상단 슬롯 선택:

```text
[일반] [전설] [환상]
```

중앙:

```text
슬롯 이름
3칸 슬롯
SPIN 버튼
당첨 확률
남은 카드 수
현재 후보 목록
```

당첨 확률 표시값:

```text
일반 50%
전설 20%
환상 10%
```

현재 후보 목록은 원형 썸네일로 표시한다.

이미지가 없으면 도감 번호 placeholder를 표시한다.

SPIN 시작 전에 후보가 새로 선택되고 화면에 즉시 표시된다.

---

# 34. COMPLETE

해당 등급의 미획득 포켓몬이 0이면:

```text
COMPLETE
모든 카드를 수집했습니다.
```

표시.

해당 슬롯의 SPIN 버튼을 비활성화한다.

다른 슬롯은 계속 사용 가능하다.

---

# 35. SETTINGS

구성:

```text
효과음 [ON/OFF]
배경음악 [ON/OFF]

[수집 데이터 초기화]
```

권리 확인된 오디오가 없으면 외부 음원을 추가하지 않는다.

오디오 파일이 없는 상태에서도 ON/OFF 설정값 저장 기능은 정상 동작해야 한다.

---

# 36. 초기화

`수집 데이터 초기화` 클릭 시 바로 삭제하지 않는다.

확인 modal:

```text
정말 모든 카드 수집 기록을 초기화하시겠습니까?

초기화한 데이터는 복구할 수 없습니다.

[취소] [초기화]
```

최종 초기화:

```text
collectedIds = []
```

그 후 즉시:

```text
전체 0 / 1025
일반 0 / 931
전설 0 / 71
환상 0 / 23
```

상태로 갱신한다.

모든 포켓몬이 다시 슬롯 후보가 된다.

완료 메시지:

```text
수집 데이터가 초기화되었습니다.
```

효과음/배경음 설정은 유지한다.

---

# 37. 화면 구성

상단 Navigation:

```text
HOME
SLOT
COLLECTION
SETTINGS
```

한 번에 한 화면만 표시한다.

새 HTML 페이지로 이동하지 않는다.

화면 전환:

```text
opacity 0 → 1
translateY(10px) → 0
duration 260ms
```

SETTINGS도 별도 페이지 이동 없이 동일한 화면 전환 방식을 사용한다.

---

# 38. 전체 색상

전체 테마는 파스텔 장난감/스티커북 UI다.

고정 색상:

```text
background-start #FDECF4
background-end   #FFF7FB

panel            #FFFDFC
panel-soft       #FFF9FC

text-primary     #3A3042
text-secondary   #857787

pink-primary     #EE86AE
pink-hover       #DE6D9A

spin-start       #F07FA9
spin-end         #A985E8
```

메인 배경:

```text
linear-gradient(180deg, #FDECF4, #FFF7FB)
```

---

# 39. 슬롯별 색상

## 일반

```text
sky  #73CFE8
mint #8DE0C1
```

## 전설

```text
cream  #FFF1C7
gold   #F4C85A
orange #F2A65A
```

## 환상

```text
lavender #B69AE8
purple   #A782E3
pink     #F0B5DA
```

---

# 40. 패널 디자인

공통 패널:

```text
background: #FFFDFC
border-radius: 24px
box-shadow: 0 10px 30px rgba(90, 60, 80, 0.12)
```

배경 장식:

- 작은 별
- 작은 원
- 작은 반짝이

장식 opacity:

```text
0.08 ~ 0.14
```

배경 장식은 클릭 이벤트를 받지 않는다.

---

# 41. 버튼

일반 버튼:

```text
height: 52px
border-radius: 16px
font-weight: 700
```

SPIN 버튼:

```text
width: 200px
height: 64px
border-radius: 20px
background: linear-gradient(135deg, #F07FA9, #A985E8)
```

Hover:

```text
scale(1.03)
duration 160ms
```

Active:

```text
scale(0.97)
duration 100ms
```

disabled:

```text
opacity 0.5
pointer-events none
```

---

# 42. 슬롯머신 외형

카지노 기계 형태를 사용하지 않는다.

장난감/캡슐 머신 형태로 구현한다.

- 두꺼운 둥근 외곽 프레임
- 슬롯 창 3개
- 각 슬롯 창 둥근 모서리
- 슬롯 중앙에 선택 라인 표시
- 하단 중앙에 큰 SPIN 버튼
- 각 등급 색상을 프레임에 적용

---

# 43. 폰트

Sans-serif 계열만 사용한다.

외부 폰트를 사용하려면 라이선스를 확인한다.

외부 폰트를 사용하지 못하면 시스템 폰트 스택:

```css
font-family:
  "Pretendard",
  "Noto Sans KR",
  "Apple SD Gothic Neo",
  "Malgun Gothic",
  sans-serif;
```

제목:

```text
font-weight 800
```

버튼:

```text
font-weight 700
```

본문:

```text
font-weight 400~600
```

---

# 44. 공통 UI 애니메이션

화면 전환:

```text
260ms
```

버튼 Hover:

```text
160ms
```

버튼 Active:

```text
100ms
```

카드 Hover:

```text
180ms
```

카드 프레임 생성 기본 시간:

```text
280~480ms
```

슬롯 Bounce:

```text
220ms
```

사용자가 `prefers-reduced-motion: reduce`를 설정한 경우:

- 슬롯 이동 결과는 유지
- UI Fade/Glow/Particle/Bounce 시간을 최소화
- 결과/확률 로직은 변경하지 않는다

---

# 45. 반응형

## Desktop

```text
>= 1200px
COLLECTION 4~5열
```

CSS Grid `auto-fit/minmax`를 사용하여 최대 5열까지 표시한다.

## Tablet

```text
768px ~ 1199px
COLLECTION 3열
```

## Mobile

```text
< 768px
COLLECTION 2열
```

모바일에서도 슬롯 3칸은 한 줄을 유지한다.

화면 폭에 맞게 슬롯 전체 크기를 축소한다.

가로 스크롤을 만들지 않는다.

---

# 46. 검색 / 필터 성능

COLLECTION 필터는 한 번의 O(n) 패스로 처리한다.

적용 조건:

```text
grade
generation
type
search
```

모든 조건을 동시에 만족하는 항목만 표시한다.

검색은 trim + 소문자 변환 후 비교한다.

도감 번호 검색 예:

```text
25
025
```

둘 다 No.025를 찾을 수 있어야 한다.

---

# 47. 상태 동기화

카드 획득 직후 다음 UI를 같은 이벤트 흐름에서 갱신한다.

- localStorage
- HOME 전체 수집률
- SLOT 남은 카드 수
- COLLECTION 카드 상태
- COLLECTION 진행률

페이지 새로고침으로 상태를 맞추지 않는다.

---

# 48. 금지 구현

다음을 하지 않는다.

- 슬롯 3칸을 독립 랜덤으로 돌린 뒤 우연히 3개가 같으면 당첨 처리
- 전체 당첨률을 후보 수에 따라 낮추기
- 이미 획득한 포켓몬을 후보로 다시 사용
- 중복 카드 획득
- SPIN 중 중복 SPIN
- SPIN 중 슬롯 종류 변경
- 1025개 데이터를 매 실행마다 PokéAPI에서 다시 요청
- 사용 권한 불명 이미지를 자동 다운로드
- 사용자가 요청하지 않은 재화/상점/로그인/랭킹/업적 추가
- 여러 HTML 페이지 생성
- 프레임워크 추가
- 불필요한 npm 패키지 추가
- Git push
- 자동 배포

---

# 49. 필수 테스트

구현 후 아래를 직접 확인한다.

## 데이터

- 총 데이터 1025
- 일반 931
- 전설 71
- 환상 23
- ID 중복 없음
- 전국도감 번호 1~1025 누락 없음

## 슬롯

- 일반 전체 당첨 설정 50%
- 전설 전체 당첨 설정 20%
- 환상 전체 당첨 설정 10%
- 당첨 결과는 항상 3개 동일
- 실패 결과는 항상 3개 완전 동일이 아님
- 후보 1마리 + 실패에서 MISS 심볼 동작
- 획득 포켓몬 재등장 없음
- SPIN 중 재입력 차단
- 왼쪽 → 중앙 → 오른쪽 순서 정지

## 저장

- 카드 획득 후 새로고침해도 유지
- localStorage 중복 ID 없음
- 잘못된 localStorage JSON에서 앱이 중단되지 않음

## 도감

- 전체/일반/전설/환상 필터
- 1~9세대 필터
- 18타입 필터
- 이름 검색
- 번호 검색
- 미획득 카드 정보 숨김
- 카드 상세 팝업

## 초기화

- 확인 없이 삭제되지 않음
- 초기화 후 수집 0
- 설정값 유지
- 모든 포켓몬 후보 복귀

## 반응형

- Desktop 정상
- Tablet 정상
- Mobile 2열
- Mobile 슬롯 3칸 한 줄 유지
- 가로 스크롤 없음

## 오류

- 브라우저 Console error 0
- 존재하지 않는 이미지에서 UI 깨짐 없음
- 빠른 연속 클릭으로 중복 저장 없음

---

# 50. 완료 조건

다음 조건을 모두 만족하면 작업 완료다.

1. HOME / SLOT / COLLECTION / SETTINGS 모두 동작
2. 일반 / 전설 / 환상 슬롯 모두 동작
3. 50% / 20% / 10% 고정 전체 당첨률 로직 구현
4. 획득 포켓몬 제외 로직 구현
5. 후보 수 감소 예외처리 구현
6. 후보 1마리 실패 MISS 처리 구현
7. 슬롯 순차 정지 + Bounce 구현
8. 등급별 당첨 연출 구현
9. 카드 UI 구현
10. 타입 단일/복합 테두리 구현
11. COLLECTION 검색/필터/상세 구현
12. localStorage 저장 구현
13. 초기화 구현
14. 반응형 구현
15. 이미지가 없어도 placeholder로 전체 기능 동작
16. Console error 0
17. `DATA_SOURCES.md` 작성
18. Git push 및 배포 미실행

작업 완료 후 사용자에게 다음만 보고한다.

```text
구현 완료 항목
생성/수정 파일
데이터 검증 결과
테스트 결과
외부 데이터/리소스 사용 여부
남은 제한사항
```

불필요한 장문 설명을 추가하지 않는다.
