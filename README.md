# 逃生門計畫（Escape Door Roguelite）

一款以「先畫逃跑路線，再親眼看角色照著計畫奔跑」為核心的 2D 逃亡遊戲原型。

目前版本為 **Phase P1.0：固定關卡的 2D 核心循環原型**。

## 線上遊玩

[開啟 Phase P1.0 原型](https://escape-door-p1.numbandfaint123.chatgpt.site)

## 核心玩法

1. 玩家取得一張尚未規劃路線的地下層地圖。
2. 從角色起點開始，以滑鼠點擊或拖曳相鄰節點，親手畫出逃跑路線。
3. 路線必須取得鑰匙，並以逃生門作為終點。
4. 確認路線後，角色會完全依照玩家畫出的順序自動奔跑。
5. 玩家必須在奔跑途中觀察短暫出現的門鎖提示。
6. 抵達逃生門後，依記憶完成解鎖與封門操作。
7. 在殺手倒數結束前鎖好門，完成逃生。

玩家畫出的路線會直接影響：

- 奔跑距離與耗時
- 會遇到哪些環境提示
- 抵達門前剩餘的操作時間
- 最終能否成功逃生

## P1.0 驗證目標

- 玩家是否能理解「畫線就是計畫」，不需要另外選擇預設方案。
- 玩家是否相信角色真的依照自己畫出的路線奔跑。
- 路線長短、提示取得與門前倒數是否能形成有意義的取捨。
- 「規劃 → 奔跑 → 記憶提示 → 解鎖 → 封門」是否具備完整且有趣的核心循環。

## 操作方式

- 規劃階段：點擊或拖曳相鄰地圖節點。
- 返回上一步：按「返回一步」。
- 清除計畫：按「清除路線」。
- 奔跑階段：點擊提示物件，或按 `Space` 聚焦。
- 逃生門階段：依沿途提示操作旋鈕、敲門、關門與上鎖。

## 本機執行

需求：

- Node.js `>= 22.13.0`
- npm
- Linux、WSL 或相容的 Bash 環境

安裝並啟動：

```bash
npm ci
npm run dev
```

執行完整驗證：

```bash
npm test
npm run lint
```

## 技術架構

- TypeScript
- React 19
- Vinext / Vite
- CSS 2D 視覺與互動動畫
- Cloudflare Worker 相容建置

## 部署

專案同時保留兩條互不干擾的建置路徑：

- `npm run build`：產生 Vinext／Cloudflare Worker 成品，供既有 Sites 部署使用。
- `npm run build:vercel`：執行標準 Next.js 建置，供 Vercel Git 自動部署使用。

`tsconfig.vercel.json` 只檢查 Next.js 應用程式範圍，避免 Vercel 建置載入僅存在於 Cloudflare Worker 的 D1 型別；原本的 `tsconfig.json` 與 Worker 原始碼保持不變。

將 GitHub repository 匯入 Vercel 後，`vercel.json` 會指定 Next.js Framework、`npm ci` 安裝與 Vercel 專用建置指令。Vercel 的 Production Branch 應設為 `main`；其他分支與 Pull Request 可作為 Preview Deployment。

## 專案結構

```text
app/
  page.tsx             核心遊戲流程與狀態
  globals.css          介面、地圖與演出樣式
docs/
  ...dev_spec...md     產品設計與開發規格
public/                靜態素材
tests/                 建置後的基本驗證
worker/                Worker 入口
.openai/hosting.json   既有 Sites 專案識別
```

## 目前範圍

P1.0 使用一張固定關卡，專注驗證核心體驗。隨機地圖、敵人變化、道具、永久成長與完整 Roguelite Meta 系統尚未加入。

## 版本

- `v0.1.0` — Phase P1.0 固定關卡核心循環原型

## 授權

目前尚未提供開源授權。程式碼與遊戲內容保留所有權利。
