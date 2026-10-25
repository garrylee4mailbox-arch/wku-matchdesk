# 数据、迁移与恢复约定

- `state.json`：`{storageVersion:1, revision:<单调递增整数>, data:<全库>}`。服务以 If-Match 修订号检查并发。
- 全库 schema：`wku-matchdesk/v1`；players / events / templates / improvements / settings / audit；可选 legacySources 保留旧文件原文。
- 导出包 schema：`wku-matchdesk-package/v1`；kind 为 full 或 event，含版本、导出时间和完整 data。
- event 包含稳定ID、项目配置、原始队员与组合快照、stages、matches、advancement、impacts、finals、audit、revisions；不同届独立规则，不读取当前队员信息重算。
- 每场独立保留 rules、games、status、winner、policy、operator。bye 必须无对手、无比分。草稿不计统计，作废保留原始比分。
- advancement 保存统计建议与管理员 confirmed 顺序。finals 是管理员确认的实际最终成绩，与晋级位置分开。
- finals.rows 中 from/to 可为同一个名次或区间；status ranked / unresolved / withdrawn / approximate 区分明确、未决、退赛与近似补录。
- 归档修订前保存版本快照在 event.revisions，同时文件保存层自动保留修改前全库。修订版本可导出。
- 每次持久化先完整写入 .tmp 并 Flush(true)，以 File.Replace 原子替换，备份旧版本。失败时前端停止写入；不能把仅显示在输入框中的数字视为已保存。
- 当前没有需要执行的跨版本迁移。未来更新先复制完整数据目录，再针对明确版本写迁移函数并测试；遇到未知 schema 当前拒绝导入或覆盖，绝不以空库替换无法解析的数据。
- API 仅监听本机随机端口，启动生成随机会话 Cookie，校验 Host/Origin；不提供局域网端口或管理员网络登录。
- `session.json` 含本机端口与临时令牌，仅用于重新打开或测试；不在导出包内，不应分享。退出时删除。
- 自动快照最近100次；长期保留请导出全量文件至另一块磁盘。数据上限24MB适合校队规模，超过后需做明确迁移，当前拒绝保存。

导入先验证版本、稳定ID唯一性、参赛成员、规则、比赛引用、完赛比分与胜方、晋级和最终名次。单届同ID强制明确替换，不自动合并或按导入次数复制。全量备份是整库恢复而非双向合并。
