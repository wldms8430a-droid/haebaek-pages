# 해백이 GitHub Pages · 관리자 PPT 자동 게시
직원은 사이트 접속만 하면 게시된 자료를 바로 검색합니다. 기존 검색·결과 선택·원본 이미지·모바일·PWA는 유지합니다.

## 관리자 사용 (Windows + 설치된 PowerPoint 필요)
1. tools/해백이 자료 관리자.ps1을 실행합니다. 현재 PC에서는 기존 deployment-haebaek의 Python 실행 환경만 이용하며 코드·DB는 수정하지 않습니다.
2. GitHub 연결을 누르고 이 저장소 하나에만 권한을 부여한 fine-grained personal access token을 입력합니다. GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token → Only select repositories → haebaek-pages → Contents: Read and write / Actions: Read-only. 토큰은 채팅에 보내지 마세요. 실행 중 메모리에만 보관됩니다.
3. PPT 여러 개 추가·교체에서 PPTX를 선택합니다. 원문 추출과 모든 슬라이드 PNG 변환이 자동 진행됩니다. 같은 파일명은 교체됩니다. 목록에서 선택 자료 삭제도 가능합니다.
4. 선택 자료·이미지 검토를 눌러 모든 원문과 PNG를 확인하고 개인정보·비공개 내용이 없는지 직접 검토합니다. 인터넷 공개 승인 확인을 체크합니다.
5. 자동 게시를 누르면 GitHub 저장과 Pages 자동 배포까지 진행합니다. 성공 메시지와 웹 주소가 표시됩니다. PNG·ZIP 제작과 수동 업로드는 필요 없습니다.

현재 PC 외의 환경은 Python 설치 후 다음 명령으로 별도 환경을 준비합니다 (관리자 권한·시작프로그램 불필요):
```
py -m venv local/admin-venv
local/admin-venv/Scripts/python.exe -m pip install -r tools/requirements-admin.txt
```

## 보존과 권한
검증된 추출기를 tools/ppt_extract.py로 복사해 독립 사용합니다. 원본 PPT는 읽기 전용이며 변환은 별도 PowerPoint 인스턴스와 임시 복사본에서 수행합니다. 검색 원문과 PNG만 게시하며 원본 PPT·DB·계정·토큰은 게시하지 않습니다. 기존 자료는 최신 GitHub 게시본에서 병합합니다. 변경 충돌 시 덮어쓰지 않고 재시도를 안내합니다. 낡은 이미지는 삭제하며 다른 업무 자료는 유지합니다.

로컬 검토 자료·변환 이미지·로그는 local/admin에만 있습니다. gitignore의 local/ 제외 규칙을 유지하세요. 실제 병원 자료는 인터넷 공개 승인 전 게시하지 마세요. 자동 탐지는 공개 승인 여부를 판정하지 않습니다.

운영비는 기존 GitHub Pages 무료 구성과 이미 설치된 PowerPoint를 이용해 0원입니다. GitHub 서비스 사용 제한은 그대로 적용됩니다. 새 PowerPoint 구매나 유료 서버/API는 사용하지 않습니다.

## 확인 범위
가상 PPT로 실제 PowerPoint COM 변환·원문 추출·전체 PNG 생성·원본 보존 확인 완료. 게시 데이터 병합·삭제·GitHub API 호출 순서는 가상 API로 검증. 실제 자료 자동 게시 전체 과정은 관리자 GitHub 토큰 연결 후 확인할 수 있습니다. 실제 병원 자료는 포함하지 않았습니다.
