"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import RunnerScene3D, {
  DEFAULT_SCENE_TUNING,
  type RouteNodeSceneKind,
  type SceneTuning,
} from "./RunnerScene3D";

type GamePhase =
  | "planning"
  | "running"
  | "door"
  | "closing"
  | "success"
  | "fail";

type ClueId = "turn" | "knock";
type LockStep = "rotation" | "knock";
type ClosingStep = "close" | "lock";
type MapNodeId =
  | "start"
  | "northEntry"
  | "middleEntry"
  | "southEntry"
  | "turnClue"
  | "middleHub"
  | "southStore"
  | "key"
  | "northExit"
  | "middleExit"
  | "knockClue"
  | "exit";

type MapNodeType = "start" | "normal" | "clue" | "key" | "exit";

interface Clue {
  id: ClueId;
  eyebrow: string;
  value: string;
  detail: string;
  icon: string;
}

interface RouteEvent {
  clueId: ClueId;
  at: number;
}

interface RouteConfig {
  id: "custom";
  name: string;
  label: string;
  durationMs: number;
  doorTimeSeconds: number;
  clueWindowMs: number;
  events: RouteEvent[];
  nodeIds: MapNodeId[];
  distanceMeters: number;
}

interface MapNode {
  id: MapNodeId;
  x: number;
  y: number;
  label: string;
  shortLabel: string;
  type: MapNodeType;
  clueId?: ClueId;
}

const CLUES: Record<ClueId, Clue> = {
  turn: {
    id: "turn",
    eyebrow: "牆面齒輪",
    value: "右轉 × 2",
    detail: "鎖芯要順時針轉動兩整圈",
    icon: "↻",
  },
  knock: {
    id: "knock",
    eyebrow: "維修塗鴉",
    value: "敲門 × 3",
    detail: "旋轉完成後，快速敲擊三次",
    icon: "✦",
  },
};

const MAP_NODES: MapNode[] = [
  { id: "start", x: 540, y: 615, label: "玩家起點", shortLabel: "你", type: "start" },
  { id: "northEntry", x: 330, y: 468, label: "西側岔路", shortLabel: "A", type: "normal" },
  { id: "middleEntry", x: 505, y: 545, label: "中央走廊", shortLabel: "B", type: "normal" },
  { id: "southEntry", x: 705, y: 426, label: "東側岔路", shortLabel: "C", type: "normal" },
  { id: "turnClue", x: 330, y: 245, label: "可疑機械室", shortLabel: "?", type: "clue", clueId: "turn" },
  { id: "middleHub", x: 540, y: 305, label: "中央機房", shortLabel: "D", type: "normal" },
  { id: "southStore", x: 832, y: 334, label: "廢棄倉庫", shortLabel: "E", type: "normal" },
  { id: "key", x: 655, y: 258, label: "銅鑰匙", shortLabel: "◆", type: "key" },
  { id: "northExit", x: 488, y: 178, label: "北側長廊", shortLabel: "F", type: "normal" },
  { id: "middleExit", x: 628, y: 190, label: "直通走廊", shortLabel: "G", type: "normal" },
  { id: "knockClue", x: 705, y: 145, label: "可疑維修區", shortLabel: "?", type: "clue", clueId: "knock" },
  { id: "exit", x: 866, y: 125, label: "逃生門", shortLabel: "門", type: "exit" },
];

const MAP_EDGES: Array<readonly [MapNodeId, MapNodeId]> = [
  ["start", "northEntry"],
  ["start", "middleEntry"],
  ["start", "southEntry"],
  ["northEntry", "turnClue"],
  ["northEntry", "middleHub"],
  ["middleEntry", "middleHub"],
  ["southEntry", "middleHub"],
  ["southEntry", "southStore"],
  ["turnClue", "northExit"],
  ["middleHub", "middleExit"],
  ["southStore", "knockClue"],
  ["turnClue", "key"],
  ["middleHub", "key"],
  ["southStore", "key"],
  ["key", "northExit"],
  ["key", "middleExit"],
  ["key", "knockClue"],
  ["northExit", "exit"],
  ["middleExit", "exit"],
  ["knockClue", "exit"],
];

const MAP_NODE_LOOKUP = Object.fromEntries(
  MAP_NODES.map((node) => [node.id, node]),
) as Record<MapNodeId, MapNode>;

function getRouteNodeSceneKind(nodeId: MapNodeId): RouteNodeSceneKind {
  switch (nodeId) {
    case "northEntry":
    case "southEntry":
      return "junction";
    case "turnClue":
      return "clue-turn";
    case "middleHub":
      return "machine";
    case "southStore":
      return "warehouse";
    case "key":
      return "key";
    case "knockClue":
      return "clue-knock";
    case "exit":
      return "exit";
    default:
      return "corridor";
  }
}

const ROUTE_NODE_SCENE_DESCRIPTIONS: Record<RouteNodeSceneKind, string> = {
  junction: "岔路標記與側向通道即將出現",
  corridor: "進入狹長的地下水泥通道",
  machine: "大型管線與運轉機具就在前方",
  warehouse: "廢棄貨架與散落木箱擋住視線",
  key: "微弱黃光照著一座物資台",
  "clue-turn": "齒輪與閥門旁藏著牆面提示",
  "clue-knock": "維修門上的紅色塗鴉逐漸清晰",
  exit: "綠色逃生燈標出了最後一扇門",
};

const MAP_WIDTH = 1100;
const MAP_HEIGHT = 700;

const MAP_EDGE_WAYPOINTS: Record<string, Array<{ x: number; y: number }>> = {
  "start:northEntry": [{ x: 440, y: 560 }, { x: 350, y: 510 }],
  "start:middleEntry": [{ x: 528, y: 590 }],
  "start:southEntry": [{ x: 580, y: 524 }, { x: 655, y: 488 }],
  "northEntry:turnClue": [{ x: 350, y: 390 }, { x: 385, y: 335 }],
  "northEntry:middleHub": [{ x: 420, y: 430 }, { x: 505, y: 350 }],
  "middleEntry:middleHub": [{ x: 525, y: 430 }, { x: 536, y: 350 }],
  "southEntry:middleHub": [{ x: 662, y: 382 }, { x: 630, y: 340 }],
  "southEntry:southStore": [{ x: 780, y: 380 }],
  "turnClue:northExit": [{ x: 380, y: 208 }],
  "middleHub:middleExit": [{ x: 590, y: 286 }, { x: 630, y: 230 }],
  "southStore:knockClue": [{ x: 852, y: 236 }],
  "turnClue:key": [{ x: 420, y: 282 }, { x: 560, y: 280 }],
  "middleHub:key": [{ x: 590, y: 286 }],
  "southStore:key": [{ x: 760, y: 280 }],
  "key:northExit": [{ x: 590, y: 225 }, { x: 548, y: 166 }],
  "key:middleExit": [{ x: 640, y: 225 }],
  "key:knockClue": [{ x: 690, y: 225 }],
  "northExit:exit": [{ x: 548, y: 166 }, { x: 760, y: 150 }],
  "middleExit:exit": [{ x: 760, y: 150 }],
  "knockClue:exit": [{ x: 790, y: 132 }],
};

function getMapEdgePoints(fromId: MapNodeId, toId: MapNodeId) {
  const key = `${fromId}:${toId}`;
  const reverseKey = `${toId}:${fromId}`;
  const waypoints = MAP_EDGE_WAYPOINTS[key];
  if (waypoints) {
    return [MAP_NODE_LOOKUP[fromId], ...waypoints, MAP_NODE_LOOKUP[toId]];
  }
  const reverseWaypoints = MAP_EDGE_WAYPOINTS[reverseKey];
  if (reverseWaypoints) {
    return [
      MAP_NODE_LOOKUP[fromId],
      ...[...reverseWaypoints].reverse(),
      MAP_NODE_LOOKUP[toId],
    ];
  }
  return [MAP_NODE_LOOKUP[fromId], MAP_NODE_LOOKUP[toId]];
}

function areConnected(from: MapNodeId, to: MapNodeId) {
  return MAP_EDGES.some(
    ([a, b]) => (a === from && b === to) || (a === to && b === from),
  );
}

function calculateRouteDistance(nodeIds: MapNodeId[]) {
  return nodeIds.slice(1).reduce((total, id, index) => {
    const from = MAP_NODE_LOOKUP[nodeIds[index]];
    const to = MAP_NODE_LOOKUP[id];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    return total + distance;
  }, 0);
}

function buildRouteConfig(nodeIds: MapNodeId[]): RouteConfig {
  const rawDistance = calculateRouteDistance(nodeIds);
  const distanceMeters = Math.max(0, Math.round(rawDistance / 7.4));
  const durationMs = Math.round(
    Math.min(14500, Math.max(4800, 4300 + rawDistance * 9.2)),
  );
  const events = nodeIds.flatMap<RouteEvent>((id, index) => {
    const clueId = MAP_NODE_LOOKUP[id].clueId;
    if (!clueId) return [];
    return [{
      clueId,
      at: Math.min(0.78, Math.max(0.2, index / Math.max(1, nodeIds.length - 1))),
    }];
  });
  const clueIds = new Set(events.map((event) => event.clueId));
  const hasKey = nodeIds.includes("key");
  const reachedExit = nodeIds.at(-1) === "exit";
  const name =
    !reachedExit
      ? "臨時中斷線"
      : !hasKey
        ? "無鑰匙直衝線"
        : clueIds.size === 2
          ? "雙提示迂迴線"
          : clueIds.has("turn")
            ? "北側觀察線"
            : clueIds.has("knock")
              ? "南側觀察線"
              : "直衝逃生線";

  return {
    id: "custom",
    name,
    label: "玩家一筆畫路線",
    durationMs,
    doorTimeSeconds: Math.max(
      8.2,
      Math.min(12.5, Number((16.2 - durationMs / 1900).toFixed(1))),
    ),
    clueWindowMs: 1900,
    events,
    nodeIds,
    distanceMeters,
  };
}

const EMPTY_ROUTE = buildRouteConfig(["start"]);
const SCENE_TUNING_STORAGE_KEY = "escape-door-scene-tuning-v1";

const SCENE_TUNING_CONTROLS: Array<{
  key: keyof SceneTuning;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "exposure", label: "整體曝光", min: 0.75, max: 1.8, step: 0.01 },
  { key: "concrete", label: "水泥灰度", min: 0.55, max: 1.55, step: 0.01 },
  { key: "ambient", label: "環境光", min: 0.2, max: 2.2, step: 0.02 },
  { key: "flashlight", label: "手電筒", min: 4, max: 32, step: 0.5 },
  { key: "ceiling", label: "頂燈亮度", min: 0.2, max: 4, step: 0.05 },
  { key: "fog", label: "霧氣濃度", min: 0.008, max: 0.06, step: 0.001 },
  { key: "vignette", label: "邊緣暗角", min: 0, max: 0.85, step: 0.01 },
];

function formatTuningValue(key: keyof SceneTuning, value: number) {
  if (key === "fog") return value.toFixed(3);
  if (key === "flashlight") return value.toFixed(1);
  return value.toFixed(2);
}

function readStoredSceneTuning() {
  const restored = { ...DEFAULT_SCENE_TUNING };
  if (typeof window === "undefined") return restored;

  try {
    const saved = window.localStorage.getItem(SCENE_TUNING_STORAGE_KEY);
    if (!saved) return restored;
    const parsed = JSON.parse(saved) as Partial<SceneTuning>;
    for (const control of SCENE_TUNING_CONTROLS) {
      const candidate = parsed[control.key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        restored[control.key] = Math.min(
          control.max,
          Math.max(control.min, candidate),
        );
      }
    }
  } catch {
    window.localStorage.removeItem(SCENE_TUNING_STORAGE_KEY);
  }
  return restored;
}

const PHASE_ITEMS = [
  { key: "planning", label: "規劃" },
  { key: "running", label: "奔跑" },
  { key: "door", label: "解鎖" },
  { key: "escape", label: "封門" },
] as const;

const PHASE_INDEX: Record<GamePhase, number> = {
  planning: 0,
  running: 1,
  door: 2,
  closing: 3,
  success: 4,
  fail: 4,
};

function formatSeconds(value: number) {
  return Math.max(0, value).toFixed(1);
}

function phaseInstruction(
  phase: GamePhase,
  activeClue: Clue | null,
  lockStep: LockStep,
  closingStep: ClosingStep,
) {
  switch (phase) {
    case "planning":
      return "從 START 按住並一筆畫出路線；何時停筆、是否前往逃生門，都由你決定。";
    case "running":
      return activeClue
        ? "發現可疑物件！立即聚焦，記住門鎖提示。"
        : "角色正在自動奔跑。注意走廊中的異常物件。";
    case "door":
      return lockStep === "rotation"
        ? "回想沿途提示，操作門鎖。"
        : "完成第二段敲擊並確認。";
    case "closing":
      return closingStep === "close"
        ? "還沒成功！殺手就在後方，把門拉上。"
        : "最後一步：轉動內側門栓。";
    case "success":
      return "門栓扣上了。你逃出去了。";
    case "fail":
      return "逃生失敗，但你可以立刻調整路線再試一次。";
  }
}

export default function Home() {
  const [phase, setPhase] = useState<GamePhase>("planning");
  const [plannedNodeIds, setPlannedNodeIds] = useState<MapNodeId[]>(["start"]);
  const [routeError, setRouteError] = useState("");
  const [runProgress, setRunProgress] = useState(0);
  const [activeClue, setActiveClue] = useState<Clue | null>(null);
  const [focusedClue, setFocusedClue] = useState<Clue | null>(null);
  const [seenClueIds, setSeenClueIds] = useState<ClueId[]>([]);
  const [missedClueIds, setMissedClueIds] = useState<ClueId[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [lastStruggle, setLastStruggle] = useState(false);
  const [lockStep, setLockStep] = useState<LockStep>("rotation");
  const [turns, setTurns] = useState(0);
  const [knocks, setKnocks] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [closingStep, setClosingStep] = useState<ClosingStep>("close");
  const [failureReason, setFailureReason] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const [runPaused, setRunPaused] = useState(false);
  const [routeLocked, setRouteLocked] = useState<RouteConfig | null>(null);
  const [sceneTuning, setSceneTuning] =
    useState<SceneTuning>(readStoredSceneTuning);

  const seenRef = useRef<Set<ClueId>>(new Set());
  const runPausedRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    window.localStorage.setItem(
      SCENE_TUNING_STORAGE_KEY,
      JSON.stringify(sceneTuning),
    );
  }, [sceneTuning]);

  const plannedRoute = useMemo(
    () => buildRouteConfig(plannedNodeIds),
    [plannedNodeIds],
  );

  const routeHasKey = plannedNodeIds.includes("key");
  const routeReachedExit = plannedNodeIds.at(-1) === "exit";
  const routeIsReady = plannedNodeIds.length > 1;

  const currentRoute = useMemo(
    () => routeLocked ?? plannedRoute ?? EMPTY_ROUTE,
    [plannedRoute, routeLocked],
  );

  const playTone = useCallback(
    (frequency: number, duration = 0.08, volume = 0.035) => {
      if (!soundOn || typeof window === "undefined") return;
      const AudioCtor =
        window.AudioContext ??
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioCtor) return;
      const audio = audioRef.current ?? new AudioCtor();
      audioRef.current = audio;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audio.currentTime + duration,
      );
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    },
    [soundOn],
  );

  const failRun = useCallback((reason: string) => {
    setFailureReason(reason);
    setPhase("fail");
  }, []);

  const resetRun = useCallback(() => {
    runPausedRef.current = false;
    setRunPaused(false);
    setPhase("planning");
    setRouteLocked(null);
    setPlannedNodeIds(["start"]);
    setRouteError("");
    setRunProgress(0);
    setActiveClue(null);
    setFocusedClue(null);
    setSeenClueIds([]);
    setMissedClueIds([]);
    seenRef.current = new Set();
    setTimeLeft(0);
    setLastStruggle(false);
    setLockStep("rotation");
    setTurns(0);
    setKnocks(0);
    setMistakes(0);
    setClosingStep("close");
    setFailureReason("");
  }, []);

  const startRun = useCallback(() => {
    if (!routeIsReady) {
      setRouteError("請從 START 按住，至少連上一個相鄰節點。");
      playTone(95, 0.15, 0.05);
      return;
    }
    setRouteLocked(plannedRoute);
    setRouteError("");
    setRunProgress(0);
    setActiveClue(null);
    setFocusedClue(null);
    setSeenClueIds([]);
    setMissedClueIds([]);
    seenRef.current = new Set();
    runPausedRef.current = false;
    setRunPaused(false);
    setPhase("running");
    playTone(180, 0.14, 0.045);
  }, [plannedRoute, playTone, routeIsReady]);

  const beginRouteStroke = useCallback(() => {
    if (phase !== "planning") return;
    setPlannedNodeIds(["start"]);
    setRouteError("");
    playTone(245, 0.06, 0.024);
  }, [phase, playTone]);

  const appendRouteNode = useCallback(
    (nodeId: MapNodeId) => {
      if (phase !== "planning") return;
      setPlannedNodeIds((current) => {
        const lastNodeId = current.at(-1) ?? "start";
        const previousNodeId = current.at(-2);

        if (nodeId === lastNodeId) return current;
        if (nodeId === previousNodeId) {
          setRouteError("");
          playTone(210, 0.05, 0.02);
          return current.slice(0, -1);
        }
        if (!areConnected(lastNodeId, nodeId)) {
          setRouteError("只能連接目前位置旁邊的道路節點。");
          playTone(95, 0.1, 0.04);
          return current;
        }
        if (current.includes(nodeId)) {
          setRouteError("同一個節點不能重複經過；可返回上一步重新畫。");
          playTone(95, 0.1, 0.04);
          return current;
        }
        setRouteError("");
        playTone(nodeId === "key" ? 620 : 280, 0.07, 0.03);
        return [...current, nodeId];
      });
    },
    [phase, playTone],
  );

  const clearRoute = useCallback(() => {
    setPlannedNodeIds(["start"]);
    setRouteError("");
    playTone(160, 0.07, 0.025);
  }, [playTone]);

  const focusCurrentClue = useCallback(() => {
    if (phase !== "running" || !activeClue) return;
    if (!seenRef.current.has(activeClue.id)) {
      seenRef.current.add(activeClue.id);
      setSeenClueIds((current) => [...current, activeClue.id]);
    }
    setFocusedClue(activeClue);
    setActiveClue(null);
    playTone(720, 0.16, 0.045);
    window.setTimeout(() => setFocusedClue(null), 1750);
  }, [activeClue, phase, playTone]);

  const toggleRunPause = useCallback(() => {
    if (phase !== "running") return;
    const next = !runPausedRef.current;
    runPausedRef.current = next;
    setRunPaused(next);
    playTone(next ? 170 : 320, 0.08, 0.025);
  }, [phase, playTone]);

  useEffect(() => {
    if (phase !== "running") return;

    const route = currentRoute;
    let elapsedMs = 0;
    let previousTick = performance.now();
    let finished = false;
    const revealedClues = new Set<ClueId>();
    let activeWindow: { clueId: ClueId; expiresAt: number } | null = null;

    const progressTimer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - previousTick;
      previousTick = now;
      if (runPausedRef.current || finished) return;

      elapsedMs += delta;
      setRunProgress(Math.min(1, elapsedMs / route.durationMs));

      route.events.forEach((event) => {
        const showAt = route.durationMs * event.at;
        if (revealedClues.has(event.clueId) || elapsedMs < showAt) return;
        revealedClues.add(event.clueId);
        const clue = CLUES[event.clueId];
        setActiveClue(clue);
        playTone(430, 0.07, 0.028);
        activeWindow = {
          clueId: event.clueId,
          expiresAt: elapsedMs + route.clueWindowMs,
        };
      });

      if (activeWindow && elapsedMs >= activeWindow.expiresAt) {
        const expiredClueId = activeWindow.clueId;
        activeWindow = null;
        setActiveClue((current) =>
          current?.id === expiredClueId ? null : current,
        );
        if (!seenRef.current.has(expiredClueId)) {
          setMissedClueIds((current) =>
            current.includes(expiredClueId)
              ? current
              : [...current, expiredClueId],
          );
        }
      }

      if (elapsedMs >= route.durationMs) {
        finished = true;
        runPausedRef.current = false;
        setRunPaused(false);
        setRunProgress(1);
        setActiveClue(null);
        setFocusedClue(null);
        const finalNodeId = route.nodeIds.at(-1) ?? "start";
        const reachedExit = finalNodeId === "exit";
        const collectedKey = route.nodeIds.includes("key");

        if (!reachedExit) {
          setFailureReason(
            `你畫的路線在「${MAP_NODE_LOOKUP[finalNodeId].label}」停下；怪物沿著筆跡追了上來。`,
          );
          setTimeLeft(0);
          setPhase("fail");
          playTone(92, 0.28, 0.065);
        } else if (!collectedKey) {
          setFailureReason("你成功跑到逃生門，卻沒有在路線上取得鑰匙。");
          setTimeLeft(0);
          setPhase("fail");
          playTone(86, 0.3, 0.07);
        } else {
          setTimeLeft(route.doorTimeSeconds);
          setLastStruggle(false);
          setLockStep("rotation");
          setTurns(0);
          setKnocks(0);
          setPhase("door");
          playTone(240, 0.18, 0.05);
        }
        window.clearInterval(progressTimer);
      }
    }, 40);

    return () => {
      window.clearInterval(progressTimer);
    };
  }, [currentRoute, phase, playTone]);

  useEffect(() => {
    if (phase !== "running") return;
    return () => {
      runPausedRef.current = false;
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "door" && phase !== "closing") return;

    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        const next = current - 0.05;
        if (next <= 0 && !lastStruggle) {
          setLastStruggle(true);
          playTone(110, 0.22, 0.05);
        }
        if (next <= -1.3) {
          window.clearInterval(timer);
          const reason =
            phase === "closing"
              ? closingStep === "close"
                ? "門鎖解開了，但你沒有及時把門關上。"
                : "門已關閉，但內側門栓還沒有扣上。"
              : lockStep === "rotation"
                ? "殺手抵達時，旋轉鎖仍未解開。"
                : "旋轉正確，但敲擊步驟沒有及時完成。";
          failRun(reason);
        }
        return next;
      });
    }, 50);

    return () => window.clearInterval(timer);
  }, [
    closingStep,
    failRun,
    lastStruggle,
    lockStep,
    phase,
    playTone,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (phase === "planning") {
        if (event.key === "Enter" && routeIsReady) startRun();
        if (event.key === "Escape") clearRoute();
      }
      if (phase === "running" && event.code === "Space") {
        event.preventDefault();
        focusCurrentClue();
      }
      if (phase === "running" && event.key.toLowerCase() === "p") {
        event.preventDefault();
        toggleRunPause();
      }
      if ((phase === "success" || phase === "fail") && event.key.toLowerCase() === "r") {
        resetRun();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    clearRoute,
    focusCurrentClue,
    phase,
    plannedNodeIds.length,
    resetRun,
    routeIsReady,
    startRun,
    toggleRunPause,
  ]);

  const applyMistake = useCallback(
    (message: string) => {
      setMistakes((current) => current + 1);
      setTimeLeft((current) => current - 0.8);
      setFailureReason(message);
      playTone(95, 0.16, 0.055);
    },
    [playTone],
  );

  const rotateLock = (direction: "left" | "right") => {
    if (phase !== "door" || lockStep !== "rotation") return;
    if (direction === "left") {
      setTurns(0);
      applyMistake("旋轉方向錯誤，鎖芯卡住並損失 0.8 秒。");
      return;
    }
    const next = turns + 1;
    setTurns(next);
    playTone(360 + next * 80, 0.1, 0.04);
    if (next === 2) {
      window.setTimeout(() => {
        setLockStep("knock");
        playTone(620, 0.12, 0.045);
      }, 420);
    }
  };

  const knockDoor = () => {
    if (phase !== "door" || lockStep !== "knock") return;
    const next = knocks >= 4 ? 1 : knocks + 1;
    setKnocks(next);
    playTone(150 - next * 5, 0.07, 0.07);
  };

  const confirmKnocks = () => {
    if (knocks === 3) {
      setPhase("closing");
      setClosingStep("close");
      playTone(560, 0.14, 0.05);
      return;
    }
    setKnocks(0);
    applyMistake(`敲擊 ${knocks || 0} 次不正確，鎖舌彈回並損失 0.8 秒。`);
  };

  const closeDoor = () => {
    setClosingStep("lock");
    playTone(105, 0.18, 0.075);
  };

  const lockDoor = () => {
    setPhase("success");
    setLastStruggle(false);
    playTone(760, 0.28, 0.055);
  };

  const phaseIndex = PHASE_INDEX[phase];
  const dangerLevel =
    phase === "door" || phase === "closing"
      ? timeLeft <= 3
        ? "critical"
        : timeLeft <= 6
          ? "warning"
          : "steady"
      : "steady";

  return (
    <main className={`game-root phase-${phase} danger-${dangerLevel}`}>
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">ED</span>
          <div>
            <p>PHASE P2.4</p>
            <h1>逃生門計畫</h1>
          </div>
        </div>

        <div className="phase-track" aria-label="逃生進度">
          {PHASE_ITEMS.map((item, index) => (
            <div
              className={`phase-item ${index === phaseIndex ? "active" : ""} ${
                index < phaseIndex ? "done" : ""
              }`}
              key={item.key}
            >
              <span>{index < phaseIndex ? "✓" : index + 1}</span>
              {item.label}
            </div>
          ))}
        </div>

        <div className="top-actions">
          <span className="seed-chip">SEED · P1-FIXED-001</span>
          <button
            className="icon-button"
            type="button"
            onClick={() => setSoundOn((current) => !current)}
            aria-label={soundOn ? "關閉音效" : "開啟音效"}
            title={soundOn ? "關閉音效" : "開啟音效"}
          >
            {soundOn ? "♪" : "×"}
          </button>
        </div>
      </header>

      <section className="mission-strip" aria-live="polite">
        <span className="mission-pulse" />
        <strong>
          {phase === "planning"
            ? "制定計畫"
            : phase === "running"
              ? "執行計畫"
              : phase === "door" || phase === "closing"
                ? "殺手正在接近"
                : phase === "success"
                  ? "逃生成功"
                  : "計畫失敗"}
        </strong>
        <p>
          {phaseInstruction(
            phase,
            activeClue,
            lockStep,
            closingStep,
          )}
        </p>
        {(phase === "door" || phase === "closing") && (
          <div className={`countdown countdown-${dangerLevel}`}>
            <span>預計抵達</span>
            <b>{formatSeconds(timeLeft)}s</b>
          </div>
        )}
      </section>

      <div className="game-frame">
        {phase === "planning" && (
          <PlanningScreen
            plannedNodeIds={plannedNodeIds}
            route={plannedRoute}
            routeError={routeError}
            hasKey={routeHasKey}
            reachedExit={routeReachedExit}
            isReady={routeIsReady}
            onBeginStroke={beginRouteStroke}
            onAppendNode={appendRouteNode}
            onClear={clearRoute}
            onStart={startRun}
          />
        )}

        {phase === "running" && (
          <RunningScreen
            route={currentRoute}
            progress={runProgress}
            paused={runPaused}
            activeClue={activeClue}
            focusedClue={focusedClue}
            seenClueIds={seenClueIds}
            onFocus={focusCurrentClue}
            onPauseToggle={toggleRunPause}
            tuning={sceneTuning}
            onTuningChange={setSceneTuning}
            onResetTuning={() =>
              setSceneTuning({ ...DEFAULT_SCENE_TUNING })
            }
          />
        )}

        {phase === "door" && (
          <DoorScreen
            lockStep={lockStep}
            turns={turns}
            knocks={knocks}
            seenClueIds={seenClueIds}
            mistakes={mistakes}
            lastStruggle={lastStruggle}
            failureMessage={failureReason}
            onRotate={rotateLock}
            onKnock={knockDoor}
            onConfirmKnocks={confirmKnocks}
          />
        )}

        {phase === "closing" && (
          <ClosingScreen
            step={closingStep}
            lastStruggle={lastStruggle}
            onClose={closeDoor}
            onLock={lockDoor}
          />
        )}

        {(phase === "success" || phase === "fail") && (
          <ResultScreen
            success={phase === "success"}
            route={currentRoute}
            timeLeft={timeLeft}
            seenClueIds={seenClueIds}
            missedClueIds={missedClueIds}
            mistakes={mistakes}
            failureReason={failureReason}
            onRetry={resetRun}
          />
        )}
      </div>

      <footer className="prototype-footer">
        <span>筆記本路線 · 路線與節點場景同步</span>
        <p>
          {phase === "planning"
            ? "從 START 按住一筆畫 · 放開完成 · Esc 清除"
            : phase === "running"
              ? "快捷鍵：P 暫停／繼續 · Space 聚焦提示"
              : phase === "success" || phase === "fail"
                ? "快捷鍵：R 再試一次"
                : "錯誤操作會損失 0.8 秒"}
        </p>
      </footer>
    </main>
  );
}

function PlanningScreen({
  plannedNodeIds,
  route,
  routeError,
  hasKey,
  reachedExit,
  isReady,
  onBeginStroke,
  onAppendNode,
  onClear,
  onStart,
}: {
  plannedNodeIds: MapNodeId[];
  route: RouteConfig;
  routeError: string;
  hasKey: boolean;
  reachedExit: boolean;
  isReady: boolean;
  onBeginStroke: () => void;
  onAppendNode: (nodeId: MapNodeId) => void;
  onClear: () => void;
  onStart: () => void;
}) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [cursorPoint, setCursorPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [strokeMessage, setStrokeMessage] = useState(
    "請從底部 YOU ARE HERE 開始規劃。",
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const routeCanvasRef = useRef<HTMLCanvasElement>(null);
  const activePointerRef = useRef<number | null>(null);
  const lastNodeId = plannedNodeIds.at(-1) ?? "start";
  const lastNode = MAP_NODE_LOOKUP[lastNodeId];
  const safeRoute = hasKey && reachedExit;
  const finalLocation = MAP_NODE_LOOKUP[lastNodeId].label;

  useEffect(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = MAP_WIDTH * dpr;
    canvas.height = MAP_HEIGHT * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    let paperSeed = 20260728;
    const random = () => {
      let value = paperSeed += 0x6d2b79f5;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const rand = (minimum: number, maximum: number) =>
      minimum + (maximum - minimum) * random();
    const jitter = (value: number, amount = 2) =>
      value + rand(-amount, amount);
    const handLine = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      {
        color = "#3c342d",
        width = 2.4,
        passes = 2,
        wobble = 2.4,
        alpha = 1,
      }: {
        color?: string;
        width?: number;
        passes?: number;
        wobble?: number;
        alpha?: number;
      } = {},
    ) => {
      context.save();
      context.strokeStyle = color;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.globalAlpha = alpha;

      for (let pass = 0; pass < passes; pass += 1) {
        const deltaX = to.x - from.x;
        const deltaY = to.y - from.y;
        const length = Math.max(1, Math.hypot(deltaX, deltaY));
        const steps = Math.max(3, Math.floor(length / 26));
        context.beginPath();
        context.lineWidth = Math.max(0.7, width + rand(-0.4, 0.4));
        context.moveTo(jitter(from.x, wobble), jitter(from.y, wobble));

        for (let step = 1; step < steps; step += 1) {
          const progress = step / steps;
          const bend =
            Math.sin(progress * Math.PI) *
            rand(-wobble * 1.4, wobble * 1.4);
          const pointX =
            from.x +
            deltaX * progress +
            (-deltaY / length) * bend +
            rand(-wobble, wobble);
          const pointY =
            from.y +
            deltaY * progress +
            (deltaX / length) * bend +
            rand(-wobble, wobble);
          context.lineTo(pointX, pointY);
        }
        context.lineTo(jitter(to.x, wobble), jitter(to.y, wobble));
        context.stroke();
      }
      context.restore();
    };
    const handPolyline = (
      points: Array<{ x: number; y: number }>,
      options: Parameters<typeof handLine>[2] = {},
    ) => {
      points.slice(1).forEach((point, index) => {
        handLine(points[index], point, options);
      });
    };
    const handText = (
      text: string,
      x: number,
      y: number,
      size = 22,
      rotation = 0,
      color = "#23201c",
      align: CanvasTextAlign = "left",
    ) => {
      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.fillStyle = color;
      context.font = `700 ${size}px "Segoe Print", "Comic Sans MS", cursive`;
      context.textAlign = align;
      context.textBaseline = "middle";
      context.fillText(text, 0, 0);
      context.restore();
    };

    context.save();
    context.globalCompositeOperation = "multiply";
    for (let index = 0; index < 9; index += 1) {
      context.beginPath();
      context.ellipse(
        rand(180, 930),
        rand(90, 590),
        rand(36, 110),
        rand(18, 54),
        rand(-0.5, 0.5),
        0,
        Math.PI * 2,
      );
      context.fillStyle = "rgba(163, 92, 86, 0.12)";
      context.fill();
    }
    context.restore();

    handPolyline(
      [
        { x: 26, y: 28 },
        { x: 1074, y: 32 },
        { x: 1076, y: 654 },
        { x: 28, y: 652 },
        { x: 26, y: 28 },
      ],
      { width: 2.8, wobble: 2.8 },
    );

    const silhouetteX = 100;
    const silhouetteY = 280;
    handLine(
      { x: silhouetteX - 42, y: silhouetteY - 110 },
      { x: silhouetteX - 76, y: silhouetteY - 28 },
      { width: 4, wobble: 3 },
    );
    handLine(
      { x: silhouetteX - 76, y: silhouetteY - 28 },
      { x: silhouetteX - 89, y: silhouetteY + 34 },
      { width: 4, wobble: 3 },
    );
    handLine(
      { x: silhouetteX + 44, y: silhouetteY - 110 },
      { x: silhouetteX + 82, y: silhouetteY - 34 },
      { width: 4, wobble: 3 },
    );
    handLine(
      { x: silhouetteX + 82, y: silhouetteY - 34 },
      { x: silhouetteX + 95, y: silhouetteY + 36 },
      { width: 4, wobble: 3 },
    );
    context.beginPath();
    context.arc(silhouetteX, silhouetteY - 70, 44, 0, Math.PI * 2);
    context.strokeStyle = "#3c342d";
    context.lineWidth = 4;
    context.stroke();
    handLine(
      { x: silhouetteX, y: silhouetteY - 26 },
      { x: silhouetteX, y: silhouetteY + 82 },
      { width: 4, wobble: 2.5 },
    );
    handLine(
      { x: silhouetteX, y: silhouetteY + 82 },
      { x: silhouetteX - 18, y: silhouetteY + 196 },
      { width: 4, wobble: 3 },
    );
    handLine(
      { x: silhouetteX, y: silhouetteY + 82 },
      { x: silhouetteX + 20, y: silhouetteY + 196 },
      { width: 4, wobble: 3 },
    );
    handLine(
      { x: silhouetteX - 2, y: silhouetteY + 16 },
      { x: silhouetteX - 48, y: silhouetteY + 84 },
      { width: 4, wobble: 3 },
    );
    handLine(
      { x: silhouetteX + 2, y: silhouetteY + 16 },
      { x: silhouetteX + 48, y: silhouetteY + 84 },
      { width: 4, wobble: 3 },
    );

    handPolyline(
      [
        { x: 300, y: 224 },
        { x: 246, y: 320 },
        { x: 280, y: 443 },
        { x: 445, y: 562 },
        { x: 700, y: 545 },
        { x: 850, y: 430 },
        { x: 878, y: 240 },
        { x: 814, y: 116 },
      ],
      {
        width: 2.1,
        wobble: 4.2,
        color: "rgba(60, 52, 45, 0.44)",
        passes: 1,
      },
    );
    handPolyline(
      [
        { x: 412, y: 150 },
        { x: 358, y: 228 },
        { x: 399, y: 342 },
        { x: 520, y: 432 },
        { x: 684, y: 425 },
        { x: 764, y: 334 },
        { x: 740, y: 222 },
        { x: 644, y: 170 },
      ],
      {
        width: 2.1,
        wobble: 4.2,
        color: "rgba(60, 52, 45, 0.44)",
        passes: 1,
      },
    );

    MAP_EDGES.forEach(([fromId, toId]) => {
      const points = getMapEdgePoints(fromId, toId);
      handPolyline(points, {
        width: 5.2,
        wobble: 2.8,
        color: "rgba(56, 50, 44, 0.55)",
        passes: 1,
        alpha: 0.34,
      });
      handPolyline(points, {
        width: 2.7,
        wobble: 2.2,
        color: "#3c342d",
        passes: 2,
      });
    });

    const highlightedNodeIds: MapNodeId[] = [
      "turnClue",
      "key",
      "knockClue",
      "exit",
    ];
    highlightedNodeIds.forEach((nodeId) => {
      const node = MAP_NODE_LOOKUP[nodeId];
      context.save();
      context.globalCompositeOperation = "multiply";
      context.fillStyle = "rgba(220, 217, 24, 0.62)";
      context.beginPath();
      context.ellipse(
        node.x,
        node.y,
        nodeId === "exit" ? 48 : 37,
        nodeId === "exit" ? 30 : 27,
        rand(-0.35, 0.35),
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();
    });

    const tree = MAP_NODE_LOOKUP.middleEntry;
    handLine(
      { x: tree.x, y: tree.y + 10 },
      { x: tree.x, y: tree.y - 18 },
      { width: 3 },
    );
    handPolyline(
      [
        { x: tree.x - 16, y: tree.y - 4 },
        { x: tree.x - 6, y: tree.y - 24 },
        { x: tree.x + 4, y: tree.y - 8 },
        { x: tree.x + 12, y: tree.y - 25 },
        { x: tree.x + 19, y: tree.y - 5 },
      ],
      { width: 2.4 },
    );

    const shack = MAP_NODE_LOOKUP.northEntry;
    handPolyline(
      [
        { x: shack.x - 25, y: shack.y + 8 },
        { x: shack.x - 25, y: shack.y - 16 },
        { x: shack.x + 20, y: shack.y - 16 },
        { x: shack.x + 20, y: shack.y + 8 },
        { x: shack.x - 25, y: shack.y + 8 },
      ],
      { width: 2.2 },
    );
    handPolyline(
      [
        { x: shack.x - 30, y: shack.y - 16 },
        { x: shack.x - 3, y: shack.y - 30 },
        { x: shack.x + 24, y: shack.y - 16 },
      ],
      { width: 2.2 },
    );

    const machinery = MAP_NODE_LOOKUP.turnClue;
    handPolyline(
      [
        { x: machinery.x - 26, y: machinery.y + 8 },
        { x: machinery.x + 10, y: machinery.y + 8 },
        { x: machinery.x + 26, y: machinery.y - 4 },
        { x: machinery.x + 26, y: machinery.y - 18 },
        { x: machinery.x - 10, y: machinery.y - 18 },
        { x: machinery.x - 26, y: machinery.y - 6 },
        { x: machinery.x - 26, y: machinery.y + 8 },
      ],
      { width: 2.2 },
    );

    const tunnel = MAP_NODE_LOOKUP.northExit;
    context.beginPath();
    context.ellipse(tunnel.x, tunnel.y, 34, 18, 0.15, 0, Math.PI * 2);
    context.strokeStyle = "#3c342d";
    context.lineWidth = 2.4;
    context.stroke();

    const house = MAP_NODE_LOOKUP.middleHub;
    handPolyline(
      [
        { x: house.x - 26, y: house.y + 20 },
        { x: house.x - 26, y: house.y - 10 },
        { x: house.x, y: house.y - 28 },
        { x: house.x + 26, y: house.y - 10 },
        { x: house.x + 26, y: house.y + 20 },
        { x: house.x - 26, y: house.y + 20 },
      ],
      { width: 2.2 },
    );

    const silo = MAP_NODE_LOOKUP.southEntry;
    for (let index = 0; index < 3; index += 1) {
      context.beginPath();
      context.ellipse(
        silo.x - 22 + index * 22,
        silo.y,
        12,
        22,
        0.1,
        0,
        Math.PI * 2,
      );
      context.strokeStyle = "#3c342d";
      context.lineWidth = 2;
      context.stroke();
    }

    const columns = MAP_NODE_LOOKUP.middleExit;
    for (let index = 0; index < 3; index += 1) {
      handLine(
        { x: columns.x - 14 + index * 13, y: columns.y - 18 },
        { x: columns.x - 14 + index * 13, y: columns.y + 16 },
        { width: 2.2 },
      );
    }

    const rocks = MAP_NODE_LOOKUP.southStore;
    handPolyline(
      [
        { x: rocks.x - 20, y: rocks.y + 10 },
        { x: rocks.x - 24, y: rocks.y - 8 },
        { x: rocks.x - 6, y: rocks.y - 18 },
        { x: rocks.x + 10, y: rocks.y - 10 },
        { x: rocks.x + 14, y: rocks.y + 12 },
        { x: rocks.x - 20, y: rocks.y + 10 },
      ],
      { width: 2.2 },
    );

    const keyNode = MAP_NODE_LOOKUP.key;
    context.beginPath();
    context.arc(keyNode.x - 12, keyNode.y - 8, 10, 0, Math.PI * 2);
    context.strokeStyle = "#3c342d";
    context.lineWidth = 2.5;
    context.stroke();
    handLine(
      { x: keyNode.x - 4, y: keyNode.y },
      { x: keyNode.x + 22, y: keyNode.y + 20 },
      { width: 2.8 },
    );
    handLine(
      { x: keyNode.x + 11, y: keyNode.y + 12 },
      { x: keyNode.x + 18, y: keyNode.y + 5 },
      { width: 2.2 },
    );

    const wall = MAP_NODE_LOOKUP.knockClue;
    handLine(
      { x: wall.x - 12, y: wall.y + 18 },
      { x: wall.x + 12, y: wall.y - 18 },
      { width: 3 },
    );
    handLine(
      { x: wall.x - 20, y: wall.y + 10 },
      { x: wall.x + 4, y: wall.y - 22 },
      { width: 2.5 },
    );

    const exitNode = MAP_NODE_LOOKUP.exit;
    handPolyline(
      [
        { x: exitNode.x - 22, y: exitNode.y + 26 },
        { x: exitNode.x - 22, y: exitNode.y - 30 },
        { x: exitNode.x + 19, y: exitNode.y - 30 },
        { x: exitNode.x + 19, y: exitNode.y + 26 },
      ],
      { width: 2.8 },
    );
    context.beginPath();
    context.arc(exitNode.x + 10, exitNode.y, 3, 0, Math.PI * 2);
    context.fillStyle = "#3c342d";
    context.fill();

    Object.values(MAP_NODE_LOOKUP).forEach((node) => {
      context.beginPath();
      context.arc(node.x + rand(-1, 1), node.y + rand(-1, 1), 7, 0, Math.PI * 2);
      context.fillStyle = node.id === "start" ? "#8d2c2a" : "#23201c";
      context.fill();
    });

    handText("1. 西側岔路", 268, 492, 23, -0.03);
    handText("2. 中央走廊", 430, 578, 23, 0.01);
    handText("3. 東側岔路", 675, 457, 22, -0.01);
    handText("4. 機械室 ?", 274, 248, 23, -0.02);
    handText("5. 中央機房", 510, 337, 22, 0.01);
    handText("6. 廢棄倉庫", 835, 363, 22, 0.01);
    handText("7. 銅鑰匙", 650, 292, 22, -0.02);
    handText("8. 北側長廊", 452, 202, 22, -0.04);
    handText("9. 直通走廊", 620, 215, 21, -0.03);
    handText("10. 維修提示", 692, 112, 20, 0.02);
    handText("逃生門", 852, 82, 24, -0.04, "#8d2c2a");
    handText("you are here", 630, 598, 22, 0.03, "#8d2c2a");

    handPolyline(
      [
        { x: 610, y: 586 },
        { x: 575, y: 586 },
        { x: 575, y: 602 },
        { x: 562, y: 596 },
      ],
      { width: 2.4, color: "#8d2c2a" },
    );
    handText("GOOD LUCK", 210, 92, 28, -0.35);
    handText("DON'T LOOK BACK", 680, 76, 23, -0.16);
    handPolyline(
      [
        { x: 915, y: 545 },
        { x: 1020, y: 398 },
        { x: 985, y: 397 },
      ],
      { width: 2.5 },
    );
    handPolyline(
      [
        { x: 70, y: 86 },
        { x: 36, y: 120 },
        { x: 49, y: 122 },
      ],
      { width: 2.6 },
    );

    for (let index = 0; index < 8; index += 1) {
      handLine(
        { x: 915 + index * 8, y: 420 + index * 14 },
        { x: 974 + index * 8, y: 469 + index * 14 },
        { width: 1.8, wobble: 1.4 },
      );
    }
    handLine(
      { x: 910, y: 416 },
      { x: 977, y: 570 },
      { width: 2.2, wobble: 1.2 },
    );
    handLine(
      { x: 930, y: 410 },
      { x: 995, y: 564 },
      { width: 2.2, wobble: 1.2 },
    );
  }, []);

  useEffect(() => {
    const canvas = routeCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = MAP_WIDTH * dpr;
    canvas.height = MAP_HEIGHT * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    context.globalCompositeOperation = "multiply";

    const points = plannedNodeIds.flatMap((id, index) => {
      if (index === 0) return [MAP_NODE_LOOKUP[id]];
      return getMapEdgePoints(plannedNodeIds[index - 1], id).slice(1);
    });
    const noise = (index: number, pass: number, axis: number) => {
      const raw =
        Math.sin(index * 12.9898 + pass * 71.731 + axis * 17.113 + 22.1) *
        43758.5453;
      return ((raw - Math.floor(raw)) * 2 - 1) * 1.45;
    };

    const drawInkPass = (width: number, alpha: number, pass: number) => {
      if (points.length < 2) return;
      context.save();
      context.strokeStyle = `rgba(160, 49, 41, ${alpha})`;
      context.lineWidth = width;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(
        points[0].x + noise(0, pass, 0),
        points[0].y + noise(0, pass, 1),
      );

      points.slice(1).forEach((point, segmentIndex) => {
        const from = points[segmentIndex];
        const steps = Math.max(
          4,
          Math.round(Math.hypot(point.x - from.x, point.y - from.y) / 22),
        );
        for (let step = 1; step <= steps; step += 1) {
          const progress = step / steps;
          const noiseIndex = segmentIndex * 19 + step;
          context.lineTo(
            from.x +
              (point.x - from.x) * progress +
              noise(noiseIndex, pass, 0),
            from.y +
              (point.y - from.y) * progress +
              noise(noiseIndex, pass, 1),
          );
        }
      });
      context.stroke();
      context.restore();
    };

    drawInkPass(9, 0.12, 0);
    drawInkPass(3.6, 0.84, 1);
    drawInkPass(1.2, 0.72, 2);

    plannedNodeIds.slice(1).forEach((id) => {
      const node = MAP_NODE_LOOKUP[id];
      context.beginPath();
      context.arc(node.x, node.y, 13, 0, Math.PI * 2);
      context.strokeStyle = "rgba(166, 64, 52, 0.85)";
      context.lineWidth = 2.1;
      context.stroke();
    });

    if (isDrawing && cursorPoint) {
      context.save();
      context.strokeStyle = "rgba(160, 49, 41, 0.62)";
      context.lineWidth = 2.5;
      context.setLineDash([8, 7]);
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(lastNode.x, lastNode.y);
      context.lineTo(cursorPoint.x, cursorPoint.y);
      context.stroke();
      context.restore();
    }
  }, [cursorPoint, isDrawing, lastNode.x, lastNode.y, plannedNodeIds]);

  const pointFromPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const bounds = stage.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * MAP_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * MAP_HEIGHT,
    };
  };

  const nearestConnectedNode = (point: { x: number; y: number }) => {
    const candidates = MAP_NODES.filter(
      (node) => node.id !== lastNodeId && areConnected(lastNodeId, node.id),
    )
      .map((node) => ({
        node,
        distance: Math.hypot(node.x - point.x, node.y - point.y),
      }))
      .sort((a, b) => a.distance - b.distance);
    return candidates[0]?.distance <= 55 ? candidates[0].node : null;
  };

  const beginStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointFromPointer(event);
    if (!point) return;
    const start = MAP_NODE_LOOKUP.start;
    const startsOnMarker =
      Math.hypot(point.x - start.x, point.y - start.y) <= 78;

    if (!startsOnMarker) {
      setStrokeMessage("請從底部 YOU ARE HERE 附近開始");
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerRef.current = event.pointerId;
    onBeginStroke();
    setIsDrawing(true);
    setCursorPoint(point);
    setStrokeMessage("不要放開，沿著道路拖過黑色地標點");
  };

  const moveStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDrawing || activePointerRef.current !== event.pointerId) return;
    const point = pointFromPointer(event);
    if (!point) return;
    event.preventDefault();
    setCursorPoint(point);
    const snappedNode = nearestConnectedNode(point);
    if (snappedNode) {
      onAppendNode(snappedNode.id);
      setStrokeMessage(`已連到「${snappedNode.label}」`);
    }
  };

  const finishStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointerRef.current = null;
    setIsDrawing(false);
    setCursorPoint(null);
    setStrokeMessage("已完成一筆路線；可以直接開始逃亡。");
  };

  const routeNote =
    routeError ||
    (isDrawing
      ? strokeMessage
      : !isReady
        ? "這是一張可辨識的連通道路網。請從底部「YOU ARE HERE」開始規劃。"
        : safeRoute
          ? "路線已經過鑰匙並抵達逃生門。可以現在開始逃亡。"
          : reachedExit && !hasKey
            ? "你畫到了逃生門，但路線沒有經過鑰匙；仍然可以開始。"
            : hasKey
              ? `你拿到了鑰匙，但路線停在「${finalLocation}」；仍然可以開始。`
              : `路線停在「${finalLocation}」；何時停筆由你決定。`);

  return (
    <div className="planning-layout notebook-reference-layout">
      <section className="map-panel notebook-reference-panel">
        <div className="notebook-reference-heading">
          <div>
            <p>ESCAPE NOTE MAP / 潦草筆記本地圖</p>
            <h2>倖存者手繪的 B1 地下層</h2>
          </div>
          <span>
            可讀的連通道路網
            <br />
            從底部 YOU ARE HERE 開始一筆畫
          </span>
        </div>

        <div className="notebook-paper-wrap">
          <div
            ref={stageRef}
            className={`map-stage drawing-map notebook-map reference-paper ${
              isDrawing ? "is-drawing" : ""
            }`}
            onPointerDown={beginStroke}
            onPointerMove={moveStroke}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            role="application"
            aria-label="潦草筆記本逃亡地圖。從底部 YOU ARE HERE 按住，沿道路拖過相鄰地標點。"
            tabIndex={0}
          >
            <canvas
              ref={mapCanvasRef}
              className="notebook-map-canvas"
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              aria-label="手繪地下層道路與地標"
            />
            <canvas
              ref={routeCanvasRef}
              className="notebook-route-canvas"
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              aria-hidden="true"
            />

            {MAP_NODES.map((node) => {
              const selectedIndex = plannedNodeIds.indexOf(node.id);
              const isSelected = selectedIndex >= 0;
              const isCurrent = node.id === lastNodeId;
              const canConnect =
                node.id !== lastNodeId && areConnected(lastNodeId, node.id);
              return (
                <span
                  key={node.id}
                  className={`map-hit-node point-${node.type} ${
                    isSelected ? "selected" : ""
                  } ${isCurrent ? "current" : ""} ${
                    canConnect ? "available" : ""
                  }`}
                  style={{
                    left: `${(node.x / MAP_WIDTH) * 100}%`,
                    top: `${(node.y / MAP_HEIGHT) * 100}%`,
                  }}
                  aria-label={`${node.label}${
                    isSelected ? `，路線第 ${selectedIndex + 1} 站` : ""
                  }`}
                  role="img"
                />
              );
            })}

            <div className="notebook-note">
              {routeNote}
            </div>
          </div>
        </div>

        <div className="notebook-controls">
          <button
            className="notebook-control danger"
            type="button"
            onClick={onClear}
            disabled={plannedNodeIds.length <= 1}
          >
            清除路線
          </button>
          <button
            type="button"
            className="notebook-control primary"
            onClick={onStart}
            disabled={!isReady}
          >
            開始逃亡
          </button>
          <span className="notebook-readout">
            經過地標：{Math.max(0, plannedNodeIds.length - 1)}
            　路線長度：{route.distanceMeters} m
            　提示：{route.events.length} / 2
          </span>
        </div>

        <p className={`notebook-risk-line ${safeRoute ? "safe" : ""}`}>
          <b>{safeRoute ? "路線完整" : isReady ? "可立即出發" : "尚未畫線"}</b>
          <span>
            鑰匙與逃生門不是開始條件；角色會完全按照這一筆路線奔跑。
          </span>
        </p>
      </section>
    </div>
  );
}

function RunningScreen({
  route,
  progress,
  paused,
  activeClue,
  focusedClue,
  seenClueIds,
  onFocus,
  onPauseToggle,
  tuning,
  onTuningChange,
  onResetTuning,
}: {
  route: RouteConfig;
  progress: number;
  paused: boolean;
  activeClue: Clue | null;
  focusedClue: Clue | null;
  seenClueIds: ClueId[];
  onFocus: () => void;
  onPauseToggle: () => void;
  tuning: SceneTuning;
  onTuningChange: (next: SceneTuning) => void;
  onResetTuning: () => void;
}) {
  const [lookBack, setLookBack] = useState(false);

  useEffect(() => {
    const startLookBack = (event: KeyboardEvent) => {
      if (event.code !== "KeyB" || event.repeat) return;
      event.preventDefault();
      setLookBack(true);
    };
    const stopLookBack = (event: KeyboardEvent) => {
      if (event.code !== "KeyB") return;
      event.preventDefault();
      setLookBack(false);
    };
    const clearLookBack = () => setLookBack(false);

    window.addEventListener("keydown", startLookBack);
    window.addEventListener("keyup", stopLookBack);
    window.addEventListener("blur", clearLookBack);
    return () => {
      window.removeEventListener("keydown", startLookBack);
      window.removeEventListener("keyup", stopLookBack);
      window.removeEventListener("blur", clearLookBack);
    };
  }, []);

  const beginLookBack = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setLookBack(true);
  };
  const endLookBack = () => setLookBack(false);

  const segmentCount = Math.max(1, route.nodeIds.length - 1);
  const segmentProgress = Math.min(
    segmentCount - 0.0001,
    progress * segmentCount,
  );
  const segmentIndex = Math.max(0, Math.floor(segmentProgress));
  const segmentFromId = route.nodeIds[segmentIndex] ?? route.nodeIds[0];
  const segmentToId =
    route.nodeIds[segmentIndex + 1] ?? route.nodeIds.at(-1) ?? segmentFromId;
  const segmentFrom = MAP_NODE_LOOKUP[segmentFromId];
  const segmentTo = MAP_NODE_LOOKUP[segmentToId];
  const segmentLocalProgress = Math.max(
    0,
    Math.min(1, segmentProgress - segmentIndex),
  );
  const horizontalDelta = segmentTo.x - segmentFrom.x;
  const turnValue =
    Math.abs(horizontalDelta) < 55 ? 0 : horizontalDelta < 0 ? -1 : 1;
  const turnClass =
    turnValue < 0 ? "turn-left" : turnValue > 0 ? "turn-right" : "turn-straight";
  const turnLabel =
    turnValue < 0 ? "前方左轉" : turnValue > 0 ? "前方右轉" : "保持直行";
  const nodeSceneKind = getRouteNodeSceneKind(segmentToId);
  const nodeSceneDescription = ROUTE_NODE_SCENE_DESCRIPTIONS[nodeSceneKind];
  const arrivalVisible = segmentLocalProgress >= 0.64;
  const turningNow = turnValue !== 0 && segmentLocalProgress >= 0.56;
  const routePressure = Math.min(
    1,
    Math.max(0, (route.durationMs - 7600) / 6900),
  );
  const monsterPressure = Math.min(
    1,
    progress * (0.66 + routePressure * 0.48),
  );
  const monsterDistance = Math.max(
    3,
    Math.round(23 - progress * (12 + routePressure * 8)),
  );
  const chaseState = monsterDistance <= 7 ? "close" : "tracking";
  const currentNodeNumber = Math.min(segmentIndex + 2, route.nodeIds.length);

  const stageStyle = {
    "--progress": progress,
    "--monster-pressure": monsterPressure,
    "--route-turn": turnValue,
    "--segment-progress": segmentLocalProgress,
    "--corridor-vignette": tuning.vignette,
  } as CSSProperties;

  return (
    <div className="running-layout">
      <div className="run-meta">
        <div>
          <p className="kicker">{route.label}</p>
          <h2>{route.name}</h2>
          <small className="run-route-note">
            完全依照你畫出的 {route.nodeIds.length} 個節點執行
          </small>
        </div>
        <div className="memory-slots" aria-label="已記住提示">
          {[0, 1].map((slot) => (
            <div
              className={slot < seenClueIds.length ? "filled" : ""}
              key={slot}
            >
              <span>{slot < seenClueIds.length ? "✓" : "?"}</span>
              記憶 {slot + 1}
            </div>
          ))}
        </div>
      </div>

      <div
        className={`chase-stage runner-3d-stage ${turnClass} chase-${chaseState} ${
          lookBack ? "lookback-active" : ""
        } ${paused ? "is-paused" : ""} ${turningNow ? "turning-now" : ""}`}
        style={stageStyle}
        aria-label={`${lookBack ? "回頭查看追兵" : "第三人稱追逐演出"}，目前由${segmentFrom.label}前往${segmentTo.label}，怪物距離約${monsterDistance}公尺`}
      >
        <RunnerScene3D
          progress={progress}
          turn={turnValue}
          monsterPressure={monsterPressure}
          monsterDistance={monsterDistance}
          lookBack={lookBack}
          segmentProgress={segmentLocalProgress}
          nodeSceneKind={nodeSceneKind}
          nodeLabel={segmentTo.label}
          clueActive={Boolean(activeClue)}
          clueKind={activeClue?.id ?? null}
          clueText={activeClue?.value ?? ""}
          tuning={tuning}
          paused={paused}
        />

        <button
          type="button"
          className={`run-pause-button ${paused ? "paused" : ""}`}
          onClick={onPauseToggle}
          aria-pressed={paused}
          aria-label={paused ? "繼續奔跑" : "暫停奔跑"}
        >
          <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
          <b>{paused ? "繼續奔跑" : "暫停"}</b>
          <small>P</small>
        </button>

        <button
          type="button"
          className={`look-back-button ${lookBack ? "active" : ""}`}
          onPointerDown={beginLookBack}
          onPointerUp={endLookBack}
          onPointerCancel={endLookBack}
          onLostPointerCapture={endLookBack}
          aria-pressed={lookBack}
          aria-label="按住回頭查看怪物"
        >
          <span aria-hidden="true">👁</span>
          <b>{lookBack ? "正在回頭" : "按住回頭"}</b>
          <small>B</small>
        </button>

        <details
          className="scene-tuning-panel"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <summary>
            <span>☼</span>
            <b>畫面參數</b>
            <small>即時調整</small>
          </summary>
          <div className="scene-tuning-body">
            <div className="scene-tuning-heading">
              <p>
                <b>地下通道調校</b>
                <small>設定會自動保存在這台裝置</small>
              </p>
              <button type="button" onClick={onResetTuning}>
                恢復預設
              </button>
            </div>
            <div className="scene-tuning-controls">
              {SCENE_TUNING_CONTROLS.map((control) => (
                <label key={control.key}>
                  <span>
                    <b>{control.label}</b>
                    <output>
                      {formatTuningValue(control.key, tuning[control.key])}
                    </output>
                  </span>
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={tuning[control.key]}
                    aria-label={control.label}
                    onChange={(event) =>
                      onTuningChange({
                        ...tuning,
                        [control.key]: Number(event.currentTarget.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </details>

        {paused && (
          <div className="run-paused-overlay" role="status">
            <span>PAUSED</span>
            <b>奔跑已暫停</b>
            <small>現在可以安心調整右上角的畫面參數</small>
          </div>
        )}

        <div
          className={`look-back-status ${lookBack ? "visible" : ""}`}
          role="status"
        >
          <span>LOOKING BACK</span>
          <b>怪物距離 {monsterDistance}m</b>
          <small>放開 B 或按鈕回到奔跑視角</small>
        </div>

        <div className="chase-cinematic-label" aria-hidden="true">
          <span>
            {lookBack
              ? "回頭確認"
              : arrivalVisible
                ? "節點接近"
                : "路線執行中"}
          </span>
          <b>
            {lookBack
              ? "牠還在後面"
              : chaseState === "close"
                ? "不要回頭"
                : arrivalVisible
                  ? segmentTo.label
                  : turnLabel}
          </b>
        </div>

        <div
          className={`node-arrival-card node-kind-${nodeSceneKind} ${
            arrivalVisible && !lookBack ? "visible" : ""
          }`}
          aria-live="polite"
        >
          <span>ROUTE NODE · {currentNodeNumber}</span>
          <b>{segmentTo.label}</b>
          <small>{nodeSceneDescription}</small>
        </div>

        {activeClue && (
          <button
            type="button"
            className={`clue-target clue-wall-${activeClue.id}`}
            onClick={onFocus}
            aria-label={`聚焦${activeClue.eyebrow}`}
          >
            <span className="clue-rings" />
            <b>{activeClue.icon}</b>
            <small>讀取牆面</small>
          </button>
        )}

        {focusedClue && (
          <div className="focused-clue" role="status">
            <span>{focusedClue.eyebrow}</span>
            <strong>{focusedClue.value}</strong>
            <small>記住，不會自動保存完整答案</small>
          </div>
        )}

        <div className={`chase-distance-hud ${monsterDistance <= 7 ? "danger" : ""}`}>
          <span>追擊距離</span>
          <b>{monsterDistance}m</b>
          <i>
            <em style={{ width: `${Math.max(7, (1 - monsterPressure) * 100)}%` }} />
          </i>
        </div>

        <div className="route-camera-hud">
          <span>
            路段 {currentNodeNumber}/{route.nodeIds.length}
          </span>
          <b>{segmentTo.label}</b>
          <small>{turnLabel}</small>
        </div>

        <div className="run-progress">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="run-distance">
          <span>起點</span>
          <b>
            {Math.max(0, Math.round((1 - progress) * route.distanceMeters))}m
          </b>
          <span>逃生門</span>
        </div>
      </div>

      <div className="run-tip">
        <span className={activeClue ? "alert" : ""}>
          {activeClue ? "!" : "◎"}
        </span>
        <p>
          {activeClue
            ? "點擊畫面中的提示，或按 Space 聚焦。"
            : "右上角後視鏡會持續顯示威脅；按住 B 或眼睛按鈕可回頭看清怪物。"}
        </p>
      </div>
    </div>
  );
}

function DoorScreen({
  lockStep,
  turns,
  knocks,
  seenClueIds,
  mistakes,
  lastStruggle,
  failureMessage,
  onRotate,
  onKnock,
  onConfirmKnocks,
}: {
  lockStep: LockStep;
  turns: number;
  knocks: number;
  seenClueIds: ClueId[];
  mistakes: number;
  lastStruggle: boolean;
  failureMessage: string;
  onRotate: (direction: "left" | "right") => void;
  onKnock: () => void;
  onConfirmKnocks: () => void;
}) {
  return (
    <div className={`door-layout ${lastStruggle ? "last-struggle" : ""}`}>
      <section className="door-scene">
        <div className="door-wall">
          <span className="wall-label">B1 · EXIT 04</span>
          <div className="door-object">
            <span className="door-warning">EMERGENCY EXIT</span>
            <span className="door-handle" />
            <span className="door-keyhole">◆</span>
            <span className="door-scratches" />
          </div>
          <div className="killer-at-door">
            <span className="killer-head" />
            <span className="killer-body" />
            <i />
          </div>
        </div>
        <div className="door-scene-caption">
          <span className="key-status">◆ 鑰匙已插入</span>
          <p>
            {lastStruggle
              ? "最後掙扎：殺手已經抓住門邊！"
              : "你能聽見走廊另一頭的腳步聲。"}
          </p>
        </div>
      </section>

      <section className="puzzle-panel">
        <div className="puzzle-header">
          <div>
            <p className="kicker">門鎖操作</p>
            <h2>{lockStep === "rotation" ? "第一段 · 旋轉鎖" : "第二段 · 敲擊鎖"}</h2>
          </div>
          <span className="mistake-count">錯誤 {mistakes}</span>
        </div>

        <div className="memory-recall">
          <span>你的記憶</span>
          <div>
            <b className={seenClueIds.includes("turn") ? "known" : ""}>
              {seenClueIds.includes("turn") ? "↻ × 2" : "旋轉：??"}
            </b>
            <b className={seenClueIds.includes("knock") ? "known" : ""}>
              {seenClueIds.includes("knock") ? "✦ × 3" : "敲擊：??"}
            </b>
          </div>
        </div>

        {lockStep === "rotation" ? (
          <div className="rotation-puzzle">
            <div className="dial-wrap">
              <div
                className="dial"
                style={{ transform: `rotate(${turns * 360}deg)` }}
              >
                <span className="dial-marker" />
                <span className="dial-core">◆</span>
                {Array.from({ length: 12 }, (_, index) => (
                  <i
                    key={index}
                    style={{ transform: `rotate(${index * 30}deg)` }}
                  />
                ))}
              </div>
              <div className="turn-counter">
                <b>{turns}</b>
                <span>完整圈</span>
              </div>
            </div>
            <div className="rotation-controls">
              <button type="button" onClick={() => onRotate("left")}>
                <span>↶</span>
                向左一圈
              </button>
              <button
                type="button"
                className="recommended"
                onClick={() => onRotate("right")}
              >
                <span>↷</span>
                向右一圈
              </button>
            </div>
          </div>
        ) : (
          <div className="knock-puzzle">
            <button
              type="button"
              className="knock-surface"
              onClick={onKnock}
              aria-label="敲擊門板"
            >
              <span className="knock-mark">✦</span>
              <b>點擊敲門</b>
              <small>第 4 下後會重新計數</small>
            </button>
            <div className="knock-count" aria-label={`已敲擊 ${knocks} 次`}>
              {[1, 2, 3, 4].map((index) => (
                <span key={index} className={index <= knocks ? "hit" : ""} />
              ))}
            </div>
            <button
              type="button"
              className="confirm-button"
              onClick={onConfirmKnocks}
            >
              確認敲擊次數
            </button>
          </div>
        )}

        {failureMessage && mistakes > 0 && (
          <p className="inline-error">{failureMessage}</p>
        )}
      </section>
    </div>
  );
}

function ClosingScreen({
  step,
  lastStruggle,
  onClose,
  onLock,
}: {
  step: ClosingStep;
  lastStruggle: boolean;
  onClose: () => void;
  onLock: () => void;
}) {
  return (
    <div className={`closing-layout ${step === "lock" ? "door-closed" : ""}`}>
      <div className="escape-perspective">
        <div className="safe-room">
          <span className="safe-light" />
          <p>SAFE SIDE</p>
        </div>
        <div className="closing-door">
          <span className="inside-bar" />
          <span className="inside-lock">◆</span>
          <div className="killer-hand">
            <i /><i /><i /><i />
          </div>
        </div>
        {lastStruggle && <span className="impact-word">砰！</span>}
      </div>

      <div className="closing-action">
        <p className="kicker">逃生程序尚未完成</p>
        <h2>{step === "close" ? "把門拉上！" : "扣上內側門栓！"}</h2>
        <p>
          {step === "close"
            ? "開門不等於成功。殺手仍能從門縫把門拉回去。"
            : "門已經關閉，但鎖舌還沒固定。這是最後一步。"}
        </p>
        {step === "close" ? (
          <button type="button" className="panic-button" onClick={onClose}>
            <span>⇥</span>
            用力關門
          </button>
        ) : (
          <button type="button" className="panic-button lock" onClick={onLock}>
            <span>↻</span>
            旋轉門栓
          </button>
        )}
      </div>
    </div>
  );
}

function ResultScreen({
  success,
  route,
  timeLeft,
  seenClueIds,
  missedClueIds,
  mistakes,
  failureReason,
  onRetry,
}: {
  success: boolean;
  route: RouteConfig;
  timeLeft: number;
  seenClueIds: ClueId[];
  missedClueIds: ClueId[];
  mistakes: number;
  failureReason: string;
  onRetry: () => void;
}) {
  const missedLabels = missedClueIds.map((id) => CLUES[id].value);
  return (
    <div className={`result-layout ${success ? "success" : "failure"}`}>
      <section className="result-hero">
        <div className="result-symbol">{success ? "✓" : "×"}</div>
        <p className="kicker">RUN RESULT · P1-FIXED-001</p>
        <h2>{success ? "門栓在最後一刻扣上" : "殺手拉開了逃生門"}</h2>
        <p>
          {success
            ? `你親手畫出的「${route.name}」成功了，並在倒數結束前完成整套逃生程序。`
            : failureReason || "你沒有在殺手抵達前完成逃生程序。"}
        </p>
        <button type="button" className="primary-button" onClick={onRetry}>
          <span>重新規劃下一局</span>
          <i>R</i>
        </button>
      </section>

      <section className="result-report">
        <div className="report-title">
          <div>
            <p className="kicker">本局分析</p>
            <h3>計畫執行紀錄</h3>
          </div>
          <span className={success ? "report-pass" : "report-fail"}>
            {success ? "ESCAPED" : "CAUGHT"}
          </span>
        </div>

        <div className="stat-grid">
          <div>
            <span>手繪路線</span>
            <b>{route.name}</b>
          </div>
          <div>
            <span>剩餘時間</span>
            <b>{success ? `${formatSeconds(timeLeft)} 秒` : "0.0 秒"}</b>
          </div>
          <div>
            <span>記住提示</span>
            <b>{seenClueIds.length} / 2</b>
          </div>
          <div>
            <span>操作錯誤</span>
            <b>{mistakes} 次</b>
          </div>
        </div>

        <div className="answer-review">
          <span>正確開鎖順序</span>
          <div>
            <b>01　右轉兩圈</b>
            <i>→</i>
            <b>02　敲擊三次</b>
            <i>→</i>
            <b>03　關門上鎖</b>
          </div>
        </div>

        {!success && (
          <div className="failure-diagnosis">
            <span>主要失敗原因</span>
            <strong>{failureReason}</strong>
            {missedLabels.length > 0 && (
              <small>途中漏看的提示：{missedLabels.join("、")}</small>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
