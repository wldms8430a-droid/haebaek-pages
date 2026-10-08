"""Reuse GitHub CLI authentication; never display or persist credentials in this tool."""
import json,os,shutil,subprocess
from pathlib import Path
from admin_windows import GitHub,REPO


def cli_path():
    path=shutil.which('gh')
    if path:return path
    local=Path(__file__).resolve().parents[1]/'local'/'github-cli'/'gh.exe'
    if local.exists():return str(local)
    raise RuntimeError('GitHub CLI를 찾을 수 없습니다. GitHub CLI 설치 또는 관리자 도구 준비가 필요합니다.')


def cli_env():
    env=dict(os.environ)
    # Authenticate from CLI's existing credential store, never from a supplied token.
    env.pop('GH_TOKEN',None);env.pop('GITHUB_TOKEN',None)
    env['GH_HOST']='github.com';env['GH_PROMPT_DISABLED']='1';env['GIT_TERMINAL_PROMPT']='0'
    return env


def login():
    """Interactive browser/device authorization, only at the user's request."""
    env=cli_env();env.pop('GH_PROMPT_DISABLED',None)
    return subprocess.Popen([cli_path(),'auth','login','--hostname','github.com','--git-protocol','https','--web'],env=env,creationflags=subprocess.CREATE_NEW_CONSOLE)


class ExistingGitHub(GitHub):
    def __init__(self):self.cli=cli_path()
    def request(self,path,body=None,method=None):
        args=[self.cli,'api','repos/'+REPO+'/'+path,'--method',method or ('POST' if body is not None else 'GET')]
        if body is not None:args+=['--input','-']
        try:
            result=subprocess.run(args,input=json.dumps(body) if body is not None else None,text=True,encoding='utf8',capture_output=True,
                env=cli_env(),timeout=90,creationflags=subprocess.CREATE_NO_WINDOW)
        except subprocess.TimeoutExpired:raise RuntimeError('GitHub 응답 시간이 초과됐습니다. 인터넷 연결을 확인해주세요.') from None
        if result.returncode:
            raise RuntimeError('GitHub 연결 또는 저장소 권한을 확인해주세요. 최초 설정의 브라우저 로그인 후 다시 시도하세요.')
        return json.loads(result.stdout)
