import {terminal,assert} from './util.js';
export const SORT_KEYS={wins:'获胜场数',gameDiff:'净胜局',pointDiff:'净胜分',points:'累计得分',headToHead:'相互交手'};
function collect(ids,matches){
  const rows=new Map(ids.map(id=>[id,{id,played:0,wins:0,losses:0,points:0,against:0,gameDiff:0,pointDiff:0}]));
  for(const m of matches){
    if(!rows.has(m.a)||!rows.has(m.b))continue;
    const a=rows.get(m.a),b=rows.get(m.b);
    if(m.status==='completed'){
      a.played++;b.played++;
      const w=m.winner===m.a?a:b,l=w===a?b:a;w.wins++;l.losses++;
      for(const [x,y] of m.games){a.points+=x;a.against+=y;b.points+=y;b.against+=x; a.gameDiff+=x>y?1:-1;b.gameDiff+=y>x?1:-1;}
    }else if(['walkover','withdrawn'].includes(m.status)){
      if(m.policy?.countWin && m.winner){const w=rows.get(m.winner),l=m.winner===m.a?b:a;w.wins++;l.losses++;w.played++;l.played++;}
      if(m.policy?.countPoints)for(const [x,y] of m.games||[]){a.points+=x;a.against+=y;b.points+=y;b.against+=x;}
    }
  }
  for(const r of rows.values())r.pointDiff=r.points-r.against;
  return [...rows.values()];
}
export function standings(event,group){
  const matches=event.matches.filter(m=>m.pool===group.id&&!m.exhibition&&!m.tiebreak);
  const rows=collect(group.units,matches), keys=event.config.sort;
  function resolve(list,ki=0){
    if(list.length<=1||ki>=keys.length)return [list];
    const key=keys[ki];let metrics;
    if(key==='headToHead'){
      const ids=list.map(r=>r.id), relevant=matches.filter(m=>ids.includes(m.a)&&ids.includes(m.b));
      const expected=ids.length*(ids.length-1)/2;
      if(relevant.length!==expected || !relevant.every(terminal))return resolve(list,ki+1);
      metrics=new Map(collect(ids,relevant).map(r=>[r.id,r.wins]));
    }else metrics=new Map(list.map(r=>[r.id,r[key]]));
    const buckets=new Map();for(const r of list){const v=metrics.get(r.id); if(!buckets.has(v))buckets.set(v,[]);buckets.get(v).push(r);}
    return [...buckets.keys()].sort((a,b)=>b-a).flatMap(v=>resolve(buckets.get(v),ki+1));
  }
  let rank=1; const ties=[],ordered=[];
  for(const bucket of resolve(rows)){if(bucket.length>1)ties.push(bucket.map(r=>r.id));for(const r of bucket)ordered.push({...r,rank,tied:bucket.length>1});rank+=bucket.length;}
  const requiredPairs=[];for(let i=0;i<group.units.length;i++)for(let j=i+1;j<group.units.length;j++)requiredPairs.push([group.units[i],group.units[j]]);
  const complete=matches.every(terminal)&&requiredPairs.every(([a,b])=>matches.some(m=>[m.a,m.b].includes(a)&&[m.a,m.b].includes(b)&&terminal(m)));
  return {rows:ordered,ties,complete,ready:complete&&!ties.length,scope:'仅本组已确认正式比赛；草稿、加赛和趣味赛不计入累计得分'};
}
export function suggestedOrder(event,group){return standings(event,group).rows.map(r=>r.id);}
export function advancementOrder(event,group){
  const manual=event.advancement[group.id];if(manual?.confirmed)return manual.confirmed;
  const r=standings(event,group);assert(r.ready,group.name+'尚未完赛或存在同分，请确认人工晋级顺序');return r.rows.map(p=>p.id);
}
export function inferResults(event){
  const out=[];const name=id=>event.units.find(u=>u.id===id)?.name||'未知';
  const add=(id,from,to,note='')=>out.push({unit:id,name:name(id),from,to,status:from===to?'ranked':'unresolved',note});
  const ko=event.stages.filter(s=>s.type==='knockout');
  const placement=event.stages.find(s=>s.type==='placement');
  if(!ko.length&&!placement&&event.config.format!=='roundrobin'){
    for(const u of event.units)add(u.id,1,event.units.length,'仅有小组阶段，最终名次尚未决出');
    return out;
  }
  if(ko.length){
    const last=ko.at(-1),lastMatches=event.matches.filter(m=>m.stage===last.id&&!m.exhibition&&!m.tiebreak&&!m.classification);
    if(last.roundSize===2){
      const final=lastMatches.find(m=>m.label==='决赛');
      if(final){if(terminal(final)&&final.winner){add(final.winner,1,1);add(final.winner===final.a?final.b:final.a,2,2);}else [final.a,final.b].filter(Boolean).forEach(id=>add(id,1,2,'决赛未决'));}
      const bronze=lastMatches.find(m=>m.label==='季军赛');
      if(bronze){if(terminal(bronze)&&bronze.winner){add(bronze.winner,3,3);add(bronze.winner===bronze.a?bronze.b:bronze.a,4,4);}else [bronze.a,bronze.b].filter(Boolean).forEach(id=>add(id,3,4,'季军赛未决'));}
    }
    // Each completed elimination round defines the losers' true shared interval.
    for(const stage of ko){
      const ms=event.matches.filter(m=>m.stage===stage.id&&m.label!=='季军赛'&&!m.exhibition&&!m.tiebreak&&!m.classification&&m.status!=='cancelled');
      for(const m of ms){
        if(m.status==='bye')continue;
        if(terminal(m)&&m.winner){const loser=m.winner===m.a?m.b:m.a;if(loser&&!out.some(r=>r.unit===loser))add(loser,stage.roundSize/2+1,Math.min(stage.roundSize,event.units.length),'本轮淘汰 / 并列');}
        else for(const id of [m.a,m.b].filter(Boolean))if(!out.some(r=>r.unit===id))add(id,1,Math.min(stage.roundSize,event.units.length),'淘汰赛尚未决出');
      }
    }
  }else{
    const stage=event.stages.find(s=>s.type==='placement')||event.stages[0];
    for(const g of stage?.groups||[]){const rank=standings(event,g),start=g.start||1;
      for(const r of rank.rows){const size=rank.ties.find(t=>t.includes(r.id))?.length||1; add(r.id,rank.complete?start+r.rank-1:start,rank.complete?start+r.rank+size-2:start+g.units.length-1,rank.complete?(r.tied?'同分待裁定':''):'该名次组尚未完成');}
    }
  }
  const entrants=ko.length?[...new Set(event.matches.filter(m=>m.stage===ko[0].id&&!m.exhibition&&!m.tiebreak&&!m.classification).flatMap(m=>[m.a,m.b]).filter(Boolean))]:[];
  for(const u of event.units)if(!out.some(r=>r.unit===u.id)){
    if(entrants.length&&!entrants.includes(u.id))add(u.id,entrants.length+1,event.units.length,'小组未晋级 / 并列');
    else add(u.id,1,entrants.length||event.units.length,'名次未决');
  }
  return out.sort((a,b)=>a.from-b.from);
}
