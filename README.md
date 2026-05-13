# 鸣潮小团快跑本地模拟器

一个基于 React + Vite 的浏览器本地 Monte Carlo 模拟器，用于模拟 2026 鸣潮「小团快跑・锦标赛」团子赛局。项目把赛道、团子技能、布大王行动、堆叠顺序和赛局回放都放在前端本地运行，不需要后端服务。

![模拟器预览](docs/images/simulator-preview.png)

## 功能

- 手动选择参赛团子，支持 A/B/C 组三组共 18 名团子。
- 支持第一圈与第二圈赛况设定；第二圈可输入当前站位和同格先后顺序。
- 可配置模拟次数、随机种子，并生成可分享的 URL 参数。
- 使用 Web Worker 执行模拟，避免大量 Monte Carlo 计算阻塞界面。
- 输出冠军率、Top2、Top4、平均名次等统计结果。
- 提供赛局样本回放，可逐步查看行动顺序、骰点、机关触发、堆叠变化和最终排名。
- 内置中文 / English 界面切换。

## 模拟规则概览

当前配置来自 [`data/tuanzi_championship_2026.json`](data/tuanzi_championship_2026.json)：

- 赛道长度：32 格，起点与终点共用 0/32。
- 第一圈团子默认从 1 开始；开局起点不判定堆叠前后。
- 普通团子骰面：1、2、3。
- 布大王骰面：1、2、3、4、5、6，默认第 3 轮加入行动。
- 赛道机关：
  - 推进装置：落地后前进 1 格。
  - 阻遏装置：落地后后退 1 格。
  - 时空裂隙：打乱本格堆叠顺序。
- 当前数据包含 18 名团子，按 A/B/C 组各 6 名配置。
- 内置赛局包括 A 组上半场、A 组下半场、A 组汇总晋级模拟，以及 18 人模板赛。

部分公开细则不足的地方以配置中的 `assumptions` 字段建模，后续可以直接调整 JSON 配置或模拟逻辑。

## 快速开始

```bash
npm install
npm run dev
```

开发服务器默认监听所有地址：

```text
http://localhost:5173
```

## 常用脚本

```bash
npm run dev
npm run build
npm run preview
npm test
```

- `npm run dev`：启动 Vite 开发服务器。
- `npm run build`：执行 TypeScript 检查并构建生产版本。
- `npm run preview`：本地预览构建结果。
- `npm test`：运行 Vitest 单元测试。

## URL 参数

应用会把当前模拟设定写入地址栏，方便复制链接复现同一组输入：

- `lang`：界面语言，`zh` 或 `en`。
- `runs`：模拟次数，默认 `30000`，接受正整数输入。
- `lap`：圈数模式，`first` 或 `second`。
- `racers`：参赛团子 ID 列表。
- `positions`：每名团子的当前位置。
- `order`：同格顺序。
- `seed`：随机种子。

示例：

```text
?lang=zh&runs=30000&lap=second&racers=denia,phoebe,siglica&positions=denia:32,phoebe:31,siglica:31&order=denia,siglica,phoebe&seed=20260510
```

## 项目结构

```text
assets/tuanzi-icons/          团子头像资源
data/tuanzi_championship_2026.json
docs/images/                  README 与文档图片
src/App.tsx                   主界面与参数状态
src/components/               结果面板与回放面板
src/lib/sim.ts                核心模拟规则
src/lib/visual.ts             回放数据与赛道可视化
src/workers/simWorker.ts      Web Worker 模拟入口
src/i18n.ts                   中英文文案与名称翻译
```
