import {makePlayer,makeUnits} from './players.js';
import {createEvent,makeGroups,startEvent,setScore,confirmAdvancement,match} from './tournament.js';
import {uid,clone,now} from './util.js';
export function regressionDemo(){
  const names=['李冠霖','夏熠然','杨清雅','朱序元','胡恩泽','朱政德','司逸湘','邹子慕'],players=names.map(n=>makePlayer(n)),units=makeUnits(players,'singles'),e=createEvent('八人回归示例（非正式历史）',units,{format:'knockout',groups:2,date:'2026-10-23',stageRule:{target:15,cap:15,bestOf:1,winByTwo:false}}),id=name=>units.find(u=>u.name===name).id;
  startEvent(e,makeGroups(e,[units.slice(0,4).map(u=>u.id),units.slice(4).map(u=>u.id)]));
  const scores=[['夏熠然','朱序元',11,3],['李冠霖','杨清雅',11,10],['李冠霖','夏熠然',11,6],['杨清雅','朱序元',11,10],['李冠霖','朱序元',11,6],['夏熠然','杨清雅',11,9],['司逸湘','邹子慕',11,8],['司逸湘','朱政德',11,9],['胡恩泽','邹子慕',11,8],['胡恩泽','司逸湘',11,8],['朱政德','邹子慕',11,10],['朱政德','胡恩泽',11,10]];
  for(const [a,b,x,y] of scores){const m=e.matches.find(m=>[m.a,m.b].includes(id(a))&&[m.a,m.b].includes(id(b)));setScore(e,m.id,[m.a===id(a)?[x,y]:[y,x]],true,'回归示例');}
  confirmAdvancement(e,e.stages[0].groups[0],['夏熠然','杨清雅','朱序元','李冠霖'].map(id),'李冠霖主动顺延；战绩保留三胜零负','回归示例');
  const s={id:uid('stage'),name:'第二阶段 · 实际确认安排',type:'knockout',roundSize:4,groups:[]};e.stages.push(s);
  const r={target:15,cap:15,bestOf:1,winByTwo:false};
  for(const [a,b,x,y] of [['朱政德','夏熠然',12,15],['杨清雅','胡恩泽',13,15],['司逸湘','朱序元',12,15],['李冠霖','邹子慕',null,null]]){const lower=['司逸湘','李冠霖'].includes(a),m=match(s.id,null,id(a),id(b),r,lower?'低位安排（不影响前四）':'半决赛',{classification:lower});e.matches.push(m);if(x!==null)setScore(e,m.id,[[x,y]],true,'回归示例');}
  e.updatedAt=now();return {players,event:e,id};
}
