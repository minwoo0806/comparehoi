# HoI4 설계 도감

전차, 항공기, 함선의 카탈로그 스펙과 커스텀 설계 결과를 비교하는 정적 웹앱입니다.

## 실행

```powershell
npm run serve
```

브라우저에서 `http://localhost:4173`을 엽니다.

## 바닐라 데이터 추출

기본 Steam 경로에 HoI4가 설치되어 있다면:

```powershell
npm run extract:vanilla
```

다른 경로라면:

```powershell
node tools/extract-hoi4-data.js "D:\SteamLibrary\steamapps\common\Hearts of Iron IV"
```

파서는 `common/units/equipment`, `common/units/equipment/modules`, `common/ideas`, `localisation`을 읽어 `data/vanilla/*.json`을 갱신합니다.

## 현재 범위

- `Vanilla` 데이터셋은 실제 게임 파일 파서로 갱신할 수 있습니다.
- `Full DLC / Wiki seed` 데이터셋은 HoI4 위키의 공개 표와 설계 시스템 설명을 바탕으로 만든 시드 데이터입니다.
- 화면의 `C: 데이터셋 전환` 버튼 또는 입력창 밖에서 키보드 `C`를 누르면 Vanilla와 Full DLC 데이터셋이 전환됩니다.
- 국가 보너스 목록은 미합중국, 독일, 소련, 영국, 프랑스, 이탈리아, 일본만 제공합니다.
- 게임 내부 hidden modifier나 전투 엔진 전용 수식은 완전 재현 대신 추출 가능한 숫자 스탯 중심으로 정규화합니다.
