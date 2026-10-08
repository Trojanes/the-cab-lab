# 当前状态

更新时间：2026-10-07

## Git

```text
Trojanes/the-cab-lab
main   551478f9

yzhan722/the-cab-lab
main   551478f9
devops 4ad1c24
```

`devops` 比 `main` 多：

- T01 数据契约（job/Board/cnjob 三层运行时校验）
- T02 Golden + 跨仓回放
- T03 Application API（进行中）

## 已形成

- Space / Floor Plan
- CAD Placement / Snap / Inference
- Native Generator
- Module → Board → Face
- Generator Bench
- Sketch Board
- Material / Finish / Edge Band
- Groove / Milling
- cnjob Export
- Cloud Storage Phase 1

## 当前工作

- 工程文档整理
- T03 业务逻辑与 UI 解耦：`renderer/fit.js` 空间合法性几何已独立
  （envelope/footprints/overlaps/statusOf/exportFitIssues），
  `renderer/appApi.js` + `docs/APP-API.md` = Agent 可调用面
- T04 语义 diff：`generators/_lib/snapshotDiff.ts` +
  `scripts/diff-snapshots.mjs --regen`
- 测试体系整理
- Cab Lab / OmniCam 集成规范

## 下一步

1. 明确 `cnjob` Contract
2. 建立 Generator Golden Test
3. 建立 Issue → PR → Test 流程
4. 逐步记录关键架构决定
