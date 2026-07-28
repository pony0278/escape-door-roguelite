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
  { id: "start", x: 420, y: 352, label: "玩家起點", shortLabel: "你", type: "start" },
  { id: "northEntry", x: 205, y: 292, label: "西側岔路", shortLabel: "A", type: "normal" },
  { id: "middleEntry", x: 420, y: 274, label: "中央走廊", shortLabel: "B", type: "normal" },
  { id: "southEntry", x: 632, y: 300, label: "東側岔路", shortLabel: "C", type: "normal" },
  { id: "turnClue", x: 128, y: 168, label: "可疑機械室", shortLabel: "?", type: "clue", clueId: "turn" },
  { id: "middleHub", x: 410, y: 194, label: "中央機房", shortLabel: "D", type: "normal" },
  { id: "southStore", x: 700, y: 205, label: "廢棄倉庫", shortLabel: "E", type: "normal" },
  { id: "key", x: 325, y: 102, label: "銅鑰匙", shortLabel: "◆", type: "key" },
  { id: "northExit", x: 485, y: 68, label: "北側長廊", shortLabel: "F", type: "normal" },
  { id: "middleExit", x: 612, y: 105, label: "直通走廊", shortLabel: "G", type: "normal" },
  { id: "knockClue", x: 700, y: 146, label: "可疑維修區", shortLabel: "?", type: "clue", clueId: "knock" },
  { id: "exit", x: 782, y: 68, label: "逃生門", shortLabel: "門", type: "exit" },
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
            <p>PHASE P2.2</p>
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
        <span>筆記本一筆畫逃亡路線</span>
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
    "筆尖必須從藍色 START 開始",
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const activePointerRef = useRef<number | null>(null);
  const lastNodeId = plannedNodeIds.at(-1) ?? "start";
  const lastNode = MAP_NODE_LOOKUP[lastNodeId];
  const routePoints = plannedNodeIds
    .map((id) => `${MAP_NODE_LOOKUP[id].x},${MAP_NODE_LOOKUP[id].y}`)
    .join(" ");
  const safeRoute = hasKey && reachedExit;
  const finalLocation = MAP_NODE_LOOKUP[lastNodeId].label;

  const pointFromPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const bounds = stage.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 840,
      y: ((event.clientY - bounds.top) / bounds.height) * 390,
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
    return candidates[0]?.distance <= 42 ? candidates[0].node : null;
  };

  const beginStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointFromPointer(event);
    if (!point) return;
    const start = MAP_NODE_LOOKUP.start;
    const startsOnMarker =
      Math.hypot(point.x - start.x, point.y - start.y) <= 52;

    if (!startsOnMarker) {
      setStrokeMessage("請把筆尖移到 START，再按住開始");
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerRef.current = event.pointerId;
    onBeginStroke();
    setIsDrawing(true);
    setCursorPoint(point);
    setStrokeMessage("不要放開，拖過相鄰的紅色節點");
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
    setStrokeMessage("已停筆；可以直接開始逃亡，或從 START 重新畫");
  };

  return (
    <div className="planning-layout">
      <section className="map-panel">
        <div className="panel-heading">
          <div>
            <p className="kicker">倖存者筆記 · B1 地下層</p>
            <h2>按住 START，一筆畫出逃亡路線</h2>
          </div>
          <div className="map-legend">
            <span><i className="legend-start" /> START</span>
            <span><i className="legend-key" /> 鑰匙</span>
            <span><i className="legend-exit" /> 門</span>
            <span><i className="legend-clue" /> 牆面提示</span>
          </div>
        </div>

        <div
          ref={stageRef}
          className={`map-stage drawing-map notebook-map ${
            isDrawing ? "is-drawing" : ""
          }`}
          onPointerDown={beginStroke}
          onPointerMove={moveStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          role="application"
          aria-label="方格筆記本逃亡地圖。從 START 按住並拖過相鄰節點，放開完成一筆路線。"
          tabIndex={0}
        >
          <div className="map-grid" aria-hidden="true" />
          <div className="notebook-scribbles" aria-hidden="true">
            <span>別停下</span>
            <span>有聲音？</span>
            <span>門在這邊 →</span>
          </div>
          <svg
            className="route-map"
            viewBox="0 0 840 390"
            preserveAspectRatio="none"
            role="img"
            aria-label="潦草畫在方格紙上的地下層道路網"
          >
            <defs>
              <filter id="pencil-wobble" x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.018"
                  numOctaves="2"
                  seed="7"
                  result="noise"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="noise"
                  scale="3.2"
                />
              </filter>
            </defs>
            <g filter="url(#pencil-wobble)">
              {MAP_EDGES.map(([fromId, toId]) => {
                const from = MAP_NODE_LOOKUP[fromId];
                const to = MAP_NODE_LOOKUP[toId];
                return (
                  <line
                    key={`${fromId}-${toId}`}
                    className="map-corridor"
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                  />
                );
              })}
            </g>
            {plannedNodeIds.length > 1 && (
              <>
                <polyline className="drawn-route-shadow" points={routePoints} />
                <polyline className="drawn-route" points={routePoints} />
              </>
            )}
            {isDrawing && cursorPoint && (
              <line
                className="drawn-route-live"
                x1={lastNode.x}
                y1={lastNode.y}
                x2={cursorPoint.x}
                y2={cursorPoint.y}
              />
            )}
          </svg>

          {MAP_NODES.map((node) => {
            const selectedIndex = plannedNodeIds.indexOf(node.id);
            const isSelected = selectedIndex >= 0;
            const isCurrent = node.id === lastNodeId;
            const canConnect =
              node.id !== lastNodeId && areConnected(lastNodeId, node.id);
            return (
              <div
                key={node.id}
                className={`map-point point-${node.type} ${
                  isSelected ? "selected" : ""
                } ${isCurrent ? "current" : ""} ${
                  canConnect ? "available" : ""
                }`}
                style={{
                  left: `${(node.x / 840) * 100}%`,
                  top: `${(node.y / 390) * 100}%`,
                }}
                aria-label={`${node.label}${
                  isSelected ? `，路線第 ${selectedIndex + 1} 站` : ""
                }`}
                role="img"
              >
                <span>{node.id === "start" ? "START" : node.shortLabel}</span>
                <small>{node.label}</small>
              </div>
            );
          })}

          {plannedNodeIds.length === 1 && (
            <div className="draw-hint">
              <span>✎</span>
              <b>按住藍色 START</b>
              <small>不要放開，拖過相鄰的紅點</small>
            </div>
          )}

          <div className="map-callout key-callout">
            <span>可選</span>
            銅鑰匙
          </div>
          <div className="map-callout killer-callout">
            <span>威脅</span>
            殺手從西側逼近
          </div>
          <div className={`stroke-status ${isDrawing ? "active" : ""}`}>
            <span>{isDrawing ? "●" : "○"}</span>
            {routeError || strokeMessage}
          </div>
        </div>
      </section>

      <aside className="route-panel">
        <div className="route-heading">
          <p className="kicker">筆記本上的逃亡計畫</p>
          <span>{Math.max(0, plannedNodeIds.length - 1)} 段筆跡</span>
        </div>

        <div className="drawing-instructions">
          <div className={`instruction-step ${isReady ? "done" : "active"}`}>
            <span>{isReady ? "✓" : "1"}</span>
            <p><b>一筆畫出路線</b><small>必須從 START 按住開始</small></p>
          </div>
          <div className={`instruction-step optional ${hasKey ? "done" : ""}`}>
            <span>{hasKey ? "✓" : "?"}</span>
            <p><b>是否取得鑰匙</b><small>可以略過，但門會打不開</small></p>
          </div>
          <div className={`instruction-step optional ${reachedExit ? "done" : ""}`}>
            <span>{reachedExit ? "✓" : "?"}</span>
            <p><b>是否抵達逃生門</b><small>何時停筆完全由你決定</small></p>
          </div>
        </div>

        <div className="route-sequence" aria-label="目前畫出的路線">
          <span>筆跡經過順序</span>
          <div>
            {plannedNodeIds.map((id, index) => (
              <span className="sequence-node" key={`${id}-${index}`}>
                <b>{index + 1}</b>
                {MAP_NODE_LOOKUP[id].shortLabel}
              </span>
            ))}
          </div>
        </div>

        <div className="route-edit-actions single">
          <button
            type="button"
            onClick={onClear}
            disabled={plannedNodeIds.length <= 1}
          >
            ↶ 清除，從 START 重新畫
          </button>
        </div>

        <div className="route-summary">
          <div>
            <span>預估距離</span>
            <b>{route.distanceMeters} m</b>
          </div>
          <div>
            <span>經過可疑點</span>
            <b>{route.events.length} / 2</b>
          </div>
          <div>
            <span>預估奔跑</span>
            <b>{(route.durationMs / 1000).toFixed(1)} 秒</b>
          </div>
        </div>

        <div
          className={`route-validation ${safeRoute ? "valid" : ""} ${
            isReady && !safeRoute ? "risk" : ""
          }`}
        >
          <span>{safeRoute ? "✓" : isReady ? "!" : "✎"}</span>
          <p>
            <b>
              {!isReady
                ? "還沒有設定路線"
                : safeRoute
                  ? "這條線有機會逃出去"
                  : "可以出發，但計畫有風險"}
            </b>
            <small>
              {routeError ||
                (!isReady
                  ? "從 START 按住，至少拖到一個相鄰節點。"
                  : reachedExit && !hasKey
                    ? "路線抵達門口，但沒有經過鑰匙。"
                    : !reachedExit && hasKey
                      ? `拿到了鑰匙，但筆跡停在「${finalLocation}」。`
                      : !reachedExit
                        ? `筆跡停在「${finalLocation}」，沒有抵達逃生門。`
                        : "角色會完全按照你畫出的順序奔跑。")}
            </small>
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={onStart}
          disabled={!isReady}
        >
          <span>按照這條線開始逃亡</span>
          <i>{isReady ? "隨時開始 · Enter ↵" : "先畫一段"}</i>
        </button>
      </aside>
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
  const verticalDelta = segmentTo.y - segmentFrom.y;
  const turnValue =
    Math.abs(verticalDelta) < 36 ? 0 : verticalDelta < 0 ? -1 : 1;
  const turnClass =
    turnValue < 0 ? "turn-left" : turnValue > 0 ? "turn-right" : "turn-straight";
  const turnLabel =
    turnValue < 0 ? "前方左轉" : turnValue > 0 ? "前方右轉" : "保持直行";
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
  const chaseState =
    progress < 0.11
      ? "lookback"
      : monsterDistance <= 7
        ? "close"
        : "tracking";
  const currentNodeNumber = Math.min(segmentIndex + 2, route.nodeIds.length);

  const stageStyle = {
    "--progress": progress,
    "--monster-pressure": monsterPressure,
    "--route-turn": turnValue,
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
          paused ? "is-paused" : ""
        }`}
        style={stageStyle}
        aria-label={`第三人稱追逐演出，目前由${segmentFrom.label}前往${segmentTo.label}，怪物距離約${monsterDistance}公尺`}
      >
        <RunnerScene3D
          progress={progress}
          turn={turnValue}
          monsterPressure={monsterPressure}
          monsterDistance={monsterDistance}
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

        <div className="chase-cinematic-label" aria-hidden="true">
          <span>{chaseState === "lookback" ? "回頭確認" : "路線執行中"}</span>
          <b>
            {chaseState === "lookback"
              ? "牠追上來了"
              : chaseState === "close"
                ? "不要回頭"
                : turnLabel}
          </b>
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
            : "提示藏在環境中；成功聚焦後，內容只會短暫停留。"}
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
