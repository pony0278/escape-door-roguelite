"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type TurnDirection = -1 | 0 | 1;
type ClueKind = "turn" | "knock" | null;
type ObservationDirection = "forward" | "left" | "right";
type RunIncidentKind = "blackout" | "steam" | "collapse" | null;
type RunIncidentPhase = "warning" | "active" | "cleared" | null;

export interface SceneTuning {
  exposure: number;
  concrete: number;
  ambient: number;
  flashlight: number;
  ceiling: number;
  fog: number;
  vignette: number;
}

export type RouteNodeSceneKind =
  | "junction"
  | "corridor"
  | "machine"
  | "warehouse"
  | "key"
  | "clue-turn"
  | "clue-knock"
  | "exit";

export const DEFAULT_SCENE_TUNING: SceneTuning = {
  exposure: 1.8,
  concrete: 1.55,
  ambient: 1.02,
  flashlight: 27.5,
  ceiling: 4,
  fog: 0.028,
  vignette: 0.48,
};

interface RunnerScene3DProps {
  progress: number;
  turn: TurnDirection;
  turnAngle: number;
  monsterPressure: number;
  monsterDistance: number;
  lookBack: boolean;
  observationDirection: ObservationDirection;
  segmentProgress: number;
  nodeSceneKind: RouteNodeSceneKind;
  nodeLabel: string;
  clueActive: boolean;
  clueKind: ClueKind;
  clueText: string;
  incidentKind: RunIncidentKind;
  incidentPhase: RunIncidentPhase;
  incidentProgress: number;
  tuning: SceneTuning;
  paused: boolean;
}

const CHUNK_LENGTH = 18;
const CHUNK_COUNT = 7;
const RUN_SPEED = 12.5;
const CORRIDOR_HALF_WIDTH = 6.1;
const TURN_RUN_LENGTH = 52;
const TURN_PATH_START = 32;
const TURN_RADIUS = 10.5;
const TURN_OUTER_RADIUS = TURN_RADIUS + CORRIDOR_HALF_WIDTH;
const TURN_INNER_RADIUS = TURN_RADIUS - CORRIDOR_HALF_WIDTH;
const TURN_MAX_WALL_SEGMENTS = 16;
const TURN_CAMERA_LOOKAHEAD = 0.07;
const TURN_FORWARD_CLEARANCE = 13;
const TURN_NODE_LEAD = TURN_PATH_START - TURN_RADIUS + 8;
const CAMERA_TRAIL_DISTANCE = 8.6;
const CAMERA_MIN_DISTANCE = 1.8;

function makeConcreteTexture(
  renderer: THREE.WebGLRenderer,
  tone: "wall" | "floor" | "tile",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const base =
    tone === "wall" ? "#969993" : tone === "floor" ? "#676c68" : "#858a87";
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const seed = tone === "wall" ? 37 : tone === "floor" ? 83 : 131;
  for (let index = 0; index < 3200; index += 1) {
    const x = (index * 73 + seed * 19) % canvas.width;
    const y = (index * 151 + seed * 29) % canvas.height;
    const light = ((index * 17 + seed) % 100) / 100;
    context.fillStyle =
      light > 0.66
        ? `rgba(235, 234, 220, ${0.018 + light * 0.025})`
        : `rgba(14, 18, 16, ${0.012 + (1 - light) * 0.026})`;
    const radius = 0.5 + ((index * 23) % 19) / 7;
    context.fillRect(x, y, radius, radius);
  }

  const stains = tone === "wall" ? 24 : 14;
  for (let index = 0; index < stains; index += 1) {
    const x = (index * 97 + seed * 11) % canvas.width;
    const y = (index * 43 + seed * 31) % canvas.height;
    const gradient = context.createRadialGradient(x, y, 1, x, y, 28 + (index % 5) * 9);
    gradient.addColorStop(0, "rgba(23, 31, 27, 0.13)");
    gradient.addColorStop(1, "rgba(13, 22, 19, 0)");
    context.fillStyle = gradient;
    context.fillRect(x - 80, y - 80, 160, 160);
  }

  context.strokeStyle = "rgba(20, 24, 22, 0.19)";
  context.lineWidth = tone === "tile" ? 4 : 1.4;
  if (tone === "tile") {
    for (let position = 0; position <= 512; position += 128) {
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, 512);
      context.stroke();
      context.beginPath();
      context.moveTo(0, position);
      context.lineTo(512, position);
      context.stroke();
    }
  } else {
    for (let index = 0; index < 11; index += 1) {
      const startX = (index * 91 + seed * 7) % 512;
      const startY = (index * 57 + seed * 17) % 512;
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(startX + 8, startY + 17);
      context.lineTo(startX - 5, startY + 31);
      context.lineTo(startX + 13, startY + 49);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(tone === "floor" ? 3 : 2, tone === "floor" ? 8 : 4);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

function makeWallClueTexture(text: string, kind: Exclude<ClueKind, null>) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, canvas.width, canvas.height);
  const accent = kind === "turn" ? "#e8e0c1" : "#c34c43";
  context.strokeStyle = accent;
  context.fillStyle = accent;
  context.lineCap = "round";
  context.lineJoin = "round";

  context.globalAlpha = 0.24;
  for (let index = 0; index < 16; index += 1) {
    context.lineWidth = 2 + (index % 4);
    context.beginPath();
    context.moveTo(95 + index * 48, 386 + ((index * 29) % 38));
    context.lineTo(160 + index * 46, 368 + ((index * 17) % 64));
    context.stroke();
  }

  context.globalAlpha = 0.92;
  context.font = "900 118px 'Noto Sans TC', 'PingFang TC', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "rgba(0, 0, 0, 0.8)";
  context.shadowBlur = 5;
  context.fillText(text || (kind === "turn" ? "右轉 × 2" : "敲門 × 3"), 526, 245);

  context.shadowBlur = 0;
  context.font = "700 34px ui-monospace, monospace";
  context.textAlign = "left";
  context.fillText(kind === "turn" ? "LOCK / TURN" : "DOOR / KNOCK", 126, 105);

  context.lineWidth = 18;
  context.beginPath();
  if (kind === "turn") {
    context.arc(875, 125, 52, 0.45, Math.PI * 1.85);
    context.lineTo(839, 82);
    context.moveTo(875, 177);
    context.lineTo(906, 151);
  } else {
    for (let index = 0; index < 3; index += 1) {
      context.moveTo(840 + index * 44, 75);
      context.lineTo(825 + index * 44, 155);
    }
  }
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeNodeLabelTexture(label: string, kind: RouteNodeSceneKind) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const accent =
    kind === "exit"
      ? "#c9dd8b"
      : kind === "key"
        ? "#d6b65f"
        : kind.startsWith("clue")
          ? "#c85b50"
          : "#b8b39a";
  const code =
    kind === "machine" || kind === "clue-turn"
      ? "MACHINE / B1"
      : kind === "warehouse"
        ? "STORAGE / B1"
        : kind === "key"
          ? "KEY CACHE"
          : kind === "clue-knock"
            ? "MAINTENANCE"
            : kind === "exit"
              ? "ESCAPE ROUTE"
              : kind === "junction"
                ? "JUNCTION"
                : "PASSAGE";

  context.fillStyle = "rgba(20, 24, 22, 0.94)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = accent;
  context.lineWidth = 12;
  context.strokeRect(13, 13, canvas.width - 26, canvas.height - 26);

  context.fillStyle = accent;
  context.font = "800 34px ui-monospace, monospace";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(code, 58, 58);

  context.fillStyle = "#eee9d9";
  context.font = "900 92px 'Noto Sans TC', 'PingFang TC', sans-serif";
  context.fillText(label, 58, 158);

  context.globalAlpha = 0.48;
  context.fillStyle = accent;
  for (let index = 0; index < 6; index += 1) {
    context.fillRect(744 + index * 36, 48, 18, 158);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export default function RunnerScene3D({
  progress,
  turn,
  turnAngle,
  monsterPressure,
  monsterDistance,
  lookBack,
  observationDirection,
  segmentProgress,
  nodeSceneKind,
  nodeLabel,
  clueActive,
  clueKind,
  clueText,
  incidentKind,
  incidentPhase,
  incidentProgress,
  tuning,
  paused,
}: RunnerScene3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneStateRef = useRef({
    progress,
    turn,
    turnAngle,
    monsterPressure,
    monsterDistance,
    lookBack,
    observationDirection,
    segmentProgress,
    nodeSceneKind,
    nodeLabel,
    clueActive,
    clueKind,
    clueText,
    incidentKind,
    incidentPhase,
    incidentProgress,
    tuning,
    paused,
  });

  useEffect(() => {
    sceneStateRef.current = {
      progress,
      turn,
      turnAngle,
      monsterPressure,
      monsterDistance,
      lookBack,
      observationDirection,
      segmentProgress,
      nodeSceneKind,
      nodeLabel,
      clueActive,
      clueKind,
      clueText,
      incidentKind,
      incidentPhase,
      incidentProgress,
      tuning,
      paused,
    };
  }, [
    clueActive,
    clueKind,
    clueText,
    incidentKind,
    incidentPhase,
    incidentProgress,
    lookBack,
    monsterDistance,
    monsterPressure,
    nodeLabel,
    nodeSceneKind,
    observationDirection,
    paused,
    progress,
    segmentProgress,
    tuning,
    turn,
    turnAngle,
  ]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      mount.dataset.renderState = "failed";
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = DEFAULT_SCENE_TUNING.exposure;
    renderer.autoClear = false;
    renderer.domElement.className = "runner-3d-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121816);
    scene.fog = new THREE.FogExp2(
      0x151b18,
      DEFAULT_SCENE_TUNING.fog,
    );

    const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 150);
    camera.position.set(0, 4.8, 9.2);
    const rearCamera = new THREE.PerspectiveCamera(64, 1, 0.08, 150);
    rearCamera.position.set(0, 3.05, 1.1);

    const ambient = new THREE.HemisphereLight(
      0xc2c9c3,
      0x232a26,
      DEFAULT_SCENE_TUNING.ambient,
    );
    scene.add(ambient);

    const flashlight = new THREE.SpotLight(
      0xffecc6,
      DEFAULT_SCENE_TUNING.flashlight,
      40,
      Math.PI / 4.7,
      0.62,
      1.35,
    );
    flashlight.position.set(0, 4.45, 6.3);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.set(1024, 1024);
    flashlight.shadow.camera.near = 0.4;
    flashlight.shadow.camera.far = 38;
    flashlight.target.position.set(0, 1.9, -12);
    scene.add(flashlight, flashlight.target);

    const coldFill = new THREE.DirectionalLight(0x789697, 0.62);
    coldFill.position.set(6, 8, -12);
    scene.add(coldFill);

    const tunnelFill = new THREE.DirectionalLight(0xb5ad91, 0.34);
    tunnelFill.position.set(-5, 4, 5);
    scene.add(tunnelFill);

    const dangerLight = new THREE.PointLight(0xb92018, 0, 9, 2);
    scene.add(dangerLight);
    const incidentLight = new THREE.PointLight(0xd38a49, 0, 18, 1.7);
    scene.add(incidentLight);

    const gradientData = new Uint8Array([22, 72, 132, 220]);
    const gradientMap = new THREE.DataTexture(
      gradientData,
      4,
      1,
      THREE.RedFormat,
    );
    gradientMap.needsUpdate = true;
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;

    const materialCache = new Map<number, THREE.MeshToonMaterial>();
    const toon = (color: number) => {
      const existing = materialCache.get(color);
      if (existing) return existing;
      const material = new THREE.MeshToonMaterial({ color, gradientMap });
      materialCache.set(color, material);
      return material;
    };

    const concreteTexture = makeConcreteTexture(renderer, "wall");
    const floorTexture = makeConcreteTexture(renderer, "floor");
    const tileTexture = makeConcreteTexture(renderer, "tile");
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xb7bab4,
      map: concreteTexture,
      roughness: 0.9,
      metalness: 0.02,
    });
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x8c918d,
      map: floorTexture,
      roughness: 0.88,
      metalness: 0.03,
    });
    const tileMaterial = new THREE.MeshStandardMaterial({
      color: 0xaeb4b1,
      map: tileTexture,
      roughness: 0.78,
      metalness: 0.04,
    });
    const ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a605c,
      roughness: 0.98,
    });
    const pipeMaterial = new THREE.MeshStandardMaterial({
      color: 0x505a56,
      roughness: 0.7,
      metalness: 0.4,
    });
    const wetMaterial = new THREE.MeshStandardMaterial({
      color: 0x161c1a,
      roughness: 0.18,
      metalness: 0.05,
      transparent: true,
      opacity: 0.58,
    });
    const wallBaseColor = new THREE.Color(0xb7bab4);
    const floorBaseColor = new THREE.Color(0x8c918d);
    const tileBaseColor = new THREE.Color(0xaeb4b1);
    const ceilingBaseColor = new THREE.Color(0x5a605c);

    const palette = {
      ink: 0x171c1c,
      cream: 0xd8d7cb,
      amber: 0x765a30,
      blue: 0x334d5b,
      warning: 0xd05242,
    };

    function addMesh(
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      parent: THREE.Object3D,
      position: [number, number, number] = [0, 0, 0],
      rotation: [number, number, number] = [0, 0, 0],
      scale: [number, number, number] = [1, 1, 1],
    ) {
      const object = new THREE.Mesh(geometry, material);
      object.position.set(...position);
      object.rotation.set(...rotation);
      object.scale.set(...scale);
      object.castShadow = true;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    }

    const world = new THREE.Group();
    scene.add(world);
    const corridorChunks: THREE.Group[] = [];
    const ceilingLights: THREE.PointLight[] = [];

    function createCorridorChunk(index: number) {
      const chunk = new THREE.Group();
      chunk.position.z = -index * CHUNK_LENGTH;

      addMesh(
        new THREE.BoxGeometry(CORRIDOR_HALF_WIDTH * 2, 0.34, CHUNK_LENGTH),
        floorMaterial,
        chunk,
        [0, -0.17, 0],
      );
      addMesh(
        new THREE.BoxGeometry(CORRIDOR_HALF_WIDTH * 2, 0.38, CHUNK_LENGTH),
        ceilingMaterial,
        chunk,
        [0, 6.12, 0],
      );

      for (const side of [-1, 1]) {
        addMesh(
          new THREE.BoxGeometry(0.5, 6.2, CHUNK_LENGTH),
          wallMaterial,
          chunk,
          [side * CORRIDOR_HALF_WIDTH, 3.03, 0],
        );
        addMesh(
          new THREE.BoxGeometry(0.035, 2.15, CHUNK_LENGTH - 0.08),
          tileMaterial,
          chunk,
          [side * (CORRIDOR_HALF_WIDTH - 0.27), 1.08, 0],
        );
        addMesh(
          new THREE.BoxGeometry(0.16, 0.16, CHUNK_LENGTH),
          pipeMaterial,
          chunk,
          [side * 5.62, 5.46, 0],
        );
      }

      for (let z = -CHUNK_LENGTH / 2; z < CHUNK_LENGTH / 2; z += 2.1) {
        addMesh(
          new THREE.BoxGeometry(CORRIDOR_HALF_WIDTH * 2 - 0.42, 0.025, 0.048),
          toon(0x222827),
          chunk,
          [0, 0.035, z],
        );
      }

      for (const z of [-6.2, 0, 6.2]) {
        addMesh(
          new THREE.BoxGeometry(2.2 + ((index + z) % 2) * 0.6, 0.018, 3.2),
          wetMaterial,
          chunk,
          [index % 2 ? -2.4 : 2.1, 0.027, z],
        );
      }

      for (const x of [-3.9, -2.95]) {
        addMesh(
          new THREE.CylinderGeometry(0.1, 0.1, CHUNK_LENGTH, 10),
          pipeMaterial,
          chunk,
          [x, 5.75, 0],
          [Math.PI / 2, 0, 0],
        );
      }

      addMesh(
        new THREE.BoxGeometry(2.65, 0.12, 0.58),
        toon(index % 3 === 1 ? 0x303735 : 0x9f9a78),
        chunk,
        [0, 5.93, -5.8],
      ).castShadow = false;

      const overhead = new THREE.PointLight(
        index % 3 === 1 ? 0x64716c : 0xc6c09d,
        index % 3 === 1
          ? DEFAULT_SCENE_TUNING.ceiling * 0.18
          : DEFAULT_SCENE_TUNING.ceiling,
        14,
        1.85,
      );
      overhead.position.set(0, 5.65, -5.8);
      chunk.add(overhead);
      ceilingLights.push(overhead);

      if (index % 2 === 0) {
        const warningStripe = new THREE.Group();
        warningStripe.position.set(
          index % 4 === 0 ? -5.79 : 5.79,
          3.5,
          5.3,
        );
        warningStripe.rotation.y = index % 4 === 0 ? Math.PI / 2 : -Math.PI / 2;
        chunk.add(warningStripe);
        for (let stripe = 0; stripe < 4; stripe += 1) {
          addMesh(
            new THREE.BoxGeometry(0.12, 0.42, 1.15),
            toon(stripe % 2 ? 0x332b27 : 0x755d32),
            warningStripe,
            [(stripe - 1.5) * 0.13, 0, 0],
            [0, 0, -0.38],
          );
        }
      }

      world.add(chunk);
      corridorChunks.push(chunk);
    }

    for (let index = 0; index < CHUNK_COUNT; index += 1) {
      createCorridorChunk(index);
    }

    const turnRig = new THREE.Group();
    turnRig.visible = false;
    scene.add(turnRig);
    const turnOutgoingRig = new THREE.Group();
    turnRig.add(turnOutgoingRig);
    const turnCameraOccluders: THREE.Mesh[] = [];

    const addTurnWall = (
      geometry: THREE.BufferGeometry,
      position: [number, number, number],
      rotation: [number, number, number] = [0, 0, 0],
      parent: THREE.Object3D = turnRig,
    ) => {
      const wall = addMesh(
        geometry,
        wallMaterial,
        parent,
        position,
        rotation,
      );
      turnCameraOccluders.push(wall);
      return wall;
    };

    const turnStraightLength = TURN_RUN_LENGTH - TURN_RADIUS;
    const turnStraightCenter = TURN_RADIUS + turnStraightLength / 2;
    for (const parent of [turnRig, turnOutgoingRig]) {
      const outgoing = parent === turnOutgoingRig;
      const centerZ = outgoing ? -turnStraightLength / 2 : turnStraightCenter;
      addMesh(
        new THREE.BoxGeometry(
          CORRIDOR_HALF_WIDTH * 2,
          0.34,
          turnStraightLength,
        ),
        floorMaterial,
        parent,
        [0, -0.17, centerZ],
      );
      addMesh(
        new THREE.BoxGeometry(
          CORRIDOR_HALF_WIDTH * 2,
          0.38,
          turnStraightLength,
        ),
        ceilingMaterial,
        parent,
        [0, 6.12, centerZ],
      );
      for (const side of [-1, 1]) {
        addTurnWall(
          new THREE.BoxGeometry(0.5, 6.2, turnStraightLength),
          [side * CORRIDOR_HALF_WIDTH, 3.03, centerZ],
          [0, 0, 0],
          parent,
        );
        addMesh(
          new THREE.BoxGeometry(0.04, 2.15, turnStraightLength - 0.2),
          tileMaterial,
          parent,
          [side * (CORRIDOR_HALF_WIDTH - 0.27), 1.08, centerZ],
        );
      }
    }

    const arcFloor = addMesh(
      new THREE.RingGeometry(
        TURN_INNER_RADIUS,
        TURN_OUTER_RADIUS,
        18,
        1,
        Math.PI / 2,
        Math.PI / 2,
      ),
      floorMaterial,
      turnRig,
      [TURN_RADIUS, -0.16, TURN_RADIUS],
      [-Math.PI / 2, 0, 0],
    );
    const arcCeiling = addMesh(
      new THREE.RingGeometry(
        TURN_INNER_RADIUS,
        TURN_OUTER_RADIUS,
        18,
        1,
        Math.PI,
        Math.PI / 2,
      ),
      ceilingMaterial,
      turnRig,
      [TURN_RADIUS, 6.11, TURN_RADIUS],
      [Math.PI / 2, 0, 0],
    );

    const turnArcWalls = Array.from(
      { length: TURN_MAX_WALL_SEGMENTS },
      () => ({
        outer: addTurnWall(new THREE.BoxGeometry(1, 6.2, 0.5), [0, 3.03, 0]),
        inner: addTurnWall(new THREE.BoxGeometry(1, 6.2, 0.5), [0, 3.03, 0]),
        outerTile: addMesh(
          new THREE.BoxGeometry(1, 2.15, 0.04),
          tileMaterial,
          turnRig,
          [0, 1.08, 0],
        ),
        innerTile: addMesh(
          new THREE.BoxGeometry(1, 2.15, 0.04),
          tileMaterial,
          turnRig,
          [0, 1.08, 0],
        ),
      }),
    );

    let renderedTurnAngle = -1;
    function updateTurnGeometry(angle: number) {
      const boundedAngle = THREE.MathUtils.clamp(
        angle,
        Math.PI / 36,
        Math.PI * 0.85,
      );
      if (Math.abs(renderedTurnAngle - boundedAngle) < 0.001) return;
      renderedTurnAngle = boundedAngle;

      const surfaceSegments = Math.max(
        8,
        Math.ceil(THREE.MathUtils.radToDeg(boundedAngle) / 6),
      );
      arcFloor.geometry.dispose();
      arcFloor.geometry = new THREE.RingGeometry(
        TURN_INNER_RADIUS,
        TURN_OUTER_RADIUS,
        surfaceSegments,
        1,
        Math.PI - boundedAngle,
        boundedAngle,
      );
      arcCeiling.geometry.dispose();
      arcCeiling.geometry = new THREE.RingGeometry(
        TURN_INNER_RADIUS,
        TURN_OUTER_RADIUS,
        surfaceSegments,
        1,
        Math.PI,
        boundedAngle,
      );

      const exitX = TURN_RADIUS * (1 - Math.cos(boundedAngle));
      const exitZ = TURN_RADIUS * (1 - Math.sin(boundedAngle));
      turnOutgoingRig.position.set(exitX, 0, exitZ);
      turnOutgoingRig.rotation.y = -boundedAngle;

      const activeSegments = Math.min(
        TURN_MAX_WALL_SEGMENTS,
        Math.max(
          2,
          Math.ceil(boundedAngle / (Math.PI / 18)),
        ),
      );
      const step = boundedAngle / activeSegments;
      turnArcWalls.forEach((segment, index) => {
        const visible = index < activeSegments;
        for (const mesh of Object.values(segment)) mesh.visible = visible;
        if (!visible) return;

        const middleAngle = Math.PI + (index + 0.5) * step;
        const rotationY = Math.PI * 1.5 - middleAngle;
        const setSegment = (
          mesh: THREE.Mesh,
          radius: number,
          overlap: number,
        ) => {
          mesh.position.set(
            TURN_RADIUS + radius * Math.cos(middleAngle),
            mesh.position.y,
            TURN_RADIUS + radius * Math.sin(middleAngle),
          );
          mesh.rotation.y = rotationY;
          mesh.scale.set(
            2 * radius * Math.sin(step / 2) + overlap,
            1,
            1,
          );
        };
        setSegment(segment.outer, TURN_OUTER_RADIUS, 0.16);
        setSegment(segment.inner, TURN_INNER_RADIUS, 0.08);
        setSegment(segment.outerTile, TURN_OUTER_RADIUS - 0.27, 0.12);
        setSegment(segment.innerTile, TURN_INNER_RADIUS + 0.27, 0.08);
      });
      mount!.dataset.turnAngle = `${Math.round(
        THREE.MathUtils.radToDeg(boundedAngle),
      )}`;
    }

    updateTurnGeometry(Math.PI / 2);

    for (const z of [16, 28, 40]) {
      addMesh(
        new THREE.BoxGeometry(2.7, 0.12, 0.62),
        toon(0xa39c78),
        turnRig,
        [0, 5.92, z],
      );
      const incomingLight = new THREE.PointLight(
        0xc6c09d,
        DEFAULT_SCENE_TUNING.ceiling,
        14,
        1.85,
      );
      incomingLight.position.set(0, 5.65, z);
      turnRig.add(incomingLight);
      ceilingLights.push(incomingLight);
    }
    for (const z of [-8, -20, -32]) {
      addMesh(
        new THREE.BoxGeometry(2.7, 0.12, 0.62),
        toon(0xa39c78),
        turnOutgoingRig,
        [0, 5.92, z],
      );
      const outgoingLight = new THREE.PointLight(
        0xc6c09d,
        DEFAULT_SCENE_TUNING.ceiling,
        14,
        1.85,
      );
      outgoingLight.position.set(0, 5.65, z);
      turnOutgoingRig.add(outgoingLight);
      ceilingLights.push(outgoingLight);
    }

    const nodeSceneRoot = new THREE.Group();
    nodeSceneRoot.visible = false;
    scene.add(nodeSceneRoot);

    const nodeFrame = new THREE.Group();
    nodeSceneRoot.add(nodeFrame);
    for (const side of [-1, 1]) {
      addMesh(
        new THREE.BoxGeometry(0.62, 5.9, 0.72),
        pipeMaterial,
        nodeFrame,
        [side * 5.15, 2.92, 0],
      );
    }
    addMesh(
      new THREE.BoxGeometry(10.9, 0.62, 0.72),
      pipeMaterial,
      nodeFrame,
      [0, 5.58, 0],
    );
    addMesh(
      new THREE.BoxGeometry(11.1, 0.26, 7.4),
      floorMaterial,
      nodeFrame,
      [0, -0.14, -3.3],
    );

    let nodeLabelTexture: THREE.CanvasTexture | null = null;
    let renderedNodeLabelKey = "";
    const nodeLabelMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const nodeLabelSign = addMesh(
      new THREE.PlaneGeometry(5.9, 1.48),
      nodeLabelMaterial,
      nodeSceneRoot,
      [0, 4.55, 0.42],
    );
    nodeLabelSign.castShadow = false;

    function updateNodeLabel(label: string, kind: RouteNodeSceneKind) {
      const key = `${kind}:${label}`;
      if (key === renderedNodeLabelKey) return;
      renderedNodeLabelKey = key;
      nodeLabelTexture?.dispose();
      nodeLabelTexture = makeNodeLabelTexture(label, kind);
      nodeLabelMaterial.map = nodeLabelTexture;
      nodeLabelMaterial.needsUpdate = true;
    }

    const nodeSceneGroups = {} as Record<RouteNodeSceneKind, THREE.Group>;
    const makeNodeScene = (kind: RouteNodeSceneKind) => {
      const group = new THREE.Group();
      group.visible = false;
      nodeSceneRoot.add(group);
      nodeSceneGroups[kind] = group;
      return group;
    };

    const corridorScene = makeNodeScene("corridor");
    for (const side of [-1, 1]) {
      addMesh(
        new THREE.BoxGeometry(0.42, 2.8, 0.42),
        toon(0x7c827d),
        corridorScene,
        [side * 2.8, 1.4, -1.7],
      );
      addMesh(
        new THREE.BoxGeometry(0.8, 0.18, 0.52),
        toon(0x9d9270),
        corridorScene,
        [side * 2.8, 2.72, -1.7],
      );
    }

    const junctionScene = makeNodeScene("junction");
    const junctionArrow = new THREE.Group();
    junctionArrow.position.set(0, 2.15, -0.25);
    junctionScene.add(junctionArrow);
    addMesh(
      new THREE.BoxGeometry(3.8, 0.42, 0.2),
      toon(0xd1c58d),
      junctionArrow,
    );
    for (const side of [-1, 1]) {
      addMesh(
        new THREE.ConeGeometry(0.62, 1.28, 4),
        toon(0xd1c58d),
        junctionArrow,
        [side * 2.25, 0, 0],
        [0, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2],
      );
    }

    const machineScene = makeNodeScene("machine");
    for (const side of [-1, 1]) {
      addMesh(
        new THREE.CylinderGeometry(1.12, 1.25, 3.4, 16),
        toon(side < 0 ? 0x596561 : 0x45534f),
        machineScene,
        [side * 3.35, 1.7, -2.2],
      );
      addMesh(
        new THREE.TorusGeometry(0.42, 0.1, 8, 18),
        toon(0xb19655),
        machineScene,
        [side * 3.35, 2.15, -1.08],
      );
    }
    const machineFan = new THREE.Group();
    machineFan.position.set(0, 2.4, -1.3);
    machineScene.add(machineFan);
    addMesh(
      new THREE.CylinderGeometry(1.28, 1.28, 0.36, 20),
      toon(0x252c2a),
      machineFan,
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
    );
    for (let blade = 0; blade < 4; blade += 1) {
      addMesh(
        new THREE.BoxGeometry(0.36, 1.48, 0.16),
        toon(0x7c8580),
        machineFan,
        [0, 0, 0.24],
        [0, 0, blade * Math.PI / 2],
      );
    }
    addMesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.48, 12),
      toon(0xc09e56),
      machineFan,
      [0, 0, 0.35],
      [Math.PI / 2, 0, 0],
    );

    const warehouseScene = makeNodeScene("warehouse");
    for (const side of [-1, 1]) {
      for (const level of [0.65, 2.05, 3.45]) {
        addMesh(
          new THREE.BoxGeometry(3.65, 0.2, 1.25),
          toon(0x5d5142),
          warehouseScene,
          [side * 3.15, level, -2.1],
        );
      }
      for (const xOffset of [-1.65, 1.65]) {
        addMesh(
          new THREE.BoxGeometry(0.18, 4.15, 0.22),
          toon(0x303735),
          warehouseScene,
          [side * 3.15 + xOffset, 2.05, -2.1],
        );
      }
    }
    for (const [x, y, z, scale] of [
      [-2.8, 1.25, -1.35, 1],
      [2.65, 1.2, -1.2, 0.9],
      [3.6, 2.55, -2.05, 0.72],
    ] as const) {
      addMesh(
        new THREE.BoxGeometry(1.3, 1.3, 1.15),
        toon(0x796047),
        warehouseScene,
        [x, y, z],
        [0, x * 0.03, 0],
        [scale, scale, scale],
      );
    }

    const keyScene = makeNodeScene("key");
    addMesh(
      new THREE.CylinderGeometry(1.45, 1.7, 0.82, 10),
      toon(0x3b413e),
      keyScene,
      [0, 0.42, -1.4],
    );
    const keyArtifact = new THREE.Group();
    keyArtifact.position.set(0, 2, -1.25);
    keyScene.add(keyArtifact);
    addMesh(
      new THREE.TorusGeometry(0.62, 0.17, 10, 24),
      toon(0xd1ad55),
      keyArtifact,
    );
    addMesh(
      new THREE.BoxGeometry(0.32, 1.85, 0.28),
      toon(0xd1ad55),
      keyArtifact,
      [0, -1.25, 0],
    );
    addMesh(
      new THREE.BoxGeometry(1, 0.28, 0.28),
      toon(0xd1ad55),
      keyArtifact,
      [0.34, -2.02, 0],
    );
    const keyLight = new THREE.PointLight(0xe2bd63, 2.2, 10, 1.7);
    keyLight.position.set(0, 2.35, -0.7);
    keyScene.add(keyLight);

    const turnClueScene = makeNodeScene("clue-turn");
    const valveWheel = new THREE.Group();
    valveWheel.position.set(0, 2.35, -1.15);
    turnClueScene.add(valveWheel);
    addMesh(
      new THREE.TorusGeometry(1.28, 0.18, 10, 30),
      toon(0x9b563f),
      valveWheel,
    );
    for (let spoke = 0; spoke < 6; spoke += 1) {
      addMesh(
        new THREE.BoxGeometry(0.16, 2.5, 0.16),
        toon(0x9b563f),
        valveWheel,
        [0, 0, 0],
        [0, 0, spoke * Math.PI / 3],
      );
    }
    for (const side of [-1, 1]) {
      addMesh(
        new THREE.CylinderGeometry(0.16, 0.16, 5, 10),
        pipeMaterial,
        turnClueScene,
        [side * 3.65, 2.5, -1.3],
      );
    }

    const knockClueScene = makeNodeScene("clue-knock");
    addMesh(
      new THREE.BoxGeometry(5.4, 4.8, 0.5),
      toon(0x343b38),
      knockClueScene,
      [0, 2.4, -1.6],
    );
    addMesh(
      new THREE.BoxGeometry(4.55, 3.95, 0.18),
      toon(0x59605b),
      knockClueScene,
      [0, 2.18, -1.28],
    );
    for (let bar = -2; bar <= 2; bar += 1) {
      addMesh(
        new THREE.BoxGeometry(0.14, 3.5, 0.12),
        toon(0x2c322f),
        knockClueScene,
        [bar * 0.78, 2.18, -1.13],
      );
    }
    const serviceLamp = new THREE.PointLight(0xb82d26, 1.8, 9, 2);
    serviceLamp.position.set(0, 4.55, -0.6);
    knockClueScene.add(serviceLamp);

    const exitScene = makeNodeScene("exit");
    addMesh(
      new THREE.BoxGeometry(6.2, 5.65, 0.65),
      toon(0x26312d),
      exitScene,
      [0, 2.82, -1.65],
    );
    addMesh(
      new THREE.BoxGeometry(4.9, 4.85, 0.32),
      toon(0x53635c),
      exitScene,
      [0, 2.45, -1.24],
    );
    addMesh(
      new THREE.BoxGeometry(1.75, 0.48, 0.22),
      toon(0xbdd47d),
      exitScene,
      [0, 5.02, -0.92],
    );
    addMesh(
      new THREE.SphereGeometry(0.18, 12, 10),
      toon(0xd1bd70),
      exitScene,
      [1.88, 2.35, -0.98],
    );
    const exitLight = new THREE.PointLight(0xbad976, 2.5, 11, 1.8);
    exitLight.position.set(0, 4.75, -0.2);
    exitScene.add(exitLight);

    const collapseObstacle = new THREE.Group();
    collapseObstacle.visible = false;
    scene.add(collapseObstacle);
    for (const [x, y, z, sx, sy, sz, rotation] of [
      [-2.2, 0.45, 0.4, 2.1, 0.9, 1.4, -0.18],
      [-0.3, 0.72, -0.1, 1.7, 1.35, 1.1, 0.24],
      [1.25, 0.38, 0.35, 1.25, 0.72, 1.45, -0.36],
      [-1.15, 1.35, 0.2, 0.85, 1.55, 0.8, 0.58],
    ] as const) {
      addMesh(
        new THREE.DodecahedronGeometry(0.72, 0),
        toon(0x555a55),
        collapseObstacle,
        [x, y, z],
        [rotation * 0.4, rotation, rotation * 0.7],
        [sx, sy, sz],
      );
    }
    addMesh(
      new THREE.BoxGeometry(4.8, 0.2, 0.2),
      toon(0xb8903f),
      collapseObstacle,
      [-0.45, 1.75, -0.15],
      [0, 0, -0.18],
    );

    const steamGeometry = new THREE.BufferGeometry();
    const steamPoints: number[] = [];
    for (let index = 0; index < 110; index += 1) {
      steamPoints.push(
        THREE.MathUtils.randFloatSpread(7.5),
        Math.random() * 4.8 + 0.35,
        THREE.MathUtils.randFloatSpread(8),
      );
    }
    steamGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(steamPoints, 3),
    );
    const steamMaterial = new THREE.PointsMaterial({
      color: 0xdbe1d9,
      size: 0.34,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const steamCloud = new THREE.Points(steamGeometry, steamMaterial);
    steamCloud.visible = false;
    scene.add(steamCloud);

    const player = new THREE.Group();
    scene.add(player);
    const bodyRoot = new THREE.Group();
    player.add(bodyRoot);

    const leftLegPivot = new THREE.Group();
    const rightLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.34, 1.08, 0);
    rightLegPivot.position.set(0.34, 1.08, 0);
    bodyRoot.add(leftLegPivot, rightLegPivot);

    addMesh(
      new THREE.CapsuleGeometry(0.22, 0.58, 6, 12),
      toon(palette.blue),
      leftLegPivot,
      [0, -0.42, 0],
    );
    addMesh(
      new THREE.CapsuleGeometry(0.22, 0.58, 6, 12),
      toon(palette.blue),
      rightLegPivot,
      [0, -0.42, 0],
    );
    addMesh(
      new THREE.BoxGeometry(0.48, 0.25, 0.72),
      toon(palette.ink),
      leftLegPivot,
      [0, -0.91, -0.12],
    );
    addMesh(
      new THREE.BoxGeometry(0.48, 0.25, 0.72),
      toon(palette.ink),
      rightLegPivot,
      [0, -0.91, -0.12],
    );

    addMesh(
      new THREE.CapsuleGeometry(0.7, 1, 8, 18),
      toon(0x596863),
      bodyRoot,
      [0, 1.65, 0],
    );

    const leftArmPivot = new THREE.Group();
    const rightArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.72, 1.92, 0);
    rightArmPivot.position.set(0.72, 1.92, 0);
    bodyRoot.add(leftArmPivot, rightArmPivot);
    addMesh(
      new THREE.CapsuleGeometry(0.2, 0.75, 6, 12),
      toon(palette.cream),
      leftArmPivot,
      [0, -0.35, 0],
    );
    addMesh(
      new THREE.CapsuleGeometry(0.2, 0.75, 6, 12),
      toon(palette.cream),
      rightArmPivot,
      [0, -0.35, 0],
    );

    addMesh(
      new THREE.BoxGeometry(1.08, 1.12, 0.44),
      toon(palette.amber),
      bodyRoot,
      [0, 1.67, 0.66],
    );
    addMesh(
      new THREE.BoxGeometry(0.74, 0.52, 0.16),
      toon(0x453322),
      bodyRoot,
      [0, 1.74, 0.96],
    );
    addMesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.5, 12),
      toon(0xb8ae85),
      bodyRoot,
      [0.42, 1.52, 1.03],
      [Math.PI / 2, 0, 0],
    );

    const headRoot = new THREE.Group();
    headRoot.position.set(0, 2.85, 0);
    bodyRoot.add(headRoot);
    addMesh(
      new THREE.SphereGeometry(0.82, 24, 18),
      toon(palette.cream),
      headRoot,
    );
    addMesh(
      new THREE.CapsuleGeometry(0.2, 0.86, 6, 12),
      toon(palette.cream),
      headRoot,
      [-0.34, 0.88, 0],
      [0, 0, -0.08],
    );
    addMesh(
      new THREE.CapsuleGeometry(0.2, 0.86, 6, 12),
      toon(palette.cream),
      headRoot,
      [0.34, 0.88, 0],
      [0, 0, 0.08],
    );
    addMesh(
      new THREE.CapsuleGeometry(0.09, 0.6, 5, 10),
      toon(0x9b666e),
      headRoot,
      [-0.34, 0.9, -0.18],
      [0, 0, -0.08],
    );
    addMesh(
      new THREE.CapsuleGeometry(0.09, 0.6, 5, 10),
      toon(0x9b666e),
      headRoot,
      [0.34, 0.9, -0.18],
      [0, 0, 0.08],
    );

    const playerShadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x010202,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.92, 32),
      playerShadowMaterial,
    );
    playerShadow.rotation.x = -Math.PI / 2;
    playerShadow.position.set(0, 0.02, 0.15);
    scene.add(playerShadow);

    const monster = new THREE.Group();
    monster.position.set(-3.05, 0, 7.1);
    monster.scale.setScalar(0.78);
    scene.add(monster);
    const monsterBody = new THREE.Group();
    monster.add(monsterBody);
    addMesh(
      new THREE.CapsuleGeometry(0.86, 1.55, 8, 16),
      toon(0x050707),
      monsterBody,
      [0, 1.48, 0],
      [0, 0, 0],
      [1.08, 1, 0.76],
    );
    addMesh(
      new THREE.SphereGeometry(0.72, 18, 14),
      toon(0x060808),
      monsterBody,
      [0, 2.84, 0],
    );
    addMesh(
      new THREE.ConeGeometry(0.24, 0.88, 5),
      toon(0x030404),
      monsterBody,
      [-0.38, 3.55, 0],
      [0, 0, -0.25],
    );
    addMesh(
      new THREE.ConeGeometry(0.24, 0.88, 5),
      toon(0x030404),
      monsterBody,
      [0.38, 3.55, 0],
      [0, 0, 0.25],
    );

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xd52b21 });
    addMesh(
      new THREE.SphereGeometry(0.095, 10, 8),
      eyeMaterial,
      monsterBody,
      [-0.23, 2.94, 0.67],
      [0, 0, 0],
      [1.45, 0.56, 0.5],
    ).castShadow = false;
    addMesh(
      new THREE.SphereGeometry(0.095, 10, 8),
      eyeMaterial,
      monsterBody,
      [0.23, 2.94, 0.67],
      [0, 0, 0],
      [1.45, 0.56, 0.5],
    ).castShadow = false;

    const leftMonsterArm = new THREE.Group();
    const rightMonsterArm = new THREE.Group();
    leftMonsterArm.position.set(-0.92, 2.05, 0);
    rightMonsterArm.position.set(0.92, 2.05, 0);
    monsterBody.add(leftMonsterArm, rightMonsterArm);
    addMesh(
      new THREE.CapsuleGeometry(0.25, 1.18, 6, 12),
      toon(0x030505),
      leftMonsterArm,
      [0, -0.5, 0],
    );
    addMesh(
      new THREE.CapsuleGeometry(0.25, 1.18, 6, 12),
      toon(0x030505),
      rightMonsterArm,
      [0, -0.5, 0],
    );

    const wallClue = new THREE.Group();
    wallClue.visible = false;
    scene.add(wallClue);
    const clueBacking = addMesh(
      new THREE.PlaneGeometry(5.25, 2.65),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
      wallClue,
    );
    clueBacking.castShadow = false;
    const clueLight = new THREE.PointLight(0xf0d9ac, 0, 9, 2);
    wallClue.add(clueLight);
    let clueTexture: THREE.CanvasTexture | null = null;
    let renderedClueKey = "";
    let clueSide = 1;

    function updateWallClue(text: string, kind: Exclude<ClueKind, null>) {
      const key = `${kind}:${text}`;
      if (key === renderedClueKey) return;
      renderedClueKey = key;
      clueTexture?.dispose();
      clueTexture = makeWallClueTexture(text, kind);
      const oldMaterial = clueBacking.material;
      clueBacking.material = new THREE.MeshBasicMaterial({
        map: clueTexture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      oldMaterial.dispose();
      clueSide = kind === "turn" ? -1 : 1;
      cluePathDistance = 14;
      clueLight.color.set(kind === "turn" ? 0xf0d9ac : 0xc03229);
      clueLight.position.set(0, 0.2, 1.8);
    }

    const dustGeometry = new THREE.BufferGeometry();
    const dustPoints: number[] = [];
    for (let index = 0; index < 150; index += 1) {
      dustPoints.push(
        THREE.MathUtils.randFloatSpread(11),
        Math.random() * 5.4 + 0.15,
        -Math.random() * 78,
      );
    }
    dustGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(dustPoints, 3),
    );
    const dustMaterial = new THREE.PointsMaterial({
      color: 0xc3c6b5,
      size: 0.035,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);

    const clock = new THREE.Clock();
    const rearLookTarget = new THREE.Vector3();
    const cameraLookTarget = new THREE.Vector3();
    const pathForward = new THREE.Vector3(0, 0, -1);
    const pathRight = new THREE.Vector3(1, 0, 0);
    const desiredCameraPosition = new THREE.Vector3();
    const resolvedCameraPosition = new THREE.Vector3();
    const cameraCollisionOrigin = new THREE.Vector3(0, 2.35, 0);
    const cameraCollisionDirection = new THREE.Vector3();
    const cameraRaycaster = new THREE.Raycaster();
    const forwardVisibilityOrigin = new THREE.Vector3(0, 2.2, 0);
    const forwardVisibilityDirection = new THREE.Vector3();
    const forwardVisibilityRaycaster = new THREE.Raycaster();
    const drawingBufferSize = new THREE.Vector2();
    let elapsed = 0;
    let cameraYaw = 0;
    let previousTurn: TurnDirection = 0;
    let previousTurnAngle = 0;
    let previousClueActive = false;
    let clueTraveling = false;
    let cluePathDistance = 14;

    const smoothStep = (from: number, to: number, value: number) => {
      const normalized = THREE.MathUtils.clamp(
        (value - from) / Math.max(0.0001, to - from),
        0,
        1,
      );
      return normalized * normalized * (3 - 2 * normalized);
    };

    function sampleTurnPath(progress: number, angle: number) {
      const boundedAngle = THREE.MathUtils.clamp(
        angle,
        Math.PI / 36,
        Math.PI * 0.85,
      );
      if (progress < 0.52) {
        const phase = smoothStep(0, 0.52, progress);
        return {
          x: 0,
          z: THREE.MathUtils.lerp(
            TURN_PATH_START,
            TURN_RADIUS,
            phase,
          ),
          angle: 0,
        };
      }
      if (progress < 0.8) {
        const phase = smoothStep(0.52, 0.8, progress);
        const pathAngle = phase * boundedAngle;
        const theta = Math.PI + pathAngle;
        return {
          x: TURN_RADIUS + Math.cos(theta) * TURN_RADIUS,
          z: TURN_RADIUS + Math.sin(theta) * TURN_RADIUS,
          angle: pathAngle,
        };
      }
      const phase = smoothStep(0.8, 1, progress);
      const exitX = TURN_RADIUS * (1 - Math.cos(boundedAngle));
      const exitZ = TURN_RADIUS * (1 - Math.sin(boundedAngle));
      const outgoingDistance =
        (TURN_PATH_START - TURN_RADIUS) * phase;
      return {
        x: exitX + Math.sin(boundedAngle) * outgoingDistance,
        z: exitZ - Math.cos(boundedAngle) * outgoingDistance,
        angle: boundedAngle,
      };
    }

    function measureForwardClearance(yaw: number) {
      forwardVisibilityDirection.set(
        -Math.sin(yaw),
        0,
        -Math.cos(yaw),
      );
      forwardVisibilityRaycaster.set(
        forwardVisibilityOrigin,
        forwardVisibilityDirection,
      );
      forwardVisibilityRaycaster.near = 0;
      forwardVisibilityRaycaster.far = 40;
      const obstruction = forwardVisibilityRaycaster.intersectObjects(
        turnCameraOccluders.filter((mesh) => mesh.visible),
        false,
      )[0];
      return obstruction?.distance ?? Number.POSITIVE_INFINITY;
    }

    function resolveForwardCameraYaw(
      progress: number,
      direction: TurnDirection,
      angle: number,
    ) {
      let lookAheadProgress = THREE.MathUtils.clamp(
        progress + TURN_CAMERA_LOOKAHEAD,
        0,
        1,
      );
      let candidateYaw =
        -direction * sampleTurnPath(lookAheadProgress, angle).angle;
      let clearance = measureForwardClearance(candidateYaw);
      for (
        let attempt = 0;
        attempt < 3 && clearance < TURN_FORWARD_CLEARANCE;
        attempt += 1
      ) {
        lookAheadProgress = THREE.MathUtils.clamp(
          lookAheadProgress + 0.045,
          0,
          1,
        );
        candidateYaw =
          -direction * sampleTurnPath(lookAheadProgress, angle).angle;
        clearance = measureForwardClearance(candidateYaw);
      }
      mount!.dataset.forwardClearance = Number.isFinite(clearance)
        ? clearance.toFixed(1)
        : "open";
      return candidateYaw;
    }

    function resolveCameraCollision(
      target: THREE.Vector3,
      occluders: THREE.Mesh[],
    ) {
      cameraCollisionDirection
        .copy(target)
        .sub(cameraCollisionOrigin);
      const desiredDistance = cameraCollisionDirection.length();
      if (desiredDistance <= 0.001 || occluders.length === 0) {
        mount!.dataset.cameraOccluded = "false";
        return resolvedCameraPosition.copy(target);
      }

      cameraCollisionDirection.normalize();
      cameraRaycaster.set(
        cameraCollisionOrigin,
        cameraCollisionDirection,
      );
      cameraRaycaster.near = 0;
      cameraRaycaster.far = desiredDistance;
      turnRig.updateMatrixWorld(true);
      const obstruction = cameraRaycaster.intersectObjects(
        occluders.filter((mesh) => mesh.visible),
        false,
      )[0];

      if (!obstruction) {
        mount!.dataset.cameraOccluded = "false";
        return resolvedCameraPosition.copy(target);
      }

      const safeDistance = Math.max(
        CAMERA_MIN_DISTANCE,
        obstruction.distance - 0.38,
      );
      mount!.dataset.cameraOccluded = "true";
      return resolvedCameraPosition
        .copy(cameraCollisionOrigin)
        .addScaledVector(cameraCollisionDirection, safeDistance);
    }

    function resize() {
      const width = Math.max(1, mount!.clientWidth);
      const height = Math.max(1, mount!.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      rearCamera.aspect = 1;
      rearCamera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    function renderChaseScene(fullLookBack: boolean) {
      renderer.getDrawingBufferSize(drawingBufferSize);
      const width = Math.max(1, Math.floor(drawingBufferSize.x));
      const height = Math.max(1, Math.floor(drawingBufferSize.y));

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.clear(true, true, true);

      if (fullLookBack) {
        const playerVisible = player.visible;
        const shadowVisible = playerShadow.visible;
        player.visible = false;
        playerShadow.visible = false;

        rearCamera.aspect = width / height;
        rearCamera.updateProjectionMatrix();
        renderer.render(scene, rearCamera);

        player.visible = playerVisible;
        playerShadow.visible = shadowVisible;
        return;
      }

      renderer.render(scene, camera);

      const mirrorWidth = Math.floor(width * 0.26);
      const mirrorHeight = Math.floor(mirrorWidth * 0.58);
      const margin = Math.floor(width * 0.016);
      const mirrorX = width - mirrorWidth - margin;
      const mirrorY = height - mirrorHeight - margin;
      const playerVisible = player.visible;
      const shadowVisible = playerShadow.visible;

      player.visible = false;
      playerShadow.visible = false;
      rearCamera.aspect = mirrorWidth / mirrorHeight;
      rearCamera.updateProjectionMatrix();

      renderer.clearDepth();
      renderer.setScissorTest(true);
      renderer.setScissor(mirrorX, mirrorY, mirrorWidth, mirrorHeight);
      renderer.setViewport(mirrorX, mirrorY, mirrorWidth, mirrorHeight);
      renderer.render(scene, rearCamera);

      player.visible = playerVisible;
      playerShadow.visible = shadowVisible;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
    }

    function animate() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.033);
      const current = sceneStateRef.current;
      const incidentActive = current.incidentPhase === "active";
      const incidentWarning = current.incidentPhase === "warning";
      const incidentEnvelope = incidentActive
        ? Math.pow(
            Math.max(0, Math.sin(current.incidentProgress * Math.PI)),
            0.42,
          )
        : incidentWarning
          ? current.incidentProgress * 0.28
          : 0;
      const blackoutStrength =
        current.incidentKind === "blackout" ? incidentEnvelope : 0;
      const steamStrength =
        current.incidentKind === "steam" ? incidentEnvelope : 0;

      renderer.toneMappingExposure = current.tuning.exposure;
      ambient.intensity =
        current.tuning.ambient * (1 - blackoutStrength * 0.58);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.density =
          current.tuning.fog * (1 + steamStrength * 2.6);
      }
      wallMaterial.color
        .copy(wallBaseColor)
        .multiplyScalar(current.tuning.concrete);
      floorMaterial.color
        .copy(floorBaseColor)
        .multiplyScalar(current.tuning.concrete);
      tileMaterial.color
        .copy(tileBaseColor)
        .multiplyScalar(current.tuning.concrete);
      ceilingMaterial.color
        .copy(ceilingBaseColor)
        .multiplyScalar(current.tuning.concrete);
      ceilingLights.forEach((light, index) => {
        const blackoutFlicker =
          current.incidentKind === "blackout" && incidentActive
            ? Math.sin(elapsed * 21 + index * 1.9) > 0.18
              ? 0.08
              : 0.34
            : 1;
        if (index % 3 === 1) {
          light.intensity =
            Math.sin(elapsed * 13 + index * 2.3) > 0.74
              ? current.tuning.ceiling * 0.44 * blackoutFlicker
              : current.tuning.ceiling * 0.11 * blackoutFlicker;
        } else {
          light.intensity = current.tuning.ceiling * blackoutFlicker;
        }
      });
      flashlight.intensity =
        current.tuning.flashlight * (1 + blackoutStrength * 0.12) +
        Math.sin(elapsed * 1.7) * 0.4 -
        current.monsterPressure * 0.75;
      incidentLight.color.set(
        current.incidentKind === "blackout"
          ? 0xb52b21
          : current.incidentKind === "steam"
            ? 0x9bc9ca
            : 0xd38a49,
      );
      incidentLight.intensity =
        incidentEnvelope *
        (current.incidentKind === "blackout"
          ? 1.35 + Math.max(0, Math.sin(elapsed * 9)) * 0.8
          : 1.1);

      if (current.paused) {
        renderChaseScene(current.lookBack);
        return;
      }

      elapsed += dt;
      const swing = Math.sin(elapsed * 11.5) * 0.74;
      const turnActive = current.turn !== 0;
      const turnPath = sampleTurnPath(
        current.segmentProgress,
        current.turnAngle,
      );
      const runnerYaw = turnActive
        ? -current.turn * turnPath.angle
        : 0;

      if (
        current.turn !== previousTurn ||
        Math.abs(current.turnAngle - previousTurnAngle) > 0.01
      ) {
        cameraYaw = 0;
        camera.position.set(0, 4.8, CAMERA_TRAIL_DISTANCE);
        previousTurn = current.turn;
        previousTurnAngle = current.turnAngle;
      }

      world.visible = !turnActive;
      turnRig.visible = turnActive;
      if (turnActive) {
        updateTurnGeometry(current.turnAngle);
        turnRig.scale.set(current.turn, 1, 1);
        turnRig.position.set(
          -current.turn * turnPath.x,
          0,
          -turnPath.z,
        );
        turnRig.updateMatrixWorld(true);
      }

      const targetCameraYaw = turnActive
        ? resolveForwardCameraYaw(
            current.segmentProgress,
            current.turn,
            current.turnAngle,
          )
        : 0;
      if (!turnActive) mount!.dataset.forwardClearance = "open";
      cameraYaw = THREE.MathUtils.damp(
        cameraYaw,
        targetCameraYaw,
        12.5,
        dt,
      );
      pathForward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
      pathRight.set(-pathForward.z, 0, pathForward.x);
      const observationSide =
        current.observationDirection === "left"
          ? -1
          : current.observationDirection === "right"
            ? 1
            : 0;

      const incidentDistance = THREE.MathUtils.lerp(
        18,
        -5,
        current.incidentProgress,
      );
      collapseObstacle.visible = Boolean(
        current.incidentKind === "collapse" && incidentActive,
      );
      if (collapseObstacle.visible) {
        collapseObstacle.position.set(
          pathForward.x * incidentDistance + pathRight.x * -1.15,
          0,
          pathForward.z * incidentDistance + pathRight.z * -1.15,
        );
        collapseObstacle.rotation.y = cameraYaw;
      }
      steamCloud.visible = Boolean(
        current.incidentKind === "steam" && incidentActive,
      );
      if (steamCloud.visible) {
        steamCloud.position.set(
          pathForward.x * 5.5 + pathRight.x * 1.8,
          0,
          pathForward.z * 5.5 + pathRight.z * 1.8,
        );
        steamCloud.rotation.y = cameraYaw + elapsed * 0.08;
        steamMaterial.opacity = 0.18 + steamStrength * 0.38;
      }
      incidentLight.position.set(
        pathForward.x * 6 + pathRight.x * 2.5,
        3.2,
        pathForward.z * 6 + pathRight.z * 2.5,
      );

      updateNodeLabel(current.nodeLabel, current.nodeSceneKind);
      for (const kind of Object.keys(
        nodeSceneGroups,
      ) as RouteNodeSceneKind[]) {
        nodeSceneGroups[kind].visible = kind === current.nodeSceneKind;
      }
      const nodeApproach = smoothStep(0.06, 1, current.segmentProgress);
      nodeSceneRoot.visible = current.segmentProgress > 0.04;
      if (turnActive) {
        const exitX = TURN_RADIUS * (1 - Math.cos(current.turnAngle));
        const exitZ = TURN_RADIUS * (1 - Math.sin(current.turnAngle));
        const nodeX =
          exitX + Math.sin(current.turnAngle) * TURN_NODE_LEAD;
        const nodeZ =
          exitZ - Math.cos(current.turnAngle) * TURN_NODE_LEAD;
        nodeSceneRoot.position.set(
          current.turn * (nodeX - turnPath.x),
          0,
          nodeZ - turnPath.z,
        );
        nodeSceneRoot.rotation.y =
          -current.turn * current.turnAngle;
      } else {
        const nodeDistance = THREE.MathUtils.lerp(
          48,
          8.5,
          nodeApproach,
        );
        nodeSceneRoot.position.set(0, 0, -nodeDistance);
        nodeSceneRoot.rotation.y = 0;
      }
      nodeSceneRoot.scale.setScalar(
        THREE.MathUtils.lerp(0.82, 1, nodeApproach),
      );

      machineFan.rotation.z -= dt * 1.9;
      valveWheel.rotation.z =
        Math.sin(elapsed * 0.8) * 0.12 + current.segmentProgress * 0.35;
      keyArtifact.position.y =
        2 + Math.sin(elapsed * 2.5) * 0.11;
      keyArtifact.rotation.y += dt * 0.75;
      keyLight.intensity = 1.8 + Math.sin(elapsed * 3.2) * 0.35;
      serviceLamp.intensity =
        1.1 + Math.max(0, Math.sin(elapsed * 5.6)) * 1.15;
      exitLight.intensity = 2.2 + Math.sin(elapsed * 2.2) * 0.25;

      leftLegPivot.rotation.x = swing;
      rightLegPivot.rotation.x = -swing;
      leftArmPivot.rotation.x = -swing * 0.82;
      rightArmPivot.rotation.x = swing * 0.82;
      bodyRoot.position.y = 0.06 + Math.abs(Math.sin(elapsed * 11.5)) * 0.07;
      const turnPhase = turnActive
        ? THREE.MathUtils.clamp(
            turnPath.angle / Math.max(0.001, current.turnAngle),
            0,
            1,
          )
        : 0;
      bodyRoot.rotation.z = THREE.MathUtils.damp(
        bodyRoot.rotation.z,
        current.turn *
          -0.075 *
          Math.sin(turnPhase * Math.PI),
        5,
        dt,
      );
      headRoot.rotation.z = Math.sin(elapsed * 5.5) * 0.025;
      headRoot.rotation.y = THREE.MathUtils.damp(
        headRoot.rotation.y,
        observationSide * -0.48,
        9,
        dt,
      );

      const collapseDodge =
        current.incidentKind === "collapse" && incidentActive
          ? Math.sin(current.incidentProgress * Math.PI) * 1.65
          : 0;
      player.position.x = THREE.MathUtils.damp(
        player.position.x,
        collapseDodge,
        8,
        dt,
      );
      player.rotation.y = THREE.MathUtils.damp(
        player.rotation.y,
        runnerYaw,
        8,
        dt,
      );
      playerShadow.position.x = player.position.x;

      for (const chunk of corridorChunks) {
        chunk.position.z += RUN_SPEED * dt;
        if (chunk.position.z > CHUNK_LENGTH) {
          chunk.position.z -= CHUNK_LENGTH * CHUNK_COUNT;
        }
      }

      world.rotation.y = THREE.MathUtils.damp(
        world.rotation.y,
        0,
        8,
        dt,
      );
      world.position.x = THREE.MathUtils.damp(
        world.position.x,
        0,
        8,
        dt,
      );

      const monsterBehindDistance =
        7.15 - current.monsterPressure * 0.45;
      const monsterLateral =
        -3.05 + current.monsterPressure * 0.48;
      const targetMonsterX =
        -pathForward.x * monsterBehindDistance +
        pathRight.x * monsterLateral;
      const targetMonsterZ =
        -pathForward.z * monsterBehindDistance +
        pathRight.z * monsterLateral;
      const targetMonsterScale = 0.78 + current.monsterPressure * 0.08;
      monster.position.x = THREE.MathUtils.damp(
        monster.position.x,
        targetMonsterX,
        2.8,
        dt,
      );
      monster.position.z = THREE.MathUtils.damp(
        monster.position.z,
        targetMonsterZ,
        2.5,
        dt,
      );
      monster.position.y = Math.abs(Math.sin(elapsed * 9.4)) * 0.08;
      monster.scale.setScalar(
        THREE.MathUtils.damp(monster.scale.x, targetMonsterScale, 2.8, dt),
      );
      monsterBody.rotation.z = Math.sin(elapsed * 4.7) * 0.045;
      leftMonsterArm.rotation.x = -swing * 0.58;
      rightMonsterArm.rotation.x = swing * 0.58;
      dangerLight.intensity =
        0.02 +
        current.monsterPressure * 0.32 +
        Math.max(0, Math.sin(elapsed * 5.5)) * 0.08;
      dangerLight.position.copy(monster.position);
      dangerLight.position.y += 2.4;
      dangerLight.position.z += 0.45;

      if (
        current.clueActive &&
        current.clueKind &&
        (!previousClueActive ||
          renderedClueKey !== `${current.clueKind}:${current.clueText}`)
      ) {
        updateWallClue(current.clueText, current.clueKind);
        wallClue.visible = true;
        clueTraveling = true;
      }
      previousClueActive = current.clueActive;

      if (clueTraveling) {
        cluePathDistance -= RUN_SPEED * dt;
        wallClue.position.set(
          pathForward.x * cluePathDistance +
            pathRight.x *
              clueSide *
              (CORRIDOR_HALF_WIDTH - 0.3),
          3.1,
          pathForward.z * cluePathDistance +
            pathRight.z *
              clueSide *
              (CORRIDOR_HALF_WIDTH - 0.3),
        );
        wallClue.rotation.set(
          0,
          cameraYaw -
            clueSide * (Math.PI / 2 - 0.08),
          current.clueKind === "turn" ? -0.025 : 0.035,
        );
        clueLight.intensity =
          1.1 + Math.max(0, Math.sin(elapsed * 6.2)) * 0.55;
        if (!current.clueActive || cluePathDistance < -4.8) {
          wallClue.visible = false;
          clueTraveling = false;
          clueLight.intensity = 0;
        }
      }

      dust.position.z += RUN_SPEED * dt * 0.44;
      if (dust.position.z > 18) dust.position.z = 0;
      dust.rotation.y = cameraYaw;

      const cornerCompression = turnActive
        ? Math.sin(turnPhase * Math.PI)
        : 0;
      const cameraTrailDistance = THREE.MathUtils.lerp(
        CAMERA_TRAIL_DISTANCE,
        5.3,
        cornerCompression,
      );
      desiredCameraPosition.set(
        -pathForward.x * cameraTrailDistance,
        4.8 + Math.sin(elapsed * 11.5) * 0.022 +
          current.monsterPressure * 0.06,
        -pathForward.z * cameraTrailDistance,
      );
      const safeCameraPosition = turnActive
        ? resolveCameraCollision(
            desiredCameraPosition,
            turnCameraOccluders,
          )
        : resolvedCameraPosition.copy(desiredCameraPosition);
      if (!turnActive) {
        mount!.dataset.cameraOccluded = "false";
      }
      const cameraFollowAlpha = 1 - Math.exp(-12 * dt);
      camera.position.lerp(
        safeCameraPosition,
        cameraFollowAlpha,
      );
      cameraLookTarget.set(
        pathForward.x * 6.4 + pathRight.x * observationSide * 5.1,
        observationSide === 0 ? 1.55 : 2.25,
        pathForward.z * 6.4 + pathRight.z * observationSide * 5.1,
      );
      camera.lookAt(cameraLookTarget);

      rearCamera.position.x = -pathForward.x * 1.1;
      rearCamera.position.y = THREE.MathUtils.damp(
        rearCamera.position.y,
        3.05,
        8,
        dt,
      );
      rearCamera.position.z = -pathForward.z * 1.1;
      rearLookTarget.set(
        monster.position.x,
        2.05 + monster.position.y,
        monster.position.z + 0.12,
      );
      rearCamera.lookAt(rearLookTarget);
      rearCamera.fov = THREE.MathUtils.damp(
        rearCamera.fov,
        current.lookBack ? 64 : 66,
        8,
        dt,
      );
      rearCamera.updateProjectionMatrix();

      flashlight.position.set(
        -pathForward.x * 6.3,
        4.45,
        -pathForward.z * 6.3,
      );
      flashlight.target.position.x = pathForward.x * 13.5;
      flashlight.target.position.y = 2.05;
      flashlight.target.position.z = pathForward.z * 13.5;
      flashlight.target.position.addScaledVector(
        pathRight,
        observationSide * 8.2,
      );

      renderChaseScene(current.lookBack);
    }

    renderer.setAnimationLoop(animate);
    mount.dataset.renderState = "ready";
    mount.dataset.turnTopology = "map-angle-arc-corner";

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      });
      clueTexture?.dispose();
      nodeLabelTexture?.dispose();
      concreteTexture?.dispose();
      floorTexture?.dispose();
      tileTexture?.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      steamGeometry.dispose();
      steamMaterial.dispose();
      playerShadowMaterial.dispose();
      gradientMap.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      className="runner-3d-mount"
      data-render-state="loading"
      ref={mountRef}
    >
      <div className="runner-3d-status runner-3d-status-loading">
        <span>◇</span>
        <b>正在建立地下通道</b>
        <small>載入水泥牆面、手電筒與追逐場景</small>
      </div>
      <div className="runner-3d-status runner-3d-status-failed">
        <span>!</span>
        <b>無法啟動 3D 畫面</b>
        <small>請確認瀏覽器已啟用 WebGL</small>
      </div>
      <div
        className={`runner-rear-mirror-frame ${lookBack ? "hidden" : ""}`}
        aria-hidden="true"
      >
        <b>後視鏡</b>
        <small>LIVE</small>
      </div>
      <div
        className={`runner-lookback-vignette ${lookBack ? "visible" : ""}`}
        aria-hidden="true"
      />
    </div>
  );
}
