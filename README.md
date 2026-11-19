# 폭풍의 잔향 (가칭) — The Lost Storm 비공식 한국어 팬 번역

브라우저에서 바로 플레이하는 액션 RPG *The Lost Storm*의 **비공식 한국어 번역 포크**입니다.

이 저장소는 원작 [marginsystems/the-lost-storm](https://github.com/marginsystems/the-lost-storm)을 한국어로 옮긴 팬 번역입니다. 스토리 텍스트, 대화, UI/메뉴/HUD, 아이템·스킬·스킬 트리 설명, 게임 가이드 전체를 한국어로 옮겼습니다.

**플레이 (한국어판):** https://sigco3111.github.io/the-lost-storm-ko/

**원작 플레이:** https://github.com/marginsystems/the-lost-storm

## 주요 특징 (한국어판)

- 스토리, 대화, 퀘스트, 책/일지, UI, 메뉴, HUD 전체 한국어화
- 아이템 이름·옵션 설명, 스킬·스킬 트리·빌드 가이드 전체 한국어화
- 몬스터 무리 이름, 지역 이름, 힌트(키보드·터치), 로비/순위판 표기 한국어화
- 음향: 원작 오디오는 게임 내 사용만 허용된 라이선스라 저장소에 포함되지 않아,
  효과음·환경음 전체를 외부 샘플 없이 절차적으로 자체 합성한 사운드로 교체했습니다
  (생성 스크립트: `tools/audio-synth.py`).
- 제목은 원작과 구분하기 위해 "폭풍의 잔향 (가칭)"으로 붙였고, 원작 로고·브랜드
  표기는 사용하지 않습니다.

## 로컬에서 실행

```sh
npm install
npm run dev
```

## 기술 노트

- 원본 TypeScript 코드베이스를 포크해 문자열을 번역하고 Vite로 빌드합니다.
- 배포는 GitHub Pages(정적 산출물)로만 이루어지며, 별도 서버가 없습니다.
- 검증: 타입 검사(`tsc --noEmit`)와 프로덕션 빌드 통과, 배포 사이트의 랜딩·타이틀·
  이름 입력·캐릭터 선택·각성·실제 인게임 화면 캡처 확인, 게임 내 효과음의 실제
  재생(WebAudio) 확인.
- 개인정보·이용 조건: 이 한국어판은 자체 서버나 계정 시스템이 없으며 플레이 데이터는
  브라우저에만 저장됩니다(`privacy.html`, `terms.html` 참고). 원작의 약관을 그대로
  계승하지 않으며, 표시되는 안내 문구는 실제 동작과 일치합니다.

## 원작 및 크레딧

- 원작: [marginsystems/the-lost-storm](https://github.com/marginsystems/the-lost-storm) (Margin Systems)
- 이 번역은 원작자와 무관한 비공식 팬 번역입니다.
- 코드: MIT License (원작 동일, `LICENSE` 참고)
- 동봉된 에셋(모델·텍스처·폰트): 각 에셋의 라이선스를 따릅니다 (CC0 / CC-BY 4.0 / OFL).
  상세 크레딧: `ASSETS.md`
- 오디오: 원작 오디오를 대체하는 자체 합성 사운드. 외부 샘플을 쓰지 않은 순수 합성물로,
  저장소의 다른 파일과 마찬가지로 MIT 라이선스로 배포
