import {uid,now} from './util.js';
export const VERSION='1.0.0';
export const SCHEMA='wku-matchdesk/v1';
export const futureItems=[
 ['手机在局域网连接电脑并录分','已适配小屏幕；当前仅监听本机。待实现配对、受限录分权限、地址发现，并进行真机验证。','设备','高'],
 ['队员通过公网实时只读查看','后续评估只读发布与访问控制。','联网','中'],
 ['长期积分规则与积分榜','等待明确积分算法，不从历史名次自动生成积分。','排名','中'],
 ['轮换搭档双打及个人成绩计算','当前只支持整届固定搭档。','赛制','低'],
 ['团体赛','后续设计团体赛项目、人员与比分结构。','赛制','低']
];
export const completedItems=[
 ['Windows离线便携程序与本机文件保存','双击启动，文件原子保存、版本冲突保护、自动快照、重启恢复。','存储','Windows EXE集成测试通过；使用包已构建。'],
 ['三类赛制、固定双打与可调规则','循环、同名次、淘汰与轮空；三局两胜、封顶、同分加赛。','赛制','规则与赛程回归测试通过。'],
 ['八人案例与前轮纠错保留后续','胜场后累计得分排序；人工顺延不改战绩；前轮改分不重置后轮。','排名','真实八人回归案例与逐字段保留断言通过。']
];
export function fresh(){return {schema:SCHEMA,version:VERSION,players:[],events:[],templates:[],improvements:[...futureItems.map(([title,description,module,priority],i)=>({id:'builtin-future-'+i,title,description,module,priority,status:'todo',createdAt:now(),completedAt:null,version:VERSION,completionNote:''})),...completedItems.map(([title,description,module,completionNote],i)=>({id:'builtin-completed-'+i,title,description,module,priority:'高',status:'done',createdAt:now(),completedAt:now(),version:VERSION,completionNote}))],settings:{operator:'现场管理员'},audit:[]};}
