import {makePlayer,makeUnits} from './players.js';
import {createEvent,makeGroups,startEvent,setScore,confirmAdvancement,match} from './tournament.js';
import {uid,clone,now} from './util.js';
export function regressionDemo(){
  const names=['虚构选手01','虚构选手02','虚构选手03','虚构选手04','虚构选手05','虚构选手06','虚构选手07','虚构选手08'],players=names.map(n=>makePlayer(n)),units=makeUnits(players,'singles'),e=createEvent('八人回归示例（非正式历史）',units,{format:'knockout',groups:2,date:'2026-10-23',stageRule:{target:15,cap:15,bestOf:1,winByTwo:false}}),id=name=>units.find(u=>u.name===name).id;
  startEvent(e,makeGroups(e,[units.slice(0,4).map(u=>u.id),units.slice(4).map(u=>u.id)]));
  const scores=[['虚构选手02','虚构选手04',11,3],['虚构选手01','虚构选手03',11,10],['虚构选手01','虚构选手02',11,6],['虚构选手03','虚构选手04',11,10],['虚构选手01','虚构选手04',11,6],['虚构选手02','虚构选手03',11,9],['虚构选手07','虚构选手08',11,8],['虚构选手07','虚构选手06',11,9],['虚构选手05','虚构选手08',11,8],['虚构选手05','虚构选手07',11,8],['虚构选手06','虚构选手08',11,10],['虚构选手06','虚构选手05',11,10]];
  for(const [a,b,x,y] of scores){const m=e.matches.find(m=>[m.a,m.b].includes(id(a))&&[m.a,m.b].includes(id(b)));setScore(e,m.id,[m.a===id(a)?[x,y]:[y,x]],true,'回归示例');}
  confirmAdvancement(e,e.stages[0].groups[0],['虚构选手02','虚构选手03','虚构选手04','虚构选手01'].map(id),'虚构选手01主动顺延；战绩保留三胜零负','回归示例');
  const s={id:uid('stage'),name:'第二阶段 · 实际确认安排',type:'knockout',roundSize:4,groups:[]};e.stages.push(s);
  const r={target:15,cap:15,bestOf:1,winByTwo:false};
  for(const [a,b,x,y] of [['虚构选手06','虚构选手02',12,15],['虚构选手03','虚构选手05',13,15],['虚构选手07','虚构选手04',12,15],['虚构选手01','虚构选手08',null,null]]){const lower=['虚构选手07','虚构选手01'].includes(a),m=match(s.id,null,id(a),id(b),r,lower?'低位安排（不影响前四）':'半决赛',{classification:lower});e.matches.push(m);if(x!==null)setScore(e,m.id,[[x,y]],true,'回归示例');}
  e.updatedAt=now();return {players,event:e,id};
}
