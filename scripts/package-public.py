"""Build an allowlisted program-only ZIP; never include the source checkout or data."""
import argparse,hashlib,json,re,zipfile,os
from pathlib import Path,PurePosixPath
from datetime import datetime,timezone,timedelta

BLOCKED_PARTS={'.git','data','backups','maintenance-archives','test-output','node_modules','docs','tests'}
BLOCKED_NAMES={'state.json','session.json','.env'}
UI_SUFFIXES={'.js','.html','.css','.svg'}
def private_tokens(state_file):
    if not state_file.is_file():return []
    root=json.loads(state_file.read_text('utf-8-sig'));data=root.get('data',root);people=list(data.get('players',[]))
    for event in data.get('events',[]):
        for unit in event.get('units',[])+event.get('activityUnits',[]):people.extend(unit.get('members',[])+unit.get('currentMembers',[]))
        for match in event.get('matches',[]):
            for lineup in match.get('lineups',{}).values():people.extend(lineup.get('members',[]))
    tokens=set()
    for person in people:
        for key in ['name','id','phone','mobile','email','studentId','student_id']:
            value=person.get(key)
            if isinstance(value,str) and len(value.strip())>=(8 if key=='id' else 2):tokens.add(value.strip())
    return sorted(tokens)
def audit_payloads(payloads,tokens=()):
    for name,content in payloads.items():
        path=PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or any(p.lower() in BLOCKED_PARTS for p in path.parts) or path.name.lower() in BLOCKED_NAMES:raise ValueError('Disallowed package path: '+name)
        if path.suffix.lower() in {'.pem','.key'}:raise ValueError('Disallowed key file: '+name)
        if any(token.encode(encoding) in content for token in tokens for encoding in ['utf-8','utf-16le']):raise ValueError('Local roster information found in '+name)
        if b'-----BEGIN PRIVATE KEY-----' in content or re.search(rb'gh[pousr]_[A-Za-z0-9]{30,}',content):raise ValueError('Credential-like content found in '+name)
def build(repo,program,date,output=None):
    top='WKU羽毛球比赛记录系统';exe=program/'WKU-MatchDesk.exe'
    if exe.read_bytes()[:2]!=b'MZ':raise ValueError('Invalid Windows program')
    payloads={top+'/program/WKU-MatchDesk.exe':exe.read_bytes()}
    for file in (repo/'ui').rglob('*'):
        if not file.is_file():continue
        if file.is_symlink() or file.suffix.lower() not in UI_SUFFIXES:raise ValueError('Unexpected UI file: '+str(file.relative_to(repo)))
        payloads[top+'/program/ui/'+file.relative_to(repo/'ui').as_posix()]=file.read_bytes()
    payloads[top+'/开始记录比赛.cmd']=('@echo off\r\nsetlocal\r\nset "WKU_DATA_DIR=%~dp0data"\r\nstart "" "%~dp0program\\WKU-MatchDesk.exe"\r\nexit /b 0\r\n').encode('ascii')
    instructions='''WKU 羽毛球比赛记录系统

首次使用：完整解压后，双击“开始记录比赛.cmd”。仅支持 Windows 10 / 11。
无需安装 Git、VS Code、Node.js 或 Python。

公开使用包不含真实队员名单、比赛成绩或管理员数据库。首次使用为空名单；示例只使用虚构编号。如需实际名单，请联系管理员私下提供备份后导入。

更新：从系统托盘退出旧程序，备份原 data 文件夹。将新版解压到新文件夹，再把原 data 文件夹复制到新版“开始记录比赛.cmd”旁，随后启动。不要把自己的 data 文件夹上传到公开仓库。

程序和比赛数据分别保存。公开页面只提供程序下载，不会自动上传或同步任何人的名单和比赛记录。
'''
    payloads[top+'/先看这里-使用说明.txt']=instructions.encode('utf-8-sig')
    payloads[top+'/本次更新.txt']=('隐私保护更新：移除硬编码真实姓名与旧名单初始化入口；示例改为虚构编号。保留问题删除、取消恢复、优先级排序及海军蓝界面。\n').encode('utf-8-sig')
    tokens=private_tokens(repo.parent/'data/state.json');audit_payloads(payloads,tokens)
    delivery=repo/'delivery';delivery.mkdir(exist_ok=True);output=output or delivery/f'WKU-MatchDesk-Windows-{date}-Public.zip'
    if output.resolve().parent!=delivery.resolve():raise ValueError('Output must stay within delivery')
    temporary=output.with_suffix('.zip.next')
    with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,content in payloads.items():z.writestr(name,content)
    with zipfile.ZipFile(temporary) as z:
        if z.testzip() is not None:raise ValueError('ZIP integrity failed')
        audit_payloads({n:z.read(n) for n in z.namelist()},tokens)
    os.replace(temporary,output)
    result={'file':output.name,'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'entries':len(payloads),'privacyChecked':True,'privateTokensChecked':len(tokens),'containsUserData':False}
    (delivery/'manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8');return result
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--program',type=Path,required=True);parser.add_argument('--date',default=datetime.now(timezone(timedelta(hours=8))).strftime('%Y%m%d'));args=parser.parse_args()
    print(json.dumps(build(Path(__file__).resolve().parent.parent,args.program,args.date),ensure_ascii=True))
