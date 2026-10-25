import {terminal} from './util.js';

export const formalMatches=(event,stage)=>event.matches.filter(m=>m.stage===stage.id&&!m.exhibition&&!m.tiebreak&&!m.classification);
export function eventFlow(event){
  const stage=event.stages.at(-1);
  if(event.status==='archived')return {kind:'results',title:'本届已归档',text:'全部成绩和赛程已保存，可以随时查看。',button:'查看比赛结果'};
  if(!stage)return {kind:'setup',title:'尚未生成赛程',text:'请先确认参赛名单与比赛安排。'};
  const matches=formalMatches(event,stage),complete=matches.every(terminal);
  const finalRound=event.config.format==='roundrobin'||stage.type==='placement'||(stage.type==='knockout'&&stage.roundSize===2);
  if(finalRound&&complete){
    const unsettled=matches.some(m=>m.status==='cancelled'||!m.winner)||event.impacts.some(i=>i.status==='open');
    return {kind:'results',stage:stage.id,title:event.finals?'本届成绩已确认':unsettled?'本届场次已处理，请核对成绩':'本届比赛已全部完成',text:event.finals?'可查看已确认的名次，或继续归档本届。':unsettled?'有作废、未指定胜方或待核查的记录；请在成绩页如实确认。':'决赛及本届需要进行的场次已结束，现在可以核对最终名次。',button:'查看比赛结果 →'};
  }
  if(stage.type==='knockout'||stage.type==='placement'||event.config.format==='roundrobin'){
    if(!complete||stage.type==='knockout'&&matches.some(m=>m.status!=='cancelled'&&!m.winner))return {kind:'score',stage:stage.id,title:stage.name+' · 继续记分',text:'请完成本轮记分；名单可在“晋级与赛程”重新核对。',button:'前往本轮记分 →'};
  }
  return {kind:'advance',ready:complete,stage:stage.id,title:complete?'本轮已完成，可安排下一轮':'小组赛进行中',text:complete?'核对晋级名单及对阵后，确认生成下一轮。':'完成小组赛后可安排下一轮；提前确认时请核对人工晋级顺序。',button:'核对晋级名单与下一轮 →'};
}
