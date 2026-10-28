# open-eml

> 메일 파일(`.eml`, `.msg`, `.mbox`)을 브라우저에서 바로 열어 보고, 안에 든 첨부파일까지 모두 꺼내 받을 수 있는 이메일 뷰어

메일 서비스에서 이메일을 내보내면 `.eml`, Outlook에서 저장하면 `.msg`, Gmail이나 Thunderbird에서 백업하면 `.mbox` 파일이 됩니다. 그런데 막상 열어 보려면 메일 프로그램이 있어야 하고, 첨부파일 속에 또 첨부된 메일이나 압축 파일은 꺼내기가 번거롭습니다.

**open-eml**은 메일 파일을 끌어다 놓기만 하면 본문과 첨부파일을 보여주고, 원하는 파일을 바로 내려받을 수 있게 해줍니다.

## 특징

- **설치 없이 브라우저에서 사용**
- **서버 업로드 없음.** 모든 처리는 내 컴퓨터의 브라우저 안에서만 이루어집니다. 메일 내용이 외부로 전송되지 않습니다.
- **한글 메일 지원.** EUC-KR / CP949로 된 본문, 제목, 첨부파일 이름과 한국어 Windows에서 만든 압축 파일 이름도 깨지지 않게 표시합니다.
- **안의 파일까지 전부.** 첨부된 메일, 압축 파일, Outlook의 `winmail.dat` 안의 파일도 트리 형태로 펼쳐 보고 내려받을 수 있습니다.
- **안전한 본문 보기.** HTML 본문의 스크립트는 실행되지 않으며, 추적용 외부 이미지는 기본으로 차단됩니다.

## 주요 기능

**메일 열기**
- [x] `.eml` 파일 드래그 앤 드롭 / 파일 선택 (여러 개 동시에)
- [x] Outlook `.msg` 파일 (한국어 Outlook의 CP949 문자열, RTF로만 저장된 본문 포함)
- [x] `.mbox` 백업 파일 (Gmail Takeout, Thunderbird). 수천 통짜리 큰 파일도 나눠 읽습니다
- [x] 보낸 사람, 받는 사람, 참조, 제목, 날짜 표시
- [x] HTML / 텍스트 본문 보기, 본문 속 인라인 이미지 표시
- [x] 여러 메일 목록 검색

**첨부파일**
- [x] 첨부파일 개별 다운로드 및 전체 ZIP 다운로드
- [x] 첨부된 메일(`.eml`, `.msg`)과 `.zip` 내부 탐색
- [x] Outlook `winmail.dat` 첨부와 서식 본문 복원
- [x] 암호가 걸린 ZIP 열기 (ZipCrypto, AES)
- [x] 네이버 대용량 첨부, Google Drive, OneDrive, Dropbox 등 링크로 보낸 첨부 모아 보기
- [x] 실행 파일·매크로 문서 다운로드 전 경고

**미리보기**
- [x] 이미지, 텍스트, 오디오, 비디오
- [x] PDF (한글 PDF 포함)
- [x] Word (`.docx`)
- [x] Excel (`.xlsx`, `.xls`, `.csv` 등)
- [x] 한글 (`.hwp`, `.hwpx`) 글자 미리보기

**앞으로**
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
- [fflate](https://github.com/101arrowz/fflate), [zip.js](https://github.com/gildas-lormeau/zip.js): ZIP 만들기 / 풀기 (암호 ZIP 포함)
- [msgreader](https://github.com/HiraokaHyperTools/msgreader): Outlook `.msg` 파싱
- [PDF.js](https://github.com/mozilla/pdf.js): PDF 미리보기
- [mammoth](https://github.com/mwilliamson/mammoth.js): Word 미리보기
- [SheetJS](https://sheetjs.com/): Excel 미리보기
- [cfb](https://github.com/SheetJS/js-cfb): 한글(HWP) 문서 읽기

## 로드맵

1. **웹앱** (진행 중): 브라우저에서 동작하는 뷰어
2. **데스크톱 앱**: 웹앱을 기반으로 `.eml` 파일을 더블클릭해서 바로 열 수 있는 앱

## 기여하기

버그 제보와 기능 제안은 [Issues](https://github.com/shun1403/open-eml/issues)에 남겨 주세요. 메일이 제대로 열리지 않는 경우, 개인정보를 지운 샘플 파일을 함께 첨부해 주시면 큰 도움이 됩니다.

## 라이선스

[MIT](LICENSE)
