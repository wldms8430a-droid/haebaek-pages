"""Per-user, approved-public-material folder watcher. No hospital DB access."""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, ttk
import win32api, win32event
from admin_windows import convert, REPO, URL
from github_auth import ExistingGitHub, login

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT/'local'/'folder-publisher'
CONFIG = PRIVATE/'config.json'
STATE = PRIVATE/'state.json'
STATUS = PRIVATE/'상태.txt'


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8');os.replace(temp,path)


def status(message):
    PRIVATE.mkdir(parents=True,exist_ok=True)
    STATUS.write_text(time.strftime('%Y-%m-%d %H:%M:%S')+'\n'+message+'\n',encoding='utf8')


def snapshot(folder):
    if not folder.is_dir():raise RuntimeError('등록 폴더를 찾을 수 없습니다. 삭제 반영을 중단합니다.')
    files={}; folded=set()
    for p in folder.iterdir():
        if not p.is_file() or p.suffix.lower()!='.pptx' or p.name.startswith('~$'):continue
        if p.name.casefold() in folded:raise ValueError('대소문자만 다른 중복 PPT 파일명을 수정해주세요.')
        folded.add(p.name.casefold());s=p.stat()
        if s.st_size>50*1024*1024:raise ValueError('PPT는 파일당 50MB 이하여야 합니다.')
        files[p.name]=(s.st_size,s.st_mtime_ns)
    return files


def fingerprints(folder, current):
    return {name:hashlib.sha256((folder/name).read_bytes()).hexdigest() for name in current}


def apply(folder, current, state, api, converter=convert, notify=status, check_sensitive=True, approved_contacts=()):
    """Commit complete snapshot only after conversion and file-stability checks."""
    hashes=fingerprints(folder,current);owned=state.get('owned',{})
    changed=[n for n in hashes if hashes[n]!=owned.get(n)];deleted=set(owned)-set(hashes)
    if not changed and not deleted:return None
    additions={}
    PRIVATE.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='work-',dir=PRIVATE) as temp:
        work=Path(temp)
        for i,name in enumerate(changed):
            notify(name+' · 원문 추출·전체 PNG 자동 변환 중…')
            source=work/name;shutil.copy2(folder/name,source)
            if hashlib.sha256(source.read_bytes()).hexdigest()!=hashes[name]:raise RuntimeError('복사 중 PPT가 변경됐습니다. 안정화 후 재시도합니다.')
            out=work/str(i);records=converter(source,out)
            inspection_text=[s['text'] for s in records]
            for contact in approved_contacts:inspection_text=[t.replace(contact,'[승인된 공개 예시/부서 연락처]') for t in inspection_text]
            if check_sensitive and any(re.search(r'\b\d{6}[- ]?[1-4]\d{6}\b|0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}|[\w.+-]+@[\w.-]+',text) for text in inspection_text):
                raise ValueError('개인정보 형태가 감지되어 자동 게시를 중단했습니다. 원문과 이미지를 검토하고 해당 정보를 제거한 공개용 PPT로 교체해주세요.')
            additions[name]=(records,out)
        if snapshot(folder)!=current or fingerprints(folder,current)!=hashes:
            raise RuntimeError('변환 중 등록 폴더가 변경됐습니다. 다음 점검에서 다시 처리합니다.')
        commit=api.publish(additions,deleted,notify)
    state.update(owned=hashes,pending_commit=commit)
    return commit


def install_startup():
    """Current user's Startup shortcut only; no elevation, service or security changes."""
    import win32com.client
    startup=Path(os.environ['APPDATA'])/'Microsoft'/'Windows'/'Start Menu'/'Programs'/'Startup'
    startup.mkdir(parents=True,exist_ok=True)
    link=win32com.client.Dispatch('WScript.Shell').CreateShortcut(str(startup/'해백이 PPT 자동 게시.lnk'))
    link.TargetPath=sys.executable
    link.Arguments='"'+str(Path(__file__).resolve())+'" --watch'
    link.WorkingDirectory=str(Path(__file__).resolve().parent);link.WindowStyle=7;link.Save()


def watch():
    PRIVATE.mkdir(parents=True,exist_ok=True)
    mutex=win32event.CreateMutex(None,False,'Local\\HaebaekPagesFolderPublisher-'+hashlib.sha256(str(PRIVATE).encode()).hexdigest()[:16])
    if win32api.GetLastError()==183:win32api.CloseHandle(mutex);return
    try:
        config=json.loads(CONFIG.read_text(encoding='utf8'))
        if not config.get('public_folder_acknowledged'):raise RuntimeError('최초 공개 자료 폴더 설정을 완료해주세요.')
        api=ExistingGitHub();folder=Path(config['folder']);state=json.loads(STATE.read_text(encoding='utf8')) if STATE.exists() else {'owned':{}}
        last=None;stable=0;error_key=None;retry_after=0
        status('자동 감시 중 · PPT 등록 폴더의 공개 승인된 자료만 처리합니다.')
        while True:
            try:
                if state.get('pending_commit'):
                    api.wait_deploy(state['pending_commit'],status);state.pop('pending_commit',None);write_json(STATE,state)
                    status('자동 배포 성공 · 전체 사용자가 별도 설정 없이 사용합니다.\n'+URL)
                current=snapshot(folder)
                if current!=last:last=current;stable=time.monotonic();error_key=None
                if time.monotonic()-stable>=config.get('settle_seconds',30) and time.monotonic()>=retry_after:
                    commit=apply(folder,current,state,api,approved_contacts=config.get('approved_public_contacts',[]))
                    if commit:
                        write_json(STATE,state);api.wait_deploy(commit,status);state.pop('pending_commit',None);write_json(STATE,state)
                        status('자동 배포 성공 · 전체 사용자 반영 완료\n'+URL)
                    retry_after=time.monotonic()+30
                time.sleep(5)
            except Exception as e:
                message=str(e);status('자동 게시 보류 · 기존 게시 자료는 유지됩니다.\n'+message)
                key=(type(e).__name__,message)
                if key!=error_key:
                    # Do not log a token, source text or remote response body.
                    win32api.MessageBox(0,message+'\n상태 파일: '+str(STATUS),'해백이 PPT 자동 게시 안내',0x40)
                    error_key=key
                retry_after=time.monotonic()+60;time.sleep(5)
    except Exception as e:
        status('자동 실행 설정을 확인해주세요.\n'+str(e))
        win32api.MessageBox(0,'자동 게시 설정을 확인해주세요. 최초 설정 도구를 실행하세요.','해백이 PPT 자동 게시',0x40)
    finally:win32api.CloseHandle(mutex)


def setup():
    from tkinter import filedialog
    root=tk.Tk();root.title('해백이 PPT 등록 폴더 · 최초 설정');root.geometry('760x460')
    old=json.loads(CONFIG.read_text(encoding='utf8')) if CONFIG.exists() else {}
    folder=tk.StringVar(value=old.get('folder',str(Path.home()/'Desktop'/'PPT 등록 폴더')))
    ack=tk.BooleanVar(value=False);autostart=tk.BooleanVar(value=True);message=tk.StringVar(value='GitHub 연결과 공개 자료 폴더 설정은 최초 한 번만 진행합니다.')
    ttk.Label(root,text='이 폴더에 넣거나 교체한 PPT는 인터넷에 자동 공개됩니다.\n반드시 공개 승인과 원문·이미지 검토를 마친 PPT만 넣으세요. 삭제하면 게시본에서도 제거됩니다.',wraplength=700).pack(padx=20,pady=15)
    ttk.Label(root,text='PPT 등록 폴더').pack(anchor='w',padx=20);ttk.Entry(root,textvariable=folder,width=95).pack(padx=20,pady=5)
    ttk.Button(root,text='폴더 변경',command=lambda:folder.set(filedialog.askdirectory() or folder.get())).pack(pady=3)
    ttk.Label(root,text='GitHub CLI의 기존 로그인 인증을 자동 사용합니다. 이 도구에는 비밀번호·인증키 입력란이 없습니다.',wraplength=700).pack(padx=20,pady=10)
    def open_login():
        try:login();message.set('GitHub 로그인 창의 안내를 따라 브라우저 승인을 완료한 뒤 최초 설정 저장을 누르세요.')
        except Exception as e:messagebox.showerror('GitHub 연결',str(e))
    ttk.Button(root,text='필요한 경우 브라우저로 GitHub 로그인',command=open_login).pack(pady=5)
    ttk.Label(root,text='새 GitHub CLI 로그인은 기존 저장소 선택 앱과 별도입니다. GitHub 승인 화면의 권한 범위를 확인하세요. 도구는 haebaek-pages 저장소만 처리합니다.',wraplength=700).pack(padx=20,pady=5)
    ttk.Checkbutton(root,variable=ack,text='이 폴더에는 인터넷 공개 승인과 개인정보 검토를 완료한 PPT만 넣겠습니다.').pack(anchor='w',padx=20,pady=10)
    ttk.Checkbutton(root,variable=autostart,text='이 Windows 사용자 로그인 시 자동 감시 실행 (관리자 권한 불필요)').pack(anchor='w',padx=20,pady=5)
    ttk.Label(root,textvariable=message,wraplength=700).pack(padx=20,pady=10)
    def save():
        if not ack.get():messagebox.showinfo('최초 확인','공개 자료 전용 폴더임을 확인해주세요.');return
        try:
            message.set('기존 GitHub 로그인과 저장소 권한을 확인하고 있습니다…');root.update_idletasks()
            ExistingGitHub().snapshot()
            target=Path(folder.get()).resolve();target.mkdir(parents=True,exist_ok=True)
            if target==Path(target.anchor):raise ValueError('드라이브 루트 대신 전용 폴더를 선택해주세요.')
            existing_config=json.loads(CONFIG.read_text(encoding='utf8')) if CONFIG.exists() else None
            if existing_config and Path(existing_config['folder']).resolve()!=target:
                raise ValueError('기존 등록 폴더 변경은 자동 감시 종료와 기존 게시 자료 검토 후 진행해주세요.')
            write_json(CONFIG,dict(folder=str(target),auth='github-cli',public_folder_acknowledged=True,settle_seconds=30))
            if autostart.get():install_startup()
            else:
                startup=Path(os.environ['APPDATA'])/'Microsoft'/'Windows'/'Start Menu'/'Programs'/'Startup'/'해백이 PPT 자동 게시.lnk'
                startup.unlink(missing_ok=True)
            subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--watch'],creationflags=subprocess.CREATE_NO_WINDOW)
            messagebox.showinfo('최초 설정 완료','이제 PPT 등록 폴더에 공개 승인된 PPT를 넣거나 교체하면 자동 게시됩니다.\n약 30초 안정화 후 변환·배포를 시작합니다. PC는 로그인된 상태여야 합니다.');root.destroy()
        except Exception as e:messagebox.showerror('설정 확인',str(e))
    ttk.Button(root,text='최초 설정 저장 · 자동 감시 시작',command=save).pack(pady=12)
    root.mainloop()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--watch',action='store_true');args=parser.parse_args()
    watch() if args.watch else setup()
