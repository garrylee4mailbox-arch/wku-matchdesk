import test from 'node:test';
import assert from 'node:assert/strict';
import {newDraft,captureSetupData,validateParticipants,preparePreview,validatePreview,createFromDraft} from '../ui/actions/setup.js';
import {createPage} from '../ui/views/setup.js';
import {makePlayer} from '../ui/core/players.js';
import {startEvent} from '../ui/core/tournament.js';
const roster=()=>({players:Array.from({length:10},(_,i)=>makePlayer('队员'+(i+1),i%2?'female':'male')),events:[],templates:[]});
function selected(data){const d=newDraft();d.selected=data.players.map(p=>p.id);return d;}
const fields=entries=>{const f=new FormData();for(const [k,v] of entries)f.append(k,String(v));return f;};

test('创建前两步保留草稿，往返预览保留手动分组，不写正式赛事',async()=>{
  const data=roster(),d=selected(data);let saves=0;
  const ctx={state:{draft:d,past:false},repo:{data},render(){},copy:()=>structuredClone(data),save(){saves++;}};
  await createFromDraft(ctx);assert.equal(d.step,2);assert.equal(saves,0);
  await createFromDraft(ctx);assert.equal(d.step,3);assert.equal(data.events.length,0);assert.equal(saves,0);
  const ids=d.preview.event.units.map(u=>u.id);
  d.preview.groups[0].units=ids.slice(0,4);d.preview.groups[1].units=ids.slice(4);d.preview.groups[0].locked=[ids[0]];
  assert.ok(createPage(data,d).includes('A组 4 人、B组 6 人'));
  const previous=structuredClone(d.preview);d.step=2;preparePreview(data,d);assert.deepEqual(d.preview,previous);
  d.config.rule.target=15;d.config.rule.cap=15;preparePreview(data,d);
  assert.notEqual(d.preview.signature,previous.signature);assert.equal(d.preview.event.config.rule.target,15);
});
test('三种赛制按人数生成预期场数，不使用无关的晋级或阶段设置',()=>{
  for(const [format,first,second] of [['roundrobin',45,0],['placement',20,5],['knockout',20,4]]){
    const data=roster(),d=selected(data);d.config.format=format;
    if(format==='roundrobin'){d.config.groups=99;d.config.qualify=0;d.config.stageRule={target:0};}
    if(format==='placement')d.config.qualify=0;
    preparePreview(data,d);const result=validatePreview(d);
    assert.equal(result.summary.first,first);assert.equal(result.summary.second,second);
    const e=structuredClone(d.preview.event);startEvent(e,result.groups);assert.equal(e.matches.length,first);
  }
});
test('仅限性别时报告不合适队员，未知性别在男女不限时可参赛',()=>{
  const data=roster(),d=selected(data);data.players[0].gender='unknown';
  assert.equal(validateParticipants(data,d).length,10);d.config.mixed=false;
  assert.throws(()=>validateParticipants(data,d),/队员1/);assert.equal(d.selected.length,10);
});
test('双打按组合数分组，拒绝奇数和重复搭档，手动选择不会被悄悄重配',()=>{
  const data=roster(),d=selected(data);d.config.type='doubles';
  d.pairs=Array.from({length:5},(_,i)=>d.selected.slice(i*2,i*2+2));
  preparePreview(data,d);assert.equal(d.preview.event.units.length,5);
  const {summary}=validatePreview(d);assert.equal(summary.first,4);assert.equal(summary.second,2);
  const f=fields([['title',d.title],['date',d.date],['type','doubles'],['scope','all'],...d.selected.map(id=>['player',id]),...d.selected.map(()=>['pair',d.selected[0]])]);
  captureSetupData(d,f);assert.throws(()=>validateParticipants(data,d),/重复/);
  d.selected.pop();assert.throws(()=>validateParticipants(data,d),/奇数/);
});
test('赛制定制不覆盖第一步信息，后续单独规则初次开启采用当前规则',()=>{
  const data=roster(),d=selected(data);d.step=2;const before=structuredClone({title:d.title,date:d.date,selected:d.selected});
  const f=fields([['template',''],['format','knockout'],['groups',2],['qualify',2],['rule-target',15],['rule-bestOf',1],['rule-winByTwo','false'],['stageMode','custom'],['sort-0','wins'],['sort-1','points'],['displayTop',4],['bronze','yes']]);
  captureSetupData(d,f);assert.deepEqual({title:d.title,date:d.date,selected:d.selected},before);
  assert.deepEqual(d.config.stageRule,{target:15,bestOf:1,winByTwo:false,cap:15});preparePreview(data,d);
});
test('无效排名、空分组和不足两名晋级均阻止确认',()=>{
  const data=roster(),d=selected(data);d.config.sort=['wins','wins'];assert.throws(()=>preparePreview(data,d),/排序/);
  d.config.sort=['wins','points'];d.config.format='knockout';d.config.groups=1;d.config.qualify=1;assert.throws(()=>preparePreview(data,d),/至少需要两/);
  d.config.groups=2;preparePreview(data,d);d.preview.groups[0].units.push(...d.preview.groups[1].units);d.preview.groups[1].units=[];
  assert.throws(()=>validatePreview(d),/每组至少/);
});
test('三页只显示当前步骤相关的控件，赛制和规则均用中文解释',()=>{
  const data=roster(),d=selected(data);let html=createPage(data,d);
  assert.ok(html.includes('参赛范围'));assert.ok(!html.includes('name="format"'));assert.ok(!html.includes('关闭共赛时的性别'));
  d.step=2;d.config.format='roundrobin';html=createPage(data,d);
  assert.equal((html.match(/type="radio" name="format"/g)||[]).length,3);
  for(const name of ['groups','qualify','stageMode','bronze'])assert.ok(!html.includes('name="'+name+'"'),name);
  assert.ok(html.includes('累计得分'));assert.ok(!html.includes('英文逗号'));
  d.config.format='placement';html=createPage(data,d);assert.ok(html.includes('name="groups"'));assert.ok(!html.includes('name="qualify"'));
  d.config.format='knockout';preparePreview(data,d);d.step=3;html=createPage(data,d);
  assert.ok(html.includes('第一阶段实际对阵'));assert.ok(html.includes('确认并生成赛程'));
});
