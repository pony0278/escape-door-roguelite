"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type TurnDirection = -1 | 0 | 1;
type ClueKind = "turn" | "knock" | null;

interface RunnerScene3DProps {
  progress: number;
  turn: TurnDirection;
  monsterPressure: number;
  monsterDistance: number;
  clueActive: boolean;
  clueKind: ClueKind;
  clueText: string;
}

const CHUNK_LENGTH = 18;
const CHUNK_COUNT = 7;
const RUN_SPEED = 12.5;
const CORRIDOR_HALF_WIDTH = 6.1;

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
    tone === "wall" ? "#575a57" : tone === "floor" ? "#343836" : "#484d4c";
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const seed = tone === "wall" ? 37 : tone === "floor" ? 83 : 131;
  for (let index = 0; index < 3200; index += 1) {
    const x = (index * 73 + seed * 19) % canvas.width;
    const y = (index * 151 + seed * 29) % canvas.height;
    const light = ((index * 17 + seed) % 100) / 100;
    context.fillStyle =
      light > 0.66
        ? `rgba(220, 220, 208, ${0.012 + light * 0.026})`
        : `rgba(5, 9, 8, ${0.018 + (1 - light) * 0.04})`;
    const radius = 0.5 + ((index * 23) % 19) / 7;
    context.fillRect(x, y, radius, radius);
  }

  const stains = tone === "wall" ? 24 : 14;
  for (let index = 0; index < stains; index += 1) {
    const x = (index * 97 + seed * 11) % canvas.width;
    const y = (index * 43 + seed * 31) % canvas.height;
    const gradient = context.createRadialGradient(x, y, 1, x, y, 28 + (index % 5) * 9);
    gradient.addColorStop(0, "rgba(13, 22, 19, 0.18)");
    gradient.addColorStop(1, "rgba(13, 22, 19, 0)");
    context.fillStyle = gradient;
    context.fillRect(x - 80, y - 80, 160, 160);
  }

  context.strokeStyle = "rgba(12, 15, 14, 0.24)";
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

export default function RunnerScene3D({
  progress,
  turn,
  monsterPressure,
  monsterDistance,
  clueActive,
  clueKind,
  clueText,
}: RunnerScene3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneStateRef = useRef({
    progress,
    turn,
    monsterPressure,
    monsterDistance,
    clueActive,
    clueKind,
    clueText,
  });

  useEffect(() => {
    sceneStateRef.current = {
      progress,
      turn,
      monsterPressure,
      monsterDistance,
      clueActive,
      clueKind,
      clueText,
    };
  }, [
    clueActive,
    clueKind,
    clueText,
    monsterDistance,
    monsterPressure,
    progress,
    turn,
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
    renderer.toneMappingExposure = 0.9;
    renderer.domElement.className = "runner-3d-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030605);
    scene.fog = new THREE.FogExp2(0x070b0a, 0.042);

    const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 150);
    camera.position.set(0, 4.8, 9.2);

    const ambient = new THREE.HemisphereLight(0x899895, 0x080a09, 0.48);
    scene.add(ambient);

    const flashlight = new THREE.SpotLight(
      0xffecc6,
      15,
      34,
      Math.PI / 5.2,
      0.58,
      1.35,
    );
    flashlight.position.set(0, 4.45, 6.3);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.set(1024, 1024);
    flashlight.shadow.camera.near = 0.4;
    flashlight.shadow.camera.far = 38;
    flashlight.target.position.set(0, 1.9, -12);
    scene.add(flashlight, flashlight.target);

    const coldFill = new THREE.DirectionalLight(0x6a8588, 0.34);
    coldFill.position.set(6, 8, -12);
    scene.add(coldFill);

    const dangerLight = new THREE.PointLight(0xb92018, 0, 9, 2);
    scene.add(dangerLight);

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
      color: 0x727570,
      map: concreteTexture,
      roughness: 0.94,
      metalness: 0.02,
    });
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x515553,
      map: floorTexture,
      roughness: 0.88,
      metalness: 0.03,
    });
    const tileMaterial = new THREE.MeshStandardMaterial({
      color: 0x666d6b,
      map: tileTexture,
      roughness: 0.78,
      metalness: 0.04,
    });
    const ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0x2e3230,
      roughness: 0.98,
    });
    const pipeMaterial = new THREE.MeshStandardMaterial({
      color: 0x333a38,
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
        index % 3 === 1 ? 0.16 : 1.25,
        11,
        2.1,
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
    monster.position.set(-1.6, 0, 2.9);
    monster.scale.setScalar(0.65);
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
      wallClue.position.set(
        clueSide * (CORRIDOR_HALF_WIDTH - 0.3),
        3.1,
        -14,
      );
      wallClue.rotation.set(
        0,
        clueSide < 0 ? Math.PI / 2 - 0.08 : -Math.PI / 2 + 0.08,
        kind === "turn" ? -0.025 : 0.035,
      );
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
    let elapsed = 0;
    let previousClueActive = false;
    let clueTraveling = false;

    function resize() {
      const width = Math.max(1, mount!.clientWidth);
      const height = Math.max(1, mount!.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    function animate() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.033);
      elapsed += dt;
      const current = sceneStateRef.current;
      const swing = Math.sin(elapsed * 11.5) * 0.74;

      leftLegPivot.rotation.x = swing;
      rightLegPivot.rotation.x = -swing;
      leftArmPivot.rotation.x = -swing * 0.82;
      rightArmPivot.rotation.x = swing * 0.82;
      bodyRoot.position.y = 0.06 + Math.abs(Math.sin(elapsed * 11.5)) * 0.07;
      bodyRoot.rotation.z = THREE.MathUtils.damp(
        bodyRoot.rotation.z,
        current.turn * -0.075,
        5,
        dt,
      );
      headRoot.rotation.z = Math.sin(elapsed * 5.5) * 0.025;

      player.position.x = THREE.MathUtils.damp(
        player.position.x,
        current.turn * 0.34,
        4.5,
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
        current.turn * -0.016,
        3.6,
        dt,
      );
      world.position.x = THREE.MathUtils.damp(
        world.position.x,
        current.turn * -0.2,
        3.6,
        dt,
      );

      ceilingLights.forEach((light, index) => {
        if (index % 3 === 1) {
          light.intensity =
            Math.sin(elapsed * 13 + index * 2.3) > 0.74 ? 0.54 : 0.08;
        }
      });

      const targetMonsterX = -1.55 + current.turn * 0.42;
      const targetMonsterZ = 3.35 - current.monsterPressure * 1.78;
      const targetMonsterScale = 0.6 + current.monsterPressure * 0.39;
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
        0.08 +
        current.monsterPressure * 0.75 +
        Math.max(0, Math.sin(elapsed * 5.5)) * 0.12;
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
        wallClue.position.z += RUN_SPEED * dt;
        clueLight.intensity =
          1.1 + Math.max(0, Math.sin(elapsed * 6.2)) * 0.55;
        if (!current.clueActive || wallClue.position.z > 4.8) {
          wallClue.visible = false;
          clueTraveling = false;
          clueLight.intensity = 0;
        }
      }

      dust.position.z += RUN_SPEED * dt * 0.44;
      if (dust.position.z > 18) dust.position.z = 0;

      camera.position.x = THREE.MathUtils.damp(
        camera.position.x,
        player.position.x * 0.24 + current.turn * 0.22,
        4,
        dt,
      );
      camera.position.y =
        4.8 + Math.sin(elapsed * 11.5) * 0.022 +
        current.monsterPressure * 0.06;
      camera.lookAt(player.position.x * 0.18, 1.55, -6.4);

      flashlight.position.x = camera.position.x * 0.76;
      flashlight.target.position.x = player.position.x * 0.45;
      flashlight.target.position.y = 2.05;
      flashlight.target.position.z = -13.5;
      flashlight.intensity =
        14.2 + Math.sin(elapsed * 1.7) * 0.35 -
        current.monsterPressure * 1.15;

      renderer.render(scene, camera);
    }

    renderer.setAnimationLoop(animate);
    mount.dataset.renderState = "ready";

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
      concreteTexture?.dispose();
      floorTexture?.dispose();
      tileTexture?.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
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
    </div>
  );
}
