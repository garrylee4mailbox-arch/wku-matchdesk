import {esc,clone,uid,now,time} from '../core/util.js';
import {SCHEMA,VERSION} from '../core/initial.js';
import {makePackage,inspectPackage,applyPackage,validateData} from '../core/backup.js';
import {csv,bracketSvg,reportHtml} from '../core/exports.js';
import {modal,confirm,download,chooseFile,button,empty,toast} from '../components.js';
import {regressionDemo} from '../core/demo.js';
export function backupPage(ctx){return `<div class="heading"><div><div class="eyebrow">SAFE & LOCAL</div><h1>保存与备份</h1><p>程序更新与数据分开；全量备份用于换电脑和完整恢复。</p></div>${button('backup','导出全量备份','primary')}</div><div class="grid2"><section class="panel"><h2>本机数据位置</h2><p class="break" style="margin-top:15px">${esc(ctx.repo.path)}</p><div class="note">每次成功保存写入 state.json；先落盘临时文件，再原子替换，并保留替换前快照。最近 100 次快照保存在 backups 文件夹。</div><p class="muted" style="font-size:12px">保存状态以页面上方提示为准。两个窗口的版本冲突会阻止覆盖。清空浏览器缓存不删除这些文件。</p></section><section class="panel"><h2>导出与恢复</h2><div class="field-stack" style="margin-top:18px">${button('backup','全量备份 · 队员 / 赛事 / 模板 / 改进')}${button('import','导入单届包或全量备份')}${button('snapshots','从本机自动快照恢复')}<small>单届赛事包在具体赛事右上方导出。CSV、报告与 SVG 供阅读，不能用来恢复进度。</small></div></section></div><div class="section-title"><h2>旧版原始记录</h2></div><div class="note amber">旧版使用了不同的排名算法和固定人数。仅提供原始数据查看和原文件保留，不会把旧规则强行转换为新版成绩；可通过历史补录重建有依据的记录。</div>${ctx.repo.data.legacySources?.length?`<div class="list">${ctx.repo.data.legacySources.map(l=>`<div class="panel row"><div><b>${esc(l.filename)}</b><p class="muted">保留于 ${time(l.at)}</p></div>${button('legacy-export','下载原始文件','small',`data-id="${l.id}"`)}</div>`).join('')}</div>`:empty('尚未保留旧版文件','可从“导入”选择旧版 JSON，查看并将原始内容保存在全量备份中。')}<div class="section-title"><h2>当前版本与手机使用</h2></div><section class="panel"><p>v${VERSION} · 数据格式 ${SCHEMA}</p><p class="muted" style="font-size:12px">界面支持手机屏幕尺寸；当前服务仅监听电脑本机，没有实现手机通过 Wi-Fi 连接录分。公网查看、积分榜、轮换双打及团体赛仍在“待改进”中。</p></section>`;}
async function importPackage(ctx){const file=await chooseFile();if(!file)return;if(file.size>24*1024*1024)throw Error('文件超过24MB，未读取或覆盖数据');const raw=await file.text();let value;try{value=JSON.parse(raw);}catch{throw Error('不是有效JSON，现有数据未改变');}
  if(value.schema==='wku-night-cup/v1'){
    const roster=Array.isArray(value.roster)?value.roster:[],names=new Map(roster.map(p=>[p.id,p.name])),pairs=[[0,1],[1,2],[0,2]];
    const rows=Object.entries(value.scores||{}).map(([id,score])=>{const parts=id.split('-');let ids;if(parts[0]==='s1')ids=roster.filter(p=>p.group===parts[1]).map(p=>p.id);else if(parts[0]==='s2')ids=value.stage2?.groups?.[['A','B','C'].indexOf(parts[1])];const pair=pairs[Number(parts[2])-1];return `<tr><td>${esc(id)}</td><td>${ids&&pair?esc(names.get(ids[pair[0]]))+' — '+esc(names.get(ids[pair[1]])):'原始辅助场次，见原文件'}</td><td>${esc(Array.isArray(score)?score.join(':'):'原始格式')}</td></tr>`;}).join('');
    await modal('旧版原始记录 · 不转换排名',`<div class="note amber">旧版固定九人，且排序与新版不一致。不会自动创建正式历史。原始 JSON 将完整保留，可下载并在旧 HTML 中继续查看。</div><h3>${esc(value.title)}</h3><p>${esc(value.date)} · ${roster.length}人</p><div class="table-wrap"><table><tr><th>场次</th><th>原对阵</th><th>原比分</th></tr>${rows}</table></div>`,{confirm:'保留原始文件',onSubmit:async()=>{const next=ctx.copy();next.legacySources=next.legacySources||[];if(next.legacySources.some(l=>l.raw===raw))throw Error('相同原始文件已保留，不重复添加');next.legacySources.push({id:uid('legacy'),filename:file.name,raw,at:now()});await ctx.save(next,'保留旧版原始文件','未经不可靠转换，不产生新版名次');return true;}});return;
  }
  const preview=inspectPackage(value,ctx.repo.data);if(await confirm('导入预览 · '+preview.action,preview.description+(preview.older?'\n警告：导入记录比本机更旧。请确认确需恢复旧版。':''))){await ctx.save(applyPackage(ctx.repo.data,preview),'导入'+preview.action,'导入前已由保存层建立可恢复快照');ctx.state.route='home';ctx.render();toast('导入完成；同ID赛事不会产生重复副本');}
}
export function dataActions(ctx){return {
  backup:()=>{download(JSON.stringify(makePackage(ctx.repo.data),null,2),'WKU全量备份-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');toast('全量备份已导出');},
  'event-package':()=>download(JSON.stringify(makePackage(ctx.repo.data,ctx.state.eventId),null,2),ctx.event().title+'-完整赛事包.json'),
  'revision-export':el=>{const r=ctx.event().revisions[Number(el.dataset.index)];download(JSON.stringify({schema:'wku-matchdesk-package/v1',version:VERSION,kind:'event',exportedAt:now(),data:r.snapshot},null,2),ctx.event().title+'-v'+r.version+'修订前.json');},
  csv:()=>download(csv(ctx.event()),ctx.event().title+'-完整赛果.csv','text/csv;charset=utf-8'),
  svg:()=>download(bracketSvg(ctx.event()),ctx.event().title+'-完整赛程.svg','image/svg+xml;charset=utf-8'),
  print:()=>{document.querySelector('#print-report').innerHTML=reportHtml(ctx.event());window.print();},import:()=>importPackage(ctx),
  snapshots:async()=>{const backups=await ctx.repo.backups();await modal('本机自动快照',`<div class="note amber">恢复会替换整个本机数据库。选择后先预览，确认恢复前会再保存一份当前数据库。</div>${backups.length?`<div class="field-stack">${backups.map((b,i)=>`<label class="check"><input type="radio" name="snapshot" value="${esc(b.name)}" ${i===0?'checked':''}>${time(b.at)} · ${Math.ceil(b.bytes/1024)} KB</label>`).join('')}</div>`:empty('暂无自动快照','首次创建数据后，每次保存会保留上一版本。')}`,{confirm:'预览并恢复',onSubmit:async f=>{if(!f.get('snapshot'))return true;const snap=await ctx.repo.readBackup(f.get('snapshot'));validateData(snap.data);if(!await confirm('恢复快照？',`快照包含 ${snap.data.players.length} 名队员、${snap.data.events.length} 届赛事。将替换当前全库，当前版本先自动备份。`))return false;await ctx.save(clone(snap.data),'从本机自动快照恢复');ctx.state.route='home';ctx.render();return true;}});},
  'legacy-export':el=>{const l=ctx.repo.data.legacySources.find(l=>l.id===el.dataset.id);download(l.raw,l.filename);},
  demo:async()=>{if(!await confirm('载入八人回归示例','将明确添加一届标为“非正式历史”的示例赛事。不会替换已有赛事，也不把示例队员加入固定库。示例已记录真实回归比分，决赛、季军赛和低位省略场保留未进行。'))return;const d=regressionDemo(),next=ctx.copy();next.events.push(d.event);ctx.state.eventId=d.event.id;ctx.state.eventTab='rankings';ctx.state.route='event';await ctx.save(next,'载入八人回归示例','经用户明确选择创建，不是正式历史');},
  undo:async()=>{
    const step=ctx.repo.previousStep;
    if(!step){toast('本次打开期间没有可回到的上一步');return;}
    const title=step.view?.title;
    await modal('回到上一步',`<p>即将放弃最近一次操作：<b>${esc(step.action)}</b>${title?'（'+esc(title)+'）':''}。</p><div class="note amber">这一步的内容将不再作为当前记录保存，页面和数据会回到执行这一步之前。它会影响最近一次操作涉及的数据。</div><p class="field-help">例如：刚录入的比分会恢复到录入前；刚取消的赛事会重新出现。操作前仍会保留自动快照。</p>`,{confirm:'放弃这一步并返回',onSubmit:async()=>{const restored=await ctx.repo.undo();ctx.restoreView(restored?.view);toast('已回到上一步，刚才那一步的内容已放弃');return true;}});
  }

};}
