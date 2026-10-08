# 해백이 GitHub Pages · 관리자 PPT 자동 게시
직원은 사이트 접속만 하면 게시된 자료를 바로 검색합니다. 기존 검색·결과 선택·원본 이미지·모바일·PWA는 유지합니다.

## PPT 등록 폴더 자동 게시 (권장)
바탕화면 **PPT 등록 폴더**에 인터넷 공개 승인된 PPTX를 넣거나 같은 이름으로 교체하면 자동으로 원문 추출·전체 PNG 변환·GitHub 저장·Pages 배포가 진행됩니다. 관리자 프로그램을 매번 실행하거나 토큰을 다시 입력하고 게시 버튼을 누를 필요가 없습니다.

최초 한 번 tools/PPT 폴더 최초 설정.ps1을 실행해 GitHub 토큰과 공개 자료 전용 폴더 확인을 저장하세요. 토큰은 Windows 계정별 DPAPI로 암호화되며 local/folder-publisher/config.json에만 저장됩니다. 같은 실행 중 토큰 갱신도 적용됩니다. GitHub의 해당 저장소에만 Contents 읽기/쓰기와 Actions 읽기 권한을 부여하세요. 토큰 만료·회수 시 최초 설정에서 갱신해야 합니다.

Windows 로그인 시 자동 실행 옵션은 현재 사용자 시작프로그램 바로가기를 설치합니다. 관리자 권한·Windows 서비스·방화벽 변경은 하지 않습니다. 최초 설정 완료 전에는 자동 게시하지 않습니다. 재부팅 뒤에는 Windows 로그인만 하면 감시가 재개됩니다. PC가 꺼져 있어도 이미 게시된 직원 사이트는 계속 동작하며, 새 PPT 처리는 PC 로그인 후 수행됩니다.

복사 후 약 30초 안정화, PPTX 파일당 50MB/300장 제한, PowerPoint 임시 파일 제외, 중복 감시 실행 방지, 변환 중 파일 변경 검사, 의심 개인정보 형태 감지 시 게시 보류를 적용합니다. 자동 탐지가 이미지나 개인정보·비공개 내용을 모두 판별하지는 않으므로 이 폴더에는 사전 검토·공개 승인 자료만 넣어야 합니다.

삭제는 이 감시 도구가 게시한 자료에만 반영하고 다른 기존 자료는 유지합니다. 폴더 자체가 사라지면 전체 삭제로 간주하지 않습니다. 변환 오류 시 새 버전은 게시하지 않으며, GitHub 저장 후 Pages 배포 실패 시 별도 상태 안내합니다. 상태는 local/folder-publisher/상태.txt에서 확인합니다. 여러 PPT를 함께 넣으면 한 번의 게시로 묶습니다.

검증: 가상 PPT를 이용해 실제 PowerPoint PNG 변환, 자동 추가·교체·삭제, 변경 없는 파일 생략, 원본 보존, Windows 암호화 저장, 개인정보 의심 텍스트 게시 차단, 누락 폴더 삭제 방지 확인. GitHub 게시 호출은 가상 API로 확인했으며 실제 자동 게시 감시는 사용자 최초 인증 후 시작됩니다. 실제 병원 자료는 외부 전송하지 않았습니다.

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
