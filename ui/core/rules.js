import {assert} from './util.js';
export const DEFAULT_RULE = Object.freeze({target:11,bestOf:1,winByTwo:false,cap:11});
export function validateRule(r) {
  assert(Number.isInteger(r.target) && r.target>=1 && r.target<=99, '目标分须为 1—99 的整数');
  assert([1,3].includes(r.bestOf), '仅支持单局或三局两胜');
  assert(typeof r.winByTwo==='boolean', '领先两分设置无效');
  assert(r.cap===null || Number.isInteger(r.cap) && r.cap>=r.target && r.cap<=199, '封顶分须不低于目标分，且不超过199');
  if(!r.winByTwo) assert(r.cap===r.target, '不加分时，封顶分应等于目标分');
  return r;
}
export function gameWinner(game, rule) {
  validateRule(rule);
  assert(Array.isArray(game) && game.length===2 && game.every(v=>Number.isInteger(v)&&v>=0), '每局须输入两个非负整数');
  const [a,b]=game, high=Math.max(a,b), low=Math.min(a,b);
  assert(rule.cap===null || high<=rule.cap, '比分超过封顶分');
  assert(rule.winByTwo || high<rule.target || high!==low, '先到目标分即结束，不可能双方同时到达目标分');
  assert(rule.cap===null || high!==low || high<rule.cap, '双方不能同时达到封顶分');
  if(high===low) return null;
  if(high<rule.target) return null;
  if(!rule.winByTwo) {assert(high===rule.target, '先到目标分即结束，不能超出目标分'); return a>b?'a':'b';}
  const ended = high-low>=2 || high===rule.cap;
  if(!ended) return null;
  // Reject scores reached only after a game should already have ended.
  assert(high===rule.target || high-low===2 || (high===rule.cap && high-low<=2), '该局应在更早比分结束');
  return a>b?'a':'b';
}
export function evaluateGames(games, rule, requireComplete=false) {
  validateRule(rule); assert(Array.isArray(games)&&games.length<=rule.bestOf, '局数超出配置');
  let a=0,b=0, unfinished=false;
  for(const game of games){
    assert(a<Math.ceil(rule.bestOf/2)&&b<Math.ceil(rule.bestOf/2), '比赛已结束，不能继续录入多余局');
    assert(!unfinished, '未完成的一局后不能录入下一局');
    const w=gameWinner(game,rule); if(w==='a')a++; else if(w==='b')b++; else unfinished=true;
  }
  const winner=a>=Math.ceil(rule.bestOf/2)?'a':b>=Math.ceil(rule.bestOf/2)?'b':null;
  if(requireComplete) assert(winner,'比分尚未达到完赛条件，请保存草稿');
  return {winner, a,b,complete:!!winner};
}
export const ruleText = r => `${r.bestOf===3?'三局两胜':'一局'} · ${r.target}分 · ${r.winByTwo?'领先两分':'先到即胜'}${r.cap!==null?' · '+r.cap+'封顶':''}`;
