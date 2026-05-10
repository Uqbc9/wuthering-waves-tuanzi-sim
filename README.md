# 小团快跑本地模拟器

一个零后端、方便传播的浏览器本地 Monte Carlo 模拟器，用来复现《鸣潮》「小团快跑・锦标赛」赛程模拟、结果统计和赛局回放。

网页打开后，模拟逻辑全部在用户手机或电脑浏览器中运行；批量计算放在 Web Worker 里，不依赖 Python 服务、FastAPI 或云端算力。

## 功能

- 选择单场赛或汇总赛赛程。
- 设置模拟次数与随机种子。
- 浏览器本地计算冠军率、Top2、Top4、平均名次、晋级率、平均积分等结果。
- SVG 赛道回放随机样本，支持播放、逐步查看和切换样本。
- 分享链接会保留当前赛程、模拟次数和种子参数。
- 手机端和桌面端响应式适配。

## 技术栈

- Vite
- React
- TypeScript
- Web Worker
- SVG

## 目录

```text
.
├─ data/
│  └─ tuanzi_championship_2026.json
├─ src/
│  ├─ App.tsx
│  ├─ config.ts
│  ├─ styles.css
│  ├─ types.ts
│  ├─ lib/
│  │  ├─ rng.ts
│  │  ├─ sim.ts
│  │  ├─ sim.test.ts
│  │  └─ visual.ts
│  └─ workers/
│     └─ simWorker.ts
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

## 本地运行

```powershell
npm install
npm run dev
```

默认开发地址：

```text
http://localhost:5173/
```

## 构建

```powershell
npm run build
```

构建产物输出到 `dist/`。`vite.config.ts` 使用 `base: "./"`，可部署到 GitHub Pages、Cloudflare Pages、Vercel 静态站点或任意静态文件服务器。

## 测试

```powershell
npm test
```

测试覆盖配置校验、固定种子复现、汇总计数完整性和回放时间线。

## 数据配置

默认配置来自：

```text
data/tuanzi_championship_2026.json
```

更新团子、赛道、技能或赛程后，网页会在下一次构建或开发服务刷新时读取新配置。

## 说明

浏览器端使用 TypeScript 伪随机数生成器。相同网页参数可复现网页结果，但不承诺与 Python `random.Random` 的同一种子逐步完全一致。

## 贡献指南

欢迎提交 Issue 或 Pull Request！如果您有更好的数据统计方式或视觉交互想法，欢迎来帮助改进本项目。

## 许可协议

本项目采用 [MIT License](https://opensource.org/licenses/MIT) 协议开源。
