# 데이터 및 리소스 출처

- 확인 날짜: 2026-09-16 (Asia/Seoul)
- 데이터 원본: [PokéAPI 공식 저장소](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv)
- 수집 시점 원본 커밋: `39bc03a43df25a1898f5aa03cbc2a0abbeea30e8`
- 이용 정책: [PokéAPI API v2 / Fair Use Policy](https://pokeapi.co/docs/v2/#fairuse)
- 라이선스: [PokéAPI LICENSE.md](https://github.com/PokeAPI/pokeapi/blob/39bc03a43df25a1898f5aa03cbc2a0abbeea30e8/LICENSE.md)

## 수집 및 변환

개발 단계에서 PokéAPI의 공식 CSV 원본을 한 번 수집하여 `data/pokemon-data.json`으로 변환했다. 런타임에는 이 로컬 JSON만 읽는다.

- `pokemon_species.csv`: ID 1–1025의 identifier, generation_id, is_legendary, is_mythical.
- `pokemon_species_names.csv`: 한국어(local_language_id=3) 이름. 없으면 species identifier로 대체.
- `pokemon.csv`: 각 species의 is_default=1 포켓몬만 연결. 별도 폼을 추가하지 않음.
- `pokemon_types.csv`, `types.csv`: 기본 포켓몬의 타입을 slot 순서대로 연결.
- `languages.csv`: 한국어 언어 식별자 확인.
- mythical을 우선하고, 그다음 legendary, 나머지는 normal로 분류했다.

검증: 총 1,025 / 일반 931 / 전설 71 / 환상 23. 기대값과 차이 0. ID 1–1025 누락 및 중복 0. 타입은 각 1–2개, 세대는 1–9.

## 이미지·음원·폰트

초기 버전에서는 이미지 경로를 null로 유지했다. 이후 사용자가 이 대화에서 이미지 보류 조건의 예외 적용 및 공개된 포켓몬 이미지의 다운로드·적용을 명시적으로 승인하여 다음 리소스를 연결했다. CODEX_TASK.md 원문은 수정하지 않았다. 이 승인 자체를 이미지 저작권자의 이용 허락으로 간주하지 않는다.

- 슬롯·후보 머리 초상화: [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab), 커밋 `7f6ea6cc6892bbdd1376f803b3a1d7f376418895`의 `portrait/{전국도감번호 4자리}/Normal.png`. 1,025개 모두 `assets/images/slot/{id}.png`에 저장했다.
- 카드 전신 일러스트: [PokéAPI/sprites](https://github.com/PokeAPI/sprites), 커밋 `2ecb4eeacd5a1718621fc30f12772e3f60d830b9`의 `sprites/pokemon/other/official-artwork/{id}.png`. 1,025개 모두 `assets/images/card/{id}.png`에 저장했다.
- [PMDCollab 사용 정책](https://github.com/PMDCollab/SpriteCollab/blob/7f6ea6cc6892bbdd1376f803b3a1d7f376418895/README.md#submission-and-use-policy): 제출된 작업에 비상업적 사용 및 적절한 저작자 표시 조건을 명시한다. [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). 저장소에는 CHUNSOFT 공식 이미지도 포함되므로 모든 이미지를 팬아트 라이선스로 포괄하지 않는다.
- 초상화별 원본 크레딧을 `assets/images/slot/{id}-credits.txt`, 저작자 이름·연락처 목록을 `assets/images/slot/AUTHORS.txt`에 동봉했다. 이미지는 리사이즈·자르기·재생성 없이 원본 PNG 그대로 저장했고 화면에서만 축소/확대한다.
- [PokéAPI 이미지 라이선스](https://github.com/PokeAPI/sprites/blob/2ecb4eeacd5a1718621fc30f12772e3f60d830b9/LICENCE.txt): 이미지 저작권이 The Pokémon Company에 있음을 명시한다. 저장소의 CC0 문구를 해당 이미지의 별도 공개/상업 이용 허가로 해석하지 않는다. 원문을 `assets/images/card/LICENSE.txt`에 동봉했다.

JSON의 두 이미지 경로만으로 리소스를 교체할 수 있으며 로딩 실패 시 기존 번호/실루엣 placeholder를 유지한다. 미획득 도감 카드는 기존처럼 실루엣만 표시한다. 슬롯 후보는 회전 전에 이미지를 미리 로드하며 도감의 획득 카드 이미지는 지연 로드한다. 런타임 외부 이미지 요청은 없다. 외부 음원 및 폰트는 포함하지 않았고 효과음/배경음 ON/OFF 설정만 저장한다.

## 실행

`index.html`을 정적 파일 미리보기(HTTP)로 열면 된다. ES 모듈과 로컬 JSON fetch를 사용하므로 file:// 직접 열기는 지원하지 않는다. 앱 서버, API 서버, DB, 런타임 패키지는 없다. SPIN 비용은 0이며 외부 네트워크 요청도 없다. Git push 및 배포는 수행하지 않았다.

## 카드 치수 해석

상세 카드의 외곽 320×460px, 6px 테두리를 유지한다. 명세의 내부 영역 높이 합계(42+44+34+270+50=440px)에 테두리와 8px 세로 여백을 적용한다. 화면이 좁은 경우에만 카드와 격자를 축소한다.

## 원본 라이선스 고지

Copyright (c) © 2013–2023 Paul Hallett and PokéAPI contributors (https://github.com/PokeAPI/pokeapi#contributing). Pokémon and Pokémon character names are trademarks of Nintendo.

All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

* Neither the name of PokéAPI nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


## 검증 기록

2026-09-16, 로컬 정적 미리보기 + Microsoft Edge headless / Playwright로 확인했다. 테스트 도구는 임시 디렉터리에서만 실행했으며 프로젝트에 패키지나 추가 JavaScript 파일을 넣지 않았다.

- 데이터 1,025개, 일반 931 / 전설 71 / 환상 23, 연속 ID, 중복 없음, 타입 18종 검증 통과.
- 후보 수 1부터 각 등급 한도까지 4,200회 선별 및 8,400개 당첨/실패 결과 검증 통과. 단일 후보 실패 MISS, 후보 중복 없음 확인.
- 세 등급 실제 당첨 팝업, 당첨 뒤 획득 제외, 연속 클릭 차단, 마지막 카드 획득 후 COMPLETE 및 다른 슬롯 사용 확인.
- 실제 정지 순서 왼쪽 → 중앙 → 오른쪽 확인. 일반 동일 앞 두 칸 사례에서 약 1,901ms / 2,101ms / 2,652ms 측정(350ms 연장 포함).
- 새로고침 후 유지, 중복/잘못된 ID 정리, 손상 JSON 복구, 설정 저장, 초기화 취소/확인, 설정 유지 검증 통과.
- 전체/등급, 1–9세대, 18타입, 한글/영문/25/025 검색 및 복합 필터 확인.
- 미획득 정보 숨김, 미획득 안내, 320×460 상세 카드, 획득 카드로 이동/강조 확인.
- 이미지 디코딩 실패 시 placeholder 유지 확인.
- 1440 / 900 / 390 / 320px 화면: 도감 5 / 3 / 2 / 2열, 슬롯 세 칸 한 줄, 가로 넘침 없음 확인. 화면 캡처 시각 검토 완료.
- reduced-motion에서도 결과와 정지 순서 유지 확인.
- 정상 사용 전체 브라우저 테스트: Console error 0, pageerror 0.
- Git push 및 배포 미실행.

### 실제 이미지 적용 후 추가 검증

- 머리 초상화 1,025개 + 전신 일러스트 1,025개, 총 2,050개 PNG를 전부 디코딩해 파일 누락·손상·빈 이미지 0건 확인.
- 모든 JSON 레코드에 유효한 로컬 slotImage/cardImage 경로 연결. 대체 이미지가 필요한 포켓몬 0마리.
- 브라우저에서 후보 초상화 10개, 최종 릴 초상화 3개, 당첨 전신 카드, 도감 지연 로딩, 상세 팝업, No.1025 이미지 확인.
- 미획득 카드의 이미지 비공개 유지, 390px 모바일 가로 넘침 없음, 데스크톱·모바일 캡처 시각 검토 완료.
- 추가 브라우저 검증 결과 Console error 0 / pageerror 0.
