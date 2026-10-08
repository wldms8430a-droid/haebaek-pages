"""Standalone Windows administrator: local PowerPoint conversion and approved GitHub publication."""
import base64, hashlib, json, logging, queue, re, tempfile, threading, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk
from ppt_extract import extract_ppt, create_render_copy
from source_answers import compile_record

REPO = 'wldms8430a-droid/haebaek-pages'
URL = 'https://wldms8430a-droid.github.io/haebaek-pages/'
STATE = Path(__file__).resolve().parent.parent / 'local' / 'admin'
STATE.mkdir(parents=True, exist_ok=True)
logging.basicConfig(filename=STATE/'admin.log', level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')


_fonts_activated=False
def activate_installed_fonts():
    global _fonts_activated
    if _fonts_activated:return
    import ctypes,winreg
    try:
        key=winreg.OpenKey(winreg.HKEY_CURRENT_USER,r'Software\Microsoft\Windows NT\CurrentVersion\Fonts')
        try:
            for i in range(winreg.QueryInfoKey(key)[1]):
                _,value,_=winreg.EnumValue(key,i)
                if isinstance(value,str) and Path(value).is_file():ctypes.windll.gdi32.AddFontResourceExW(value,0,None)
        finally:winreg.CloseKey(key)
    except FileNotFoundError:pass
    result=ctypes.c_size_t();ctypes.windll.user32.SendMessageTimeoutW(0xffff,0x001d,0,0,2,1000,ctypes.byref(result))
    _fonts_activated=True


def convert(source, output):
    """Read only; use our own PowerPoint instance and sanitized temporary copy."""
    import pythoncom
    import win32com.client
    source = Path(source).resolve()
    if source.suffix.lower() != '.pptx' or source.stat().st_size > 50*1024*1024:
        raise ValueError('PPTX 50MB 이하만 지원합니다.')
    slides = extract_ppt(source, 300)
    output = Path(output).resolve(); output.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()[:20]
    docid = hashlib.sha256(source.name.encode()).hexdigest()[:20]
    activate_installed_fonts()
    pythoncom.CoInitialize(); app = presentation = None; previous_security=None
    try:
        with tempfile.TemporaryDirectory(prefix='haebaek-pages-render-') as temp:
            safe = Path(temp)/'render.pptx'; create_render_copy(source, safe)
            app = win32com.client.DispatchEx('PowerPoint.Application'); previous_security=app.AutomationSecurity; app.AutomationSecurity = 3
            presentation = app.Presentations.Open(str(safe), True, False, False)
            if presentation.Slides.Count != len(slides):
                raise ValueError('PPT 슬라이드 수가 일치하지 않습니다.')
            height = int(1600*presentation.PageSetup.SlideHeight/presentation.PageSetup.SlideWidth)
            records = []
            for s in slides:
                filename = f'{docid}-{digest}-{s.number}.png'
                path = output/filename
                presentation.Slides.Item(s.number).Export(str(path), 'PNG', 1600, height)
                if path.read_bytes()[:8] != b'\x89PNG\r\n\x1a\n':
                    raise ValueError('슬라이드 PNG 변환에 실패했습니다.')
                final_name=f'{docid}-{digest}-{hashlib.sha256(path.read_bytes()).hexdigest()[:16]}-{s.number}.png'
                path.rename(output/final_name);filename=final_name
                records.append(dict(id=f'{source.name}::{s.number}', filename=source.name, number=s.number,
                    title=s.title, text=s.text, image=f'data/images/{filename}', hidden=s.hidden, warnings=s.warnings))
            return [compile_record(record) for record in records]
    finally:
        try:
            if presentation is not None: presentation.Close()
        finally:
            try:
                if app is not None:
                    if previous_security is not None:app.AutomationSecurity=previous_security
                    if app.Presentations.Count==0:app.Quit()
            finally: pythoncom.CoUninitialize()


class GitHub:
    def __init__(self, token): self.token = token
    def request(self, path, body=None, method=None):
        req = Request('https://api.github.com/repos/'+REPO+'/'+path,
            data=json.dumps(body).encode() if body is not None else None,
            method=method or ('POST' if body is not None else 'GET'),
            headers={'Authorization':'Bearer '+self.token, 'Accept':'application/vnd.github+json',
                     'Content-Type':'application/json', 'User-Agent':'Haebaek-Pages-Admin', 'X-GitHub-Api-Version':'2022-11-28'})
        try:
            with urlopen(req, timeout=60) as response: return json.load(response)
        except HTTPError as e:
            raise RuntimeError(f'GitHub HTTP {e.code}: 저장소 권한·토큰·인터넷 연결을 확인해주세요.') from None
    def blob(self, content):
        return self.request('git/blobs', {'content':base64.b64encode(content).decode(), 'encoding':'base64'})['sha']
    def snapshot(self):
        head = self.request('git/ref/heads/main')['object']['sha']
        tree = self.request('git/commits/'+head)['tree']['sha']
        response = self.request('git/trees/'+tree+'?recursive=1')
        if response.get('truncated'): raise RuntimeError('저장소 파일 목록이 너무 큽니다.')
        paths = {x['path']:x['sha'] for x in response['tree'] if x['type']=='blob'}
        records = []
        if 'site/data/slides.json' in paths:
            blob = self.request('git/blobs/'+paths['site/data/slides.json'])
            records = json.loads(base64.b64decode(blob['content']))
            if not isinstance(records, list): raise ValueError('기존 게시 자료 형식이 올바르지 않습니다.')
        return head, tree, paths, records
    def publish(self, additions, deletions, progress):
        head, tree, paths, existing = self.snapshot()
        replace = set(additions) | set(deletions)
        records = [s for s in existing if s['filename'] not in replace]
        entries = []; images = {}
        for name, (slides, folder) in additions.items():
            for s in slides:
                if s['hidden']: continue
                records.append(s)
                images['site/'+s['image']] = (Path(folder)/Path(s['image']).name).read_bytes()
        keep = {'site/'+s['image'] for s in records}
        for path in paths:
            if path.startswith('site/data/images/') and path not in keep:
                entries.append({'path':path,'mode':'100644','type':'blob','sha':None})
        for i, (path, content) in enumerate(images.items(), 1):
            progress(f'원본 이미지 게시 {i}/{len(images)}')
            expected = hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
            if paths.get(path) != expected:
                entries.append(dict(path=path,mode='100644',type='blob',sha=self.blob(content)))
        publication = dict(version=str(time.time_ns()), slides=len(records), documents=len({s['filename'] for s in records}), public_release_confirmed=True)
        for path, data in [('site/data/slides.json',records), ('site/data/publication.json',publication)]:
            entries.append(dict(path=path,mode='100644',type='blob',sha=self.blob(json.dumps(data,ensure_ascii=False,indent=2).encode())))
        newtree = self.request('git/trees',dict(base_tree=tree,tree=entries))['sha']
        commit = self.request('git/commits',dict(message='Publish administrator-approved PPT materials',tree=newtree,parents=[head]))['sha']
        if self.request('git/ref/heads/main')['object']['sha'] != head:
            raise RuntimeError('다른 관리자가 자료를 변경했습니다. 다시 게시하면 최신 자료와 병합합니다.')
        self.request('git/refs/heads/main',dict(sha=commit,force=False),method='PATCH')
        return commit
    def wait_deploy(self, commit, progress):
        for _ in range(150):
            runs = self.request('actions/runs?head_sha='+commit)['workflow_runs']
            if runs:
                run = runs[0]
                if run['status']=='completed':
                    if run['conclusion']!='success': raise RuntimeError('Pages 배포 실패. GitHub Actions에서 로그를 확인해주세요: '+run['html_url'])
                    return URL
            progress('GitHub 게시 완료 · Pages 배포를 기다리는 중…');time.sleep(4)
        raise RuntimeError('GitHub에는 저장됐지만 배포 완료 대기 시간이 초과됐습니다. Actions에서 확인해주세요.')


class Admin:
    def __init__(self, root):
        self.root=root; self.token=''; self.additions={}; self.deletions=set(); self.existing=[]; self.busy=False; self.events=queue.Queue()
        root.title('해백이 PPT 자동 게시 관리자'); root.geometry('930x720')
        ttk.Label(root,text='PPT만 선택하면 원문 추출·전체 PNG 변환·게시 파일 생성이 자동 진행됩니다.',wraplength=870).pack(padx=15,pady=10)
        row=ttk.Frame(root);row.pack(fill='x',padx=15)
        self.buttons=[]
        for title,command in [('GitHub 연결',self.connect),('PPT 여러 개 추가·교체',self.add),('선택 자료 삭제',self.delete),('선택 자료·이미지 검토',self.review),('자동 게시',self.publish)]:
            b=ttk.Button(row,text=title,command=command);b.pack(side='left',padx=3);self.buttons.append(b)
        self.list=tk.Listbox(root,height=10,selectmode='extended');self.list.pack(fill='x',padx=15,pady=10)
        self.approved=tk.BooleanVar();ttk.Checkbutton(root,variable=self.approved,text='선택한 추가·교체 자료의 원문과 모든 이미지를 검토했고 인터넷 공개 승인을 확인했습니다.').pack(anchor='w',padx=15)
        ttk.Label(root,text='실제 병원 자료는 공개 승인 전 게시하지 마세요. 게시된 원문·이미지는 누구나 열람할 수 있습니다.\nGitHub CLI의 기존 로그인 인증을 사용합니다. 별도 인증키 입력은 필요 없습니다.',wraplength=870).pack(padx=15,pady=8)
        self.status=tk.StringVar(value='PPT를 선택하거나 GitHub에 연결하세요. PNG·ZIP·수동 GitHub 업로드는 필요 없습니다.')
        ttk.Label(root,textvariable=self.status,wraplength=870).pack(padx=15,pady=8)
        self.text=tk.Text(root,height=13,wrap='word');self.text.pack(fill='both',expand=True,padx=15,pady=10)
        root.after(100,self.pump)
        root.protocol('WM_DELETE_WINDOW',self.close)
    def close(self):
        if self.busy: messagebox.showinfo('작업 중','변환·게시가 끝난 뒤 종료해주세요.');return
        self.token='';self.root.destroy()
    def notify(self, message): self.events.put(('status',message))
    def task(self, fn):
        if self.busy:return
        self.busy=True
        for b in self.buttons:b.configure(state='disabled')
        def run():
            try:self.events.put(('done',fn()))
            except Exception as e:
                logging.error('Operation failed: %s',type(e).__name__)
                self.events.put(('error',str(e)))
        threading.Thread(target=run,daemon=True).start()
    def pump(self):
        try:
            while True:
                kind,value=self.events.get_nowait()
                if kind=='status': self.status.set(value)
                else:
                    self.busy=False
                    for b in self.buttons:b.configure(state='normal')
                    self.refresh();self.status.set(value or '완료')
                    if kind=='error':messagebox.showerror('작업 실패',value)
        except queue.Empty:pass
        self.root.after(100,self.pump)
    def refresh(self):
        self.names=sorted(({s['filename'] for s in self.existing}|set(self.additions))-self.deletions)
        self.list.delete(0,'end')
        for n in self.names:self.list.insert('end',n+(' · 추가/교체 대기' if n in self.additions else ' · 게시 중'))
    def connect(self):
        def run():
            from github_auth import ExistingGitHub
            self.api=ExistingGitHub();self.existing=self.api.snapshot()[3];self.token='connected'
            return '기존 GitHub 로그인 연결 완료 · 기존 게시 자료를 불러왔습니다.'
        self.task(run)
    def add(self):
        files=filedialog.askopenfilenames(title='공개 승인 검토할 PPT 선택',filetypes=[('PowerPoint','*.pptx')])
        if not files:return
        self.approved.set(False)
        def run():
            for file in files:
                self.notify(Path(file).name+' · 원문 추출 및 전체 슬라이드 PNG 자동 변환 중…')
                folder=Path(tempfile.mkdtemp(prefix='conversion-',dir=STATE));records=convert(file,folder)
                self.additions[Path(file).name]=(records,folder);self.deletions.discard(Path(file).name)
            return '자동 변환 완료 · 선택 자료·이미지 검토 후 자동 게시를 누르세요.'
        self.task(run)
    def delete(self):
        for i in self.list.curselection():
            name=self.names[i];self.additions.pop(name,None);self.deletions.add(name)
        self.approved.set(False);self.refresh();self.status.set('삭제 대기 · 자동 게시하면 전체 사용자에게 반영됩니다.')
    def review(self):
        selected=self.list.curselection()
        if not selected:return
        self.text.delete('1.0','end')
        from html import escape
        import webbrowser
        sections=[]
        for i in selected:
            name=self.names[i]
            if name not in self.additions:
                self.text.insert('end',name+' · 이미 게시된 자료입니다.\n');continue
            slides,folder=self.additions[name]
            for s in slides:
                self.text.insert('end',f"{name} · {s['number']}번 · {s['title']}\n{s['text']}\n{' / '.join(s['warnings'])}\n\n")
                warn='개인정보 형태 확인 필요' if re.search(r'\b\d{6}[- ]?[1-4]\d{6}\b|0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}|[\w.+-]+@[\w.-]+',s['text']) else ''
                image=(folder/Path(s['image']).name).as_uri()
                sections.append(f"<h2>{escape(name)} · {s['number']}번 {escape(s['title'])}</h2><p>{warn}</p><pre>{escape(s['text'])}</pre><img src='{image}' style='max-width:100%'>")
        if sections:
            review=STATE/'review.html';review.write_text('<meta charset="utf-8"><title>공개 전 자료 검토</title>'+''.join(sections),encoding='utf8');webbrowser.open(review.as_uri())
    def publish(self):
        if not self.token:messagebox.showinfo('GitHub 연결','먼저 GitHub 연결을 눌러주세요.');return
        if not self.additions and not self.deletions:messagebox.showinfo('변경 없음','PPT를 추가·교체하거나 삭제해주세요.');return
        if self.additions and not self.approved.get():messagebox.showinfo('공개 승인 확인','원문·이미지 검토와 인터넷 공개 승인 확인을 체크해주세요.');return
        if not messagebox.askyesno('인터넷 공개 게시','추가·교체·삭제 변경을 모든 사용자에게 게시할까요? 공개 승인된 자료만 포함해야 합니다.'):return
        def run():
            api=self.api;commit=api.publish(self.additions,self.deletions,self.notify)
            self.additions.clear();self.deletions.clear();self.existing=api.snapshot()[3]
            url=api.wait_deploy(commit,self.notify)
            return '배포 성공 · 모든 직원이 별도 설정 없이 사용합니다: '+url
        self.task(run)


if __name__=='__main__':
    root=tk.Tk();Admin(root);root.mainloop()
