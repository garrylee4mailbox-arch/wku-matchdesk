import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../ui/core/initial.js';
import {regressionDemo} from '../ui/core/demo.js';
import {playerPage} from '../ui/views/dashboard.js';
import {teamActions} from '../ui/actions/team.js';
import {validateData,validateEvent} from '../ui/core/backup.js';
test('首次启动不带队员与赛事数据，队员页没有旧真实名单初始化入口',()=>{
  const data=fresh();validateData(data);assert.deepEqual(data.players,[]);assert.deepEqual(data.events,[]);assert.ok(!playerPage(data).includes('seed-roster'));assert.ok(!('seed-roster' in teamActions({})));
});
test('完整八人示例只使用虚构编号，保留原计分、顺延和后续安排语义',()=>{
  const {players,event,id}=regressionDemo();validateEvent(event);assert.equal(players.length,8);assert.ok(players.every(p=>/^虚构选手\d{2}$/.test(p.name)));assert.ok(event.units.every(u=>/^虚构选手\d{2}$/.test(u.name)));assert.equal(event.matches.find(m=>m.a===id('虚构选手01')&&m.b===id('虚构选手08')).status,'pending');
});
