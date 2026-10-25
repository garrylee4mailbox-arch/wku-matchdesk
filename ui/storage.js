import {fresh} from './core/initial.js';
import {validateData} from './core/backup.js';
import {clone,now} from './core/util.js';
export class Repository {
  constructor(){this.data=null;this.revision=0;this.history=[];this.path='';this.onstatus=()=>{};this.busy=false;this.failed=false;}
  async request(path,options={}){
    const r=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
    if(!r.ok){let message=await r.text();try{message=JSON.parse(message).error||message;}catch{}throw Error(message||'本机服务连接失败');}
    return r.json();
  }
  async load(){const v=await this.request('state');this.revision=v.revision;this.path=v.path;this.data=v.data||fresh();validateData(this.data);if(!v.data)await this.commit(clone(this.data),'初始化数据');return this.data;}
  async commit(next,action,reason='',{undo=true}={}){
    if(this.busy)throw Error('上次保存仍在进行，请稍后再试');if(this.failed)throw Error('保存曾失败，请先重新载入本机数据，避免覆盖另一窗口');
    validateData(next);this.busy=true;this.onstatus('saving');
    next.audit.push({at:now(),operator:next.settings.operator,action,reason});
    try{
      const v=await this.request('state',{method:'PUT',headers:{'If-Match':String(this.revision)},body:JSON.stringify(next)});
      if(undo&&this.data)this.history.push(clone(this.data));if(this.history.length>20)this.history.shift();
      this.data=next;this.revision=v.revision;this.onstatus('saved');return next;
    }catch(e){this.failed=true;this.onstatus('error');throw e;}finally{this.busy=false;}
  }
  async undo(){if(!this.history.length)throw Error('本次打开期间没有可撤销操作；重启后可在备份中恢复快照');const previous=clone(this.history.at(-1));await this.commit(previous,'撤销上一步','恢复前一次已确认操作',{undo:false});this.history.pop();}
  async backups(){return this.request('backups');}
  async readBackup(name){return this.request('backups/'+encodeURIComponent(name));}
}
