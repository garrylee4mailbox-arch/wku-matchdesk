import {esc,statusName,time} from './util.js';
import {ruleText} from './rules.js';
import {standings,inferResults} from './ranking.js';
export function csv(event){
  const name=id=>[...event.units,...(event.activityUnits||[])].find(u=>u.id===id)?.name||'',out=[['赛事',event.title],['日期',event.date],['说明','全部阶段、低位选手、趣味赛及未进行的比赛均保留；空比分不代表负'],[],['比赛ID','阶段','组别 / 用途','甲方','乙方','每局比分','状态','获胜方','规则','处理策略 / 备注']];
  for(const m of event.matches)out.push([m.id,event.stages.find(s=>s.id===m.stage)?.name||'辅助活动',m.label,(m.lineups?.[m.a]?.name||name(m.a)),(m.lineups?.[m.b]?.name||name(m.b)),m.games.map(g=>g.join(':')).join(' / '),statusName(m.status),(m.lineups?.[m.winner]?.name||name(m.winner)),ruleText(m.rules),[m.note,m.policy?JSON.stringify(m.policy):'',m.exhibition?'趣味赛，不影响正式排名':'',m.tiebreak?'加赛，不计原组累计得分':''].filter(Boolean).join('；')]);
  out.push([],['统计范围','各组分别统计，仅已确认正式比赛；加赛与趣味赛排除'],['阶段','组别','姓名','胜','负','累计得分','失分','净胜分','净胜局','统计名次 / 同分']);
  for(const s of event.stages)for(const g of s.groups)for(const r of standings(event,g).rows)out.push([s.name,g.name,name(r.id),r.wins,r.losses,r.points,r.against,r.pointDiff,r.gameDiff,r.rank+(r.tied?' 同分待定':'')]);
  out.push([],['最终成绩','名次起','名次止','状态','依据']);for(const r of event.finals?.rows||inferResults(event))out.push([name(r.unit),r.from,r.to,r.status,r.note||event.finals?.reason||'尚未确认']);
  const protect=v=>/^[=+\-@\t\r]/.test(String(v))?"'"+v:String(v??'');
  return '\ufeff'+out.map(row=>row.map(v=>'"'+protect(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
export function bracketSvg(event){
  const columns=event.stages.length?event.stages:[{id:'extra',name:'辅助活动'}],width=Math.max(900,columns.length*340),max=Math.max(1,...columns.map(s=>event.matches.filter(m=>m.stage===s.id).length)),height=170+max*100,name=id=>[...event.units,...(event.activityUnits||[])].find(u=>u.id===id)?.name||'轮空';
  let body=`<rect width="100%" height="100%" fill="#f3f6f5"/><text x="28" y="40" font-size="24" font-weight="bold">${esc(event.title)}</text><text x="28" y="68" font-size="13" fill="#526861">${esc(event.date)} · 全部赛程 / 晋级安排 · 实际确认安排以档案为准</text>`;
  for(let si=0;si<columns.length;si++){
    const s=columns[si],x=28+si*340;body+=`<text x="${x}" y="110" font-size="17" font-weight="bold">${esc(s.name)}</text>`;
    event.matches.filter(m=>m.stage===s.id).forEach((m,i)=>{const y=130+i*100;body+=`<rect x="${x}" y="${y}" width="305" height="83" rx="8" fill="white" stroke="#cbd9d2"/><text x="${x+12}" y="${y+20}" font-size="11" fill="#526861">${esc(m.label)} · ${esc(statusName(m.status))}</text><text x="${x+12}" y="${y+43}" font-size="13">${esc((m.lineups?.[m.a]?.name||name(m.a)))} vs ${esc((m.lineups?.[m.b]?.name||name(m.b)))}</text><text x="${x+12}" y="${y+65}" font-size="13" fill="#17744c">${esc(m.games.length?m.games.map(g=>g.join(' : ')).join(' / '):m.status==='bye'?'轮空，无比分':'未进行 / 无比分')}</text>`;});
  }
  for(let si=0;si<columns.length-1;si++){const x=337+si*340;body+=`<path d="M${x} 115h22l-5 -5m5 5l-5 5" stroke="#17744c" fill="none"/>`;}
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Microsoft YaHei, sans-serif" fill="#19382d">${body}</svg>`;
}
export function reportHtml(event){
  const name=id=>[...event.units,...(event.activityUnits||[])].find(u=>u.id===id)?.name||'轮空',rows=event.finals?.rows||inferResults(event),display=rows.filter(r=>r.from<=(event.config.displayTop||4));
  return `<h1>${esc(event.title)}</h1><p>${esc(event.date)} · ${event.config.type==='doubles'?'固定搭档双打':'单打'} · ${event.finals?'已确认实际成绩':'名次尚未确认'} · 版本 ${event.version}</p><h2>成绩（展示前${event.config.displayTop||4}名）</h2><table><tr><th>名次 / 区间</th><th>队员 / 组合</th><th>状态 / 依据</th></tr>${display.map(r=>`<tr><td>${r.from===r.to?r.from:r.from+'—'+r.to}</td><td>${esc(name(r.unit))}</td><td>${esc(r.status==='unresolved'?'未决':r.status==='withdrawn'?'退赛':r.status==='approximate'?'近似补录':'已确认')} ${esc(r.note)}</td></tr>`).join('')}</table>${event.stages.map(s=>`<h2>${esc(s.name)}</h2><table><tr><th>用途</th><th>对阵</th><th>比分</th><th>状态 / 备注</th></tr>${event.matches.filter(m=>m.stage===s.id).map(m=>`<tr><td>${esc(m.label)}</td><td>${esc((m.lineups?.[m.a]?.name||name(m.a)))} — ${esc((m.lineups?.[m.b]?.name||name(m.b)))}</td><td>${esc(m.games.map(g=>g.join(':')).join(' / ')||'无比分')}</td><td>${esc(statusName(m.status))} ${esc(m.note)}</td></tr>`).join('')}</table>`).join('')}<h2>管理员调整记录</h2>${event.audit.map(a=>`<p>${esc(time(a.at))} · ${esc(a.operator)} · ${esc(a.action)} · ${esc(a.reason)}</p>`).join('')}<p>统计按各阶段已确认正式比赛；加赛和趣味赛不计原组累计得分。保存时间：${esc(time(event.updatedAt))}</p>`;
}
