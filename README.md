# 미국 주식 시세 대시보드

관심 종목의 현재가, 등락률, 거래량, **전일 대비 거래량 증감(%)** 을 보여주는 웹사이트입니다.
Node.js만 있으면 되고 설치할 패키지는 없습니다.

## 구성

```
stock-dashboard/
├── server.js          # 정적 파일 + /api/series (API 키를 숨기고 1분 캐시)
└── public/
    ├── index.html
    ├── style.css
    └── app.js         # 계산·표시·종목 추가/삭제·정렬
```

## 실행

1. Node.js 18 이상 설치
2. https://twelvedata.com 에서 무료 가입 후 API 키 발급
3. 실행

```bash
# macOS / Linux
TWELVE_DATA_API_KEY=발급받은키 node server.js

# Windows PowerShell
$env:TWELVE_DATA_API_KEY="발급받은키"; node server.js
```

4. 브라우저에서 http://localhost:3000

키 없이 `node server.js`만 실행하면 **데모 데이터**로 화면을 확인할 수 있습니다(상단에 "데모 데이터" 표시).

## 계산 방식

서버가 종목별로 최근 2거래일 일봉(`/time_series?interval=1day&outputsize=2`)을 가져옵니다.

- 현재가 = 오늘 봉의 close
- 등락률 = (현재가 − 전일 종가) ÷ 전일 종가
- 거래량 증감 = (오늘 거래량 − 전일 거래량) ÷ 전일 거래량

장중에는 오늘 거래량이 아직 누적 중이라, 개장 직후엔 거래량 증감이 크게 마이너스로 보이는 게 정상입니다.

## 무료 플랜 주의사항

- 무료 플랜은 **지연 시세**이고, 하루 800회 · 분당 8회 정도로 제한됩니다.
- 여러 종목을 한 번에 요청하면 종목 수만큼 크레딧이 들어갑니다. 그래서 종목은 7~8개 정도가 적당합니다.
- 서버가 60초 캐시를 하므로 방문자가 늘어도 호출 수는 늘지 않습니다. `CACHE_SECONDS=120` 처럼 늘리면 더 아낄 수 있어요.
- 무료 플랜은 **비상업적 용도**만 허용됩니다. 광고를 붙이거나 회사에서 쓰면 유료 플랜이 필요합니다.

## 설정 (환경변수)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `TWELVE_DATA_API_KEY` | 없음 | 없으면 데모 모드 |
| `PORT` | 3000 | 서버 포트 |
| `CACHE_SECONDS` | 60 | 종목별 캐시 시간 |

기본 종목은 `public/app.js`의 `DEFAULT_SYMBOLS`, 자동 갱신 주기는 `REFRESH_MS`에서 바꿀 수 있습니다.

## 배포

Render, Railway, Fly.io 같은 Node 호스팅에 폴더째 올리고 시작 명령을 `node server.js`로, 환경변수에 `TWELVE_DATA_API_KEY`를 넣으면 됩니다.
API 키를 `app.js`에 직접 넣지 마세요. 브라우저에서 누구나 볼 수 있습니다.
