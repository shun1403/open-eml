# open-eml

> `.eml` 파일을 브라우저에서 바로 열어 보고, 안에 든 첨부파일까지 모두 꺼내 받을 수 있는 이메일 뷰어

메일 서비스에서 이메일을 내보내면 `.eml` 파일로 저장됩니다. 그런데 막상 열어 보려면 Outlook 같은 메일 프로그램이 있어야 하고, 첨부파일 속에 또 첨부된 메일이나 압축 파일은 꺼내기가 번거롭습니다.

**open-eml**은 `.eml` 파일을 끌어다 놓기만 하면 본문과 첨부파일을 보여주고, 원하는 파일을 바로 내려받을 수 있게 해줍니다.

## 특징

- **설치 없이 브라우저에서 사용**
- **서버 업로드 없음.** 모든 처리는 내 컴퓨터의 브라우저 안에서만 이루어집니다. 메일 내용이 외부로 전송되지 않습니다.
- **한글 메일 지원.** EUC-KR / CP949 등으로 인코딩된 본문, 제목, 첨부파일 이름도 깨지지 않게 표시합니다.
- **안의 파일까지 전부.** 첨부된 메일(`.eml`), 압축 파일(`.zip`) 안의 파일도 트리 형태로 펼쳐 보고 내려받을 수 있습니다.
- **안전한 본문 보기.** HTML 본문의 스크립트는 실행되지 않으며, 추적용 외부 이미지는 기본으로 차단됩니다.

## 주요 기능

- [x] `.eml` 파일 드래그 앤 드롭 / 파일 선택 (여러 개 동시에)
- [x] 보낸 사람, 받는 사람, 참조, 제목, 날짜 표시
- [x] HTML / 텍스트 본문 보기, 본문 속 인라인 이미지 표시
- [x] 첨부파일 개별 다운로드 및 전체 ZIP 다운로드
- [x] 첨부된 `.eml` · `.zip` 내부 탐색
- [x] 이미지, PDF, 텍스트 첨부 미리보기
- [ ] Outlook `winmail.dat` 첨부 복원
- [x] 여러 메일 목록 검색
- [ ] 데스크톱 앱 (Windows / macOS / Linux)

## 시작하기

[Node.js](https://nodejs.org/) 20.19 이상이 필요합니다.

```bash
git clone https://github.com/shun1403/open-eml.git
cd open-eml
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 열고 `.eml` 파일을 끌어다 놓으면 됩니다.

### 명령어

| 명령어 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 배포용 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm test` | 테스트 실행 |
| `npm run typecheck` | 타입 검사 |

## 기술 스택

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vite.dev/)
- [postal-mime](https://github.com/postalsys/postal-mime): MIME 메일 파싱
- [DOMPurify](https://github.com/cure53/DOMPurify): HTML 본문 정화
- [fflate](https://github.com/101arrowz/fflate): ZIP 압축 / 해제

## 로드맵

1. **웹앱** (진행 중): 브라우저에서 동작하는 뷰어
2. **데스크톱 앱**: 웹앱을 기반으로 `.eml` 파일을 더블클릭해서 바로 열 수 있는 앱

## 기여하기

버그 제보와 기능 제안은 [Issues](https://github.com/shun1403/open-eml/issues)에 남겨 주세요. 메일이 제대로 열리지 않는 경우, 개인정보를 지운 샘플 `.eml` 파일을 함께 첨부해 주시면 큰 도움이 됩니다.
