# 逃生門計畫 Roguelite  
## 產品設計與開發規範 v1.1（TypeScript 技術架構版）

- 文件狀態：核心方向定案／技術架構更新為 TypeScript
- 適用階段：原型、MVP、第一輪玩家測試
- 遊戲類型：短局制逃生／路線規劃／記憶觀察／壓力解謎／Roguelite
- 建議平台：Web、桌面瀏覽器
- 建議技術：Vite、TypeScript、HTML、CSS、Three.js、Canvas 2D、Web Audio API
- 單局目標時間：2～5 分鐘
- 核心測試原型時間：30～90 秒

---

# 1. 產品一句話

玩家先在地圖上規劃取得鑰匙並前往逃生門的路線，接著觀看角色依路線自動奔跑，途中記住隨機出現的開鎖提示，最後在殺手抵達前完成門鎖解謎、進門、關門並上鎖。

---

# 2. 核心體驗宣言

本作不是傳統自由移動追逐遊戲，也不是純粹的密室解謎。

核心體驗為：

> 我親手規劃了一條逃生路線，但真正執行時仍可能漏看提示、遭遇突發事件，最後必須在倒數壓力下，用自己記住的情報打開逃生門。

遊戲的主要情緒曲線：

1. 規劃時冷靜思考。
2. 奔跑時專注觀察。
3. 發現計畫出錯時開始緊張。
4. 抵達門前後進入高壓操作。
5. 最後一秒成功或失敗。
6. 立即理解失敗原因並想再試一次。

---

# 3. 設計支柱

## 3.1 規劃必須影響結果

玩家在開場地圖做出的路線選擇，必須實際影響：

- 抵達逃生門時剩餘的時間。
- 能否取得鑰匙。
- 能看見多少開鎖提示。
- 是否取得拖延殺手的道具。
- 是否遇到陷阱或隨機事件。
- 開鎖時需要猜測的資訊量。

不得讓所有路線最後只剩下單純的距離差異。

## 3.2 自動奔跑不等於純觀看

角色依照規劃路線自動奔跑，但玩家仍需：

- 觀察環境提示。
- 記住提示內容與順序。
- 點擊可疑區域讓鏡頭短暫聚焦。
- 在少數突發事件中做出快速選擇。
- 使用有限次數的加速或防禦道具。
- 判斷是否偏離原定路線。

玩家不直接操控每一步移動，但必須持續參與。

## 3.3 解謎答案簡單，執行困難

門鎖解謎不得依賴複雜知識。

謎題本身應該在資訊完整時很容易理解，例如：

- 右轉兩圈。
- 左轉一圈後敲三下。
- 紅、藍、黃的順序。
- 先壓下鑰匙，再向右旋轉。
- 將指定符文珠移到中央。

困難來源應該是：

- 玩家是否看見提示。
- 玩家是否記對提示。
- 玩家是否保留足夠時間。
- 玩家能否在倒數中正確操作。

## 3.4 失敗必須可理解

玩家死亡或逃生失敗後，系統必須明確指出主要原因，例如：

- 漏掉第二個提示。
- 路線過長，抵達時只剩三秒。
- 敲擊次數錯誤。
- 鑰匙旋轉方向錯誤。
- 忘記關門。
- 門已關閉，但未完成上鎖。
- 隨機事件導致路線延誤。

不得讓玩家只覺得是「怪物突然追上」或「遊戲故意讓我輸」。

---

# 4. 完整單局流程

## Phase A：地圖規劃

開場顯示俯視地圖。

地圖至少標記：

- 玩家起點。
- 鑰匙位置。
- 逃生門位置。
- 殺手起點或大致活動區。
- 已知障礙。
- 可疑提示點。
- 可選路線。
- 部分未知區域。

玩家在地圖上規劃一條路線，必須經過：

1. 起點。
2. 至少一把必要鑰匙。
3. 逃生門。

玩家可選擇經過額外節點：

- 提示點。
- 道具點。
- 捷徑。
- 危險區。
- 隱密區。
- 可拖延殺手的機關。

規劃完成後按下「開始逃生」。

## Phase B：第三人稱自動奔跑

角色依照路線自動奔跑。

鏡頭採第三人稱跟隨視角，必要時進行電影式切換。

途中會出現開鎖提示。提示可能藏在：

- 牆面符號。
- 房間號碼。
- 地板箭頭。
- 廣播聲音。
- 電視畫面。
- 門牌。
- 敲擊節奏。
- 顏色排列。
- 屍體旁紙條。
- 旋轉中的機械裝置。

玩家需要主動觀察，而不是等待 UI 自動記錄全部答案。

建議保留有限輔助：

- 玩家成功聚焦提示後，可短暫顯示一個模糊記憶圖示。
- 圖示只代表「看過」，不直接保存完整答案。
- 初級難度可以保存一部分提示。
- 高難度完全依賴玩家記憶。

## Phase C：逃生門前解謎

抵達逃生門後，角色停在門前。

鏡頭切換至門鎖近距離視角，但應保留部分背景，讓玩家看見或感受到殺手逼近。

畫面顯示：

> 殺手預計在 X.X 秒後抵達

玩家必須完成本局抽取的門鎖操作。

基本成功流程：

1. 使用鑰匙。
2. 完成門鎖解謎。
3. 打開門。
4. 穿過門。
5. 關門。
6. 完成內側上鎖。
7. 判定逃生成功。

開門不等於成功。

只有關門並上鎖後才算完成。

## Phase D：結果結算

成功時顯示：

- 剩餘秒數。
- 路線長度。
- 收集到的提示數。
- 開鎖錯誤次數。
- 是否觸發最後掙扎。
- 本局種子。
- 下一局獎勵或選擇。

失敗時顯示：

- 主要失敗原因。
- 漏掉的提示。
- 正確開鎖順序。
- 玩家實際輸入內容。
- 距離成功還差哪一步。
- 快速重新開始按鈕。

---

# 5. 路線規劃規範

## 5.1 路線類型

| 路線類型 | 主要優勢 | 主要代價 |
|---|---|---|
| 最短路線 | 門前剩餘時間多 | 提示不完整 |
| 提示路線 | 解謎資訊完整 | 路程較長 |
| 道具路線 | 可拖延殺手 | 可能需要繞路 |
| 隱密路線 | 降低被發現機率 | 地圖資訊較少 |
| 高風險捷徑 | 大幅節省時間 | 可能封閉或觸發陷阱 |
| 雙鑰匙路線 | 可開啟高價值逃生門 | 取得成本高 |

## 5.2 地圖資訊分級

地圖資訊分為三種：

### 確定情報

- 鑰匙位置。
- 逃生門位置。
- 起點。
- 已探索道路。

### 模糊情報

- 可能存在提示。
- 可能存在道具。
- 可能存在陷阱。
- 可能存在捷徑。

### 未知情報

- 殺手臨時改道。
- 道路坍塌。
- 提示被遮蔽。
- 假提示。
- 隨機事件。
- 門鎖類型變化。

地圖不得揭露所有內容，否則會退化成單純最短路徑題。

## 5.3 規劃限制

第一版建議：

- 地圖節點：8～14 個。
- 必經鑰匙：1 把。
- 逃生門：1 扇。
- 提示點：2～4 個。
- 道具點：0～2 個。
- 每局可規劃路線：1 條。
- 規劃時間：可先不限時。
- 後續高難度可加入規劃倒數。

---

# 6. 自動奔跑規範

## 6.1 玩家可進行的操作

第一版只保留少量高價值操作：

- 點擊提示物件：鏡頭聚焦 0.5～1 秒。
- 按鍵跳過障礙。
- 使用一次性加速。
- 啟動路旁機關拖延殺手。
- 突發岔路時選擇左或右。
- 在安全點快速回看最近一個提示。

## 6.2 不應加入的操作

第一版不加入：

- 完整 WASD 自由移動。
- 複雜戰鬥。
- 武器瞄準。
- 大量 QTE。
- 物品欄管理。
- 自由探索房間。
- 長時間停留閱讀。
- 跳躍平台挑戰。

避免讓遊戲失去「規劃後執行」的特色。

## 6.3 提示可讀性

提示必須遵守：

- 一次只傳達一個明確資訊。
- 玩家至少有 0.8～1.5 秒可見時間。
- 重要提示不得與背景完全同色。
- 聲音提示需有視覺輔助。
- 不可只靠小字。
- 不可要求玩家閱讀長句。
- 提示符號應能在奔跑中快速辨識。

---

# 7. 倒數與追擊規範

## 7.1 倒數定義

顯示的秒數不是固定關卡倒數，而是：

> 殺手依照目前位置與移動速度，預估抵達逃生門的時間。

建議公式概念：

`預估抵達秒數 = 剩餘路徑距離 ÷ 殺手有效速度 + 障礙延遲`

顯示數字需平滑更新，避免頻繁跳動。

## 7.2 壓力分段

### 10 秒以上

- 正常 UI。
- 腳步聲較遠。
- 玩家仍能冷靜操作。

### 6～10 秒

- 倒數開始放大。
- 音樂節奏提升。
- 背景可聽見殺手移動。

### 3～6 秒

- 數字明顯警示。
- 鏡頭輕微震動。
- 門鎖操作音效更急促。
- 殺手可能進入背景畫面。

### 0～3 秒

- 每秒強烈提示。
- 畫面邊緣危險效果。
- 殺手接近門口。
- 玩家可清楚感受到剩餘操作步驟。

### 0 秒

不立即死亡，進入 1～1.5 秒最後掙扎。

可能演出：

- 殺手抓住門邊。
- 手伸入門縫。
- 玩家必須完成最後一次鎖門。
- 成功時夾住或推出殺手。
- 失敗時門被拉開。

---

# 8. 門鎖解謎模組

第一版每局抽取一種主要鎖型，最多再附加一個簡單次要步驟。

## 8.1 旋轉鎖

提示範例：

- 右轉兩圈。
- 左一圈、右一圈。
- 先壓下，再右轉。

操作方式：

- 滑鼠拖曳或觸控畫圓。
- 每完成一圈產生清楚段落回饋。
- 圈數上限建議 3 圈。
- 方向錯誤時鎖芯卡住並損失時間。

## 8.2 敲擊鎖

提示範例：

- 敲三下。
- 短、短、長。
- 兩下，停頓，再一下。

操作方式：

- 點擊門板。
- 長按代表長音。
- 判定需寬鬆。
- 不應要求精確到音樂遊戲等級。

## 8.3 符號順序鎖

提示範例：

- 月亮、眼睛、刀。
- 紅、藍、黃。
- 3、1、2。

操作方式：

- 點擊或拖曳符號。
- 最多 3～4 個步驟。
- 錯誤時可局部退回，不必全部重置。

## 8.4 迷你轉珠鎖

不是完整三消。

建議規格：

- 3～5 顆珠子。
- 目標是排列順序或把指定珠移至中央。
- 完成時間 2～4 秒。
- 不等待掉落、Combo 或長動畫。
- 錯誤一步只造成短暫時間損失。

## 8.5 推拉門鎖

提示告知：

- 推門。
- 拉門。
- 先推再拉。
- 先轉把手再推。

適合作為附加步驟，不建議單獨成為主要謎題。

## 8.6 組合限制

第一版允許：

- 旋轉鎖。
- 旋轉鎖＋敲擊。
- 符號鎖。
- 迷你轉珠鎖。

第一版禁止單門同時包含：

- 旋轉。
- 敲擊。
- 轉珠。
- 密碼。
- 節奏。
- 雙鎖。
- 關門反鎖。

避免操作過多造成工作清單感。

---

# 9. Roguelite 結構

## 9.1 每局隨機內容

- 地圖節點排列。
- 鑰匙位置。
- 逃生門位置。
- 提示點位置。
- 提示內容。
- 門鎖類型。
- 殺手類型。
- 隨機事件。
- 路線風險。
- 可取得道具。
- 初始時間差。

## 9.2 殺手原型

### 奔跑型

- 速度快。
- 容易被障礙拖延。
- 強調最短路線與道具利用。

### 追蹤型

- 會預測玩家規劃。
- 可能選擇捷徑。
- 強調隱密路線與假情報。

### 聲音型

- 依聲音追蹤。
- 吵雜路線風險更高。
- 敲擊鎖可能增加危險。

### 破門型

- 抵達後不會立即停止。
- 玩家必須完成更完整的關門與上鎖。
- 最後掙扎階段更長。

第一版只實作奔跑型殺手。

## 9.3 局間成長

建議採輕量 Roguelite，不做永久數值碾壓。

可解鎖：

- 新門鎖類型。
- 新殺手。
- 新地圖主題。
- 新道具。
- 新角色外觀。
- 地圖情報能力。
- 提示聚焦能力。
- 一次性的記憶輔助。

不建議永久提升：

- 大量移動速度。
- 大幅增加開鎖時間。
- 自動完成謎題。
- 永久顯示全部提示。

避免破壞核心壓力。

---

# 10. 道具規範

第一版可加入兩種：

## 10.1 障礙道具

效果：

- 使殺手延遲 2～3 秒。
- 只能在特定節點使用。
- 使用時角色不停止奔跑。

範例：

- 推倒櫃子。
- 關閉鐵門。
- 啟動警報誘導殺手。
- 灑落障礙物。

## 10.2 記憶道具

效果：

- 保留一個已看見提示。
- 只記錄符號，不顯示完整操作。
- 或允許門前回放一次模糊影像。

不得直接顯示全部答案。

---

# 11. MVP 範圍

## 11.1 必做功能

- 一張小型節點地圖。
- 起點、鑰匙、逃生門。
- 兩條以上可選路線。
- 路線規劃操作。
- 第三人稱自動奔跑。
- 兩個沿途提示。
- 一種殺手。
- 殺手抵達倒數。
- 旋轉鎖。
- 敲擊附加步驟。
- 開門、穿門、關門、上鎖。
- 成功與失敗結算。
- 隨機種子。
- 快速重新開始。

## 11.2 暫不製作

- 多人連線。
- 自由移動追逐。
- 戰鬥。
- 大型程序化迷宮。
- 多角色技能樹。
- 完整三消。
- 物品合成。
- 長篇劇情。
- 多階段 Boss。
- 複雜物理鑰匙串。
- 手機版完整適配。

---

# 12. 建議 MVP 單局數值

| 項目 | 建議值 |
|---|---:|
| 地圖節點 | 8～12 |
| 路線選項 | 2～3 |
| 奔跑時間 | 12～20 秒 |
| 提示數量 | 2 |
| 必要鑰匙 | 1 |
| 門前剩餘時間 | 7～10 秒 |
| 熟練開鎖時間 | 3～4 秒 |
| 一般開鎖時間 | 5～6 秒 |
| 單次錯誤懲罰 | 0.7～1.2 秒 |
| 最後掙扎 | 1～1.5 秒 |
| 原型單局時間 | 30～60 秒 |

理想結果：

- 熟練玩家穩定成功。
- 一般玩家犯一次錯仍可能成功。
- 犯兩次錯誤大多進入最後掙扎。
- 玩家能清楚感覺「差一點」。

---

# 13. 技術架構建議

## 13.1 核心技術棧

正式開發採用：

```text
Vite
TypeScript
Three.js
HTML / CSS
Canvas 2D
Web Audio API
```

各技術用途：

- **Vite**：本機開發伺服器、ES Modules、資源處理與正式打包。
- **TypeScript**：遊戲狀態、地圖節點、提示、門鎖模組與 Roguelite 資料型別。
- **Three.js**：第三人稱奔跑場景、角色、殺手、鏡頭與門前演出。
- **Canvas 2D**：開場節點地圖、路線繪製與部分 2D 原型介面。
- **HTML / CSS**：HUD、倒數、規劃介面、門鎖操作介面與結算畫面。
- **Web Audio API**：殺手距離、腳步、倒數、門鎖與最後掙扎音效。

禁止以直接雙擊 HTML 的 `file://` 模式作為正式開發流程。開發與測試一律透過 Vite 啟動。

建議指令：

```bash
npm install
npm run dev
npm run build
npm run preview
```

## 13.2 TypeScript 使用原則

本專案採「實用型 TypeScript」，優先確保資料安全與模組可維護性。

必須遵守：

- 開啟 `strict` 模式。
- 函式輸入與回傳值應有明確型別。
- 遊戲核心資料不得使用隱含 `any`。
- 提示、門鎖與事件採判別聯合型別。
- 遊戲流程採有限狀態型別。
- 所有程序生成結果必須符合明確介面。
- 外部 JSON 資料載入後必須進行驗證。
- 不以大量型別斷言 `as` 掩蓋資料問題。

第一版避免：

- 過度複雜泛型。
- 多層抽象基底類別。
- 大型依賴注入框架。
- 為了架構而架構的設計模式。
- 未經必要性驗證便導入完整 ECS。

建議 `tsconfig.json` 核心設定：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

## 13.3 核心狀態機

```ts
export type GameState =
  | "BOOT"
  | "MAP_GENERATE"
  | "ROUTE_PLANNING"
  | "ROUTE_CONFIRM"
  | "AUTO_RUN"
  | "DOOR_APPROACH"
  | "DOOR_PUZZLE"
  | "DOOR_OPEN"
  | "PASS_THROUGH"
  | "DOOR_CLOSE"
  | "DOOR_LOCK"
  | "SUCCESS"
  | "FAIL"
  | "RESULT";
```

狀態流程：

```text
BOOT
→ MAP_GENERATE
→ ROUTE_PLANNING
→ ROUTE_CONFIRM
→ AUTO_RUN
→ DOOR_APPROACH
→ DOOR_PUZZLE
→ DOOR_OPEN
→ PASS_THROUGH
→ DOOR_CLOSE
→ DOOR_LOCK
→ SUCCESS / FAIL
→ RESULT
```

所有主要流程必須由狀態機控制，不得依賴大量零散布林值，例如：

```ts
// 不建議
isRunning = true;
isAtDoor = true;
isPuzzleOpen = false;
isKillerArrived = false;
```

狀態切換需集中管理：

```ts
export interface StateTransition {
  from: GameState;
  to: GameState;
  reason: string;
  timestampMs: number;
}
```

## 13.4 地圖資料型別

```ts
export type MapNodeType =
  | "start"
  | "normal"
  | "key"
  | "clue"
  | "item"
  | "hazard"
  | "exit";

export interface Vec2 {
  x: number;
  y: number;
}

export interface MapNode {
  id: string;
  type: MapNodeType;
  position: Vec2;
  connections: string[];
  visited: boolean;
  revealed: boolean;
}

export interface GeneratedMap {
  seed: string;
  nodes: MapNode[];
  startNodeId: string;
  keyNodeIds: string[];
  exitNodeId: string;
}
```

地圖生成器必須保證：

- 起點存在。
- 至少一個必要鑰匙節點存在。
- 逃生門存在。
- 起點可到達鑰匙。
- 鑰匙可到達逃生門。
- 不產生孤立的必要節點。
- 相同 Seed 產生相同結果。

## 13.5 提示型別

```ts
export type TurnDirection = "left" | "right";
export type TurnCount = 1 | 2 | 3;
export type KnockCount = 1 | 2 | 3 | 4;

export type Clue =
  | {
      id: string;
      type: "turn";
      direction: TurnDirection;
      count: TurnCount;
    }
  | {
      id: string;
      type: "knock";
      count: KnockCount;
    }
  | {
      id: string;
      type: "symbol";
      sequence: string[];
    }
  | {
      id: string;
      type: "orb";
      targetOrder: string[];
    }
  | {
      id: string;
      type: "pushPull";
      action: "push" | "pull";
    };
```

處理提示時應使用完整分支檢查：

```ts
export function describeClue(clue: Clue): string {
  switch (clue.type) {
    case "turn":
      return `${clue.direction}:${clue.count}`;
    case "knock":
      return `knock:${clue.count}`;
    case "symbol":
      return clue.sequence.join(">");
    case "orb":
      return clue.targetOrder.join(">");
    case "pushPull":
      return clue.action;
    default: {
      const exhaustiveCheck: never = clue;
      return exhaustiveCheck;
    }
  }
}
```

## 13.6 門鎖模組型別

```ts
export type DoorPuzzleConfig =
  | {
      type: "rotation";
      direction: TurnDirection;
      count: TurnCount;
    }
  | {
      type: "rotationKnock";
      direction: TurnDirection;
      count: TurnCount;
      knockCount: KnockCount;
    }
  | {
      type: "symbol";
      sequence: string[];
    }
  | {
      type: "orb";
      targetOrder: string[];
    };

export interface DoorPuzzleResult {
  success: boolean;
  elapsedMs: number;
  mistakeCount: number;
  failureReason?: string;
}
```

不同門鎖可實作共用介面：

```ts
export interface DoorPuzzleController<TConfig extends DoorPuzzleConfig> {
  readonly config: TConfig;
  start(): void;
  update(deltaSeconds: number): void;
  reset(): void;
  getResult(): DoorPuzzleResult | null;
}
```

若泛型使原型複雜度過高，可先使用非泛型介面，但不得以 `any` 取代門鎖資料型別。

## 13.7 單局資料結構

```ts
export interface RunConfig {
  seed: string;
  playerStartNodeId: string;
  keyNodeIds: string[];
  exitNodeId: string;
  killerType: "runner";
  route: string[];
  clues: Clue[];
  doorPuzzle: DoorPuzzleConfig;
}

export interface RunResult {
  seed: string;
  success: boolean;
  elapsedMs: number;
  remainingTimeMs: number;
  route: string[];
  collectedClueIds: string[];
  mistakeCount: number;
  failureReason?: string;
}
```

範例：

```ts
export const runConfig: RunConfig = {
  seed: "RUN-0001",
  playerStartNodeId: "A",
  keyNodeIds: ["D"],
  exitNodeId: "H",
  killerType: "runner",
  route: ["A", "B", "D", "F", "H"],
  clues: [
    {
      id: "clue-turn-01",
      type: "turn",
      direction: "right",
      count: 2
    },
    {
      id: "clue-knock-01",
      type: "knock",
      count: 3
    }
  ],
  doorPuzzle: {
    type: "rotationKnock",
    direction: "right",
    count: 2,
    knockCount: 3
  }
};
```

## 13.8 建議目錄結構

### P1：2D 原型

```text
src/
├─ main.ts
├─ app/
│  ├─ GameApp.ts
│  └─ GameState.ts
├─ domain/
│  ├─ runTypes.ts
│  ├─ mapTypes.ts
│  ├─ clueTypes.ts
│  └─ puzzleTypes.ts
├─ map/
│  ├─ MapGenerator.ts
│  ├─ RoutePlanner.ts
│  └─ MapCanvasRenderer.ts
├─ runner/
│  ├─ AutoRunController.ts
│  └─ CluePresenter.ts
├─ puzzle/
│  ├─ RotationLock.ts
│  └─ KnockLock.ts
├─ systems/
│  ├─ CountdownSystem.ts
│  ├─ SeededRandom.ts
│  └─ ResultSystem.ts
└─ styles/
   └─ main.css
```

### P2 之後：3D 原型

```text
src/
├─ main.ts
├─ app/
├─ domain/
├─ map/
├─ runner/
├─ puzzle/
├─ systems/
├─ three/
│  ├─ ThreeScene.ts
│  ├─ CameraController.ts
│  ├─ CharacterView.ts
│  ├─ KillerView.ts
│  ├─ EnvironmentView.ts
│  └─ DoorView.ts
├─ audio/
│  └─ AudioSystem.ts
├─ ui/
│  ├─ PlanningUI.ts
│  ├─ CountdownUI.ts
│  ├─ PuzzleUI.ts
│  └─ ResultUI.ts
└─ styles/
```

## 13.9 模組邊界

- `domain/`：只放資料型別與純規則，不依賴 DOM 或 Three.js。
- `map/`：地圖生成、節點、路線驗證。
- `runner/`：自動奔跑與途中提示。
- `puzzle/`：門鎖操作與判定。
- `systems/`：倒數、Seed、結算、事件。
- `three/`：3D 顯示，不直接決定遊戲規則。
- `ui/`：畫面與輸入，不保存核心真實狀態。
- `audio/`：聲音播放與距離混音。

不得讓 Three.js 物件本身成為唯一遊戲資料來源。例如角色位置的規則資料應由控制器管理，再同步至 3D View。

## 13.10 確定性與 Seed

相同 Seed 應產生：

- 相同地圖。
- 相同鑰匙位置。
- 相同提示。
- 相同門鎖。
- 相同隨機事件。
- 相同殺手初始條件。

禁止在核心生成流程中直接使用 `Math.random()`。

統一透過：

```ts
export interface RandomSource {
  next(): number;
  nextInt(minInclusive: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
}
```

`pick()` 必須處理空陣列，不得假設索引一定存在。

## 13.11 錯誤處理

- 找不到必要節點時，地圖生成必須失敗並重新生成。
- 找不到提示對應的門鎖時，不得進入遊戲。
- 不合法路線不得開始奔跑。
- 資源載入失敗需顯示可理解的錯誤畫面。
- 結算資料缺失不得靜默忽略。
- 開發環境應保留 Seed、狀態與錯誤紀錄。

## 13.12 測試規範

優先對純 TypeScript 規則撰寫單元測試：

- Seed 是否可重現。
- 地圖是否保證可通關。
- 路線是否包含鑰匙。
- 路線是否合法。
- 提示與門鎖答案是否一致。
- 倒數是否正確計算。
- 錯誤操作是否增加 mistake count。
- 狀態機是否禁止非法跳轉。
- 成功是否要求完成關門與上鎖。

建議使用：

```text
Vitest
```

第一版不要求高覆蓋率，但核心規則不可完全依賴人工點擊測試。

## 13.13 建置輸出

正式打包必須符合：

- 使用相對資源路徑或明確設定 `base`。
- 可部署至一般靜態網站。
- 不依賴本機檔案路徑。
- 不在正式版輸出大型除錯資訊。
- Three.js 與其他套件由 npm 管理。
- 不直接引用已棄用的 `build/three.js` 或 `three.min.js`。
- `OrbitControls` 等附加模組使用官方 ES Modules 路徑匯入。

範例：

```ts
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
```

正式遊戲鏡頭未必需要 `OrbitControls`；它主要用於開發與除錯工具。

---

# 14. 美術與鏡頭規範

## 14.1 地圖畫面

- 資訊優先。
- 路線清楚。
- 節點不可過度裝飾。
- 危險、提示、道具使用不同圖示。
- 未知節點使用模糊或問號表現。

## 14.2 奔跑鏡頭

- 主要維持第三人稱後方跟隨。
- 提示出現時可短暫側移。
- 不可頻繁切鏡造成暈眩。
- 玩家必須看得見前進方向。
- 殺手可透過遠景、影子或音效出現。

## 14.3 門鎖鏡頭

- 鎖體占主要畫面。
- 背景保留殺手接近感。
- 倒數固定可見。
- 操作區域清楚。
- 不使用過度真實的小鎖孔判定。
- 旋轉回饋必須誇張且可讀。

---

# 15. 音效規範

本作高度依賴音效建立壓力。

必要音效：

- 殺手腳步。
- 殺手距離變化。
- 玩家呼吸。
- 鑰匙插入。
- 鎖芯段落。
- 旋轉完成。
- 操作錯誤。
- 敲門。
- 門把。
- 開門。
- 關門。
- 上鎖。
- 最後撞門。
- 成功喘息。
- 失敗抓捕。

倒數不應只有電子警示音，應與殺手實際接近感配合。

---

# 16. 玩家測試問題

第一輪測試必須觀察：

1. 玩家是否理解要先規劃路線。
2. 玩家是否知道一定要取得鑰匙。
3. 玩家是否會主動觀察提示。
4. 玩家是否覺得自動奔跑仍有參與感。
5. 玩家能否理解倒數代表殺手抵達時間。
6. 玩家是否知道開門後還要關門上鎖。
7. 玩家失敗後是否知道自己錯在哪裡。
8. 玩家是否願意立刻再玩一局。
9. 玩家是否會討論不同路線。
10. 玩家是否會記住「差一秒逃走」的瞬間。

## 核心成功指標

在沒有長篇教學的情況下：

- 80% 玩家理解地圖規劃目的。
- 70% 玩家注意到至少一個沿途提示。
- 60% 玩家第一局能抵達門前。
- 失敗玩家中，70% 能說出失敗原因。
- 至少 50% 玩家主動再玩第二局。

---

# 17. 開發階段

## Phase P0：流程紙面驗證

- 地圖節點設計。
- 路線交換條件。
- 提示種類。
- 門鎖操作流程。
- 倒數數值。

## Phase P1：2D 可玩原型

- Canvas 地圖。
- 路線選擇。
- 簡單自動移動。
- 提示閃現。
- 2D 門鎖。
- 倒數與結果。

目的：先驗證核心是否好玩，不製作完整 3D。

## Phase P2：3D 奔跑原型

- Three.js 走廊。
- 第三人稱角色。
- 自動路線移動。
- 提示整合至場景。
- 殺手追逐演出。

## Phase P3：門鎖演出強化

- 旋轉鎖。
- 敲擊鎖。
- 開關門。
- 最後掙扎。
- 音效與鏡頭震動。

## Phase P4：隨機化與 Roguelite

- Seed 地圖。
- 多種路線風險。
- 道具。
- 隨機事件。
- 局間解鎖。

---

# 18. 正式定案項目

以下項目視為 v1.1 已定案：

- 以路線規劃作為開場。
- 地圖標記鑰匙與逃生門。
- 規劃完成後角色自動奔跑。
- 奔跑採第三人稱視角。
- 沿途出現需要記住的提示。
- 抵達逃生門後進行壓力解謎。
- 顯示殺手預估抵達倒數。
- 開門後仍須穿門、關門、上鎖。
- 每局地圖、提示與門鎖可以變化。
- 遊戲採短局 Roguelite 方向。
- 第一版先做旋轉鎖與敲擊。
- 迷你轉珠保留為後續門鎖模組。
- 不製作完整自由移動追逐。
- 不製作完整三消盤面。
- 第一版先驗證地圖規劃、觀察、記憶、倒數解鎖是否成立。
- 正式技術架構採 Vite + TypeScript，Three.js 與 Canvas 依階段使用。

---

# 19. 尚未定案項目

後續需要另外討論：

- 遊戲世界觀與美術風格。
- 殺手是恐怖、搞笑或卡通風格。
- 玩家角色是否有多名可選。
- 地圖規劃是否限時。
- 玩家能否中途改變路線。
- 提示是否存在假情報。
- 局間獎勵與成長方式。
- 最終平台是否以 Poki、CrazyGames 或 itch.io 為主。
- 是否優先支援手機。
- 遊戲正式名稱。
- 一局包含一扇門或連續多扇門。

---

# 20. 核心禁區

開發過程中不得輕易偏離以下原則：

- 不把遊戲改回普通 WASD 追逐遊戲。
- 不讓地圖規劃變成無意義的開場動畫。
- 不讓自動奔跑變成完全無互動影片。
- 不把解謎做成複雜數學或長篇閱讀。
- 不讓隨機性直接決定生死。
- 不讓玩家開門後立刻成功。
- 不加入過多門鎖操作。
- 不先做大量美術再驗證核心。
- 不以永久數值成長消除遊戲壓力。
- 不讓玩家失敗後不知道原因。

---

# 21. 最終核心循環

```text
查看地圖
→ 規劃鑰匙與逃生路線
→ 確認路線
→ 第三人稱自動奔跑
→ 觀察並記住提示
→ 處理少量突發事件
→ 抵達逃生門
→ 查看殺手抵達倒數
→ 使用提示完成門鎖
→ 開門
→ 穿過
→ 關門
→ 上鎖
→ 成功或失敗
→ 查看原因
→ 重新生成下一局
```

---

# 22. 產品定位總結

本作最重要的辨識度不是怪物外型，也不是門鎖本身，而是三段式玩法的組合：

> 玩家先規劃逃生計畫，再觀看並參與計畫的執行，最後在殺手倒數逼近時，用途中收集到的情報完成逃生门解鎖。

這份規範作為 v1.1 核心基線。

後續所有新功能都必須回答一個問題：

> 這項功能是否讓路線選擇、途中觀察或門前解鎖變得更有趣？

若答案是否定，則不應優先加入。
