"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type TurnDirection = -1 | 0 | 1;

interface RunnerScene3DProps {
  progress: number;
  turn: TurnDirection;
  monsterPressure: number;
  monsterDistance: number;
  clueActive: boolean;
}

const CHUNK_LENGTH = 18;
const CHUNK_COUNT = 7;
const RUN_SPEED = 12.5;

export default function RunnerScene3D({
  progress,
  turn,
  monsterPressure,
  monsterDistance,
  clueActive,
}: RunnerScene3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneStateRef = useRef({
    progress,
    turn,
    monsterPressure,
    monsterDistance,
    clueActive,
  });
  useEffect(() => {
    sceneStateRef.current = {
      progress,
      turn,
      monsterPressure,
      monsterDistance,
      clueActive,
    };
  }, [clueActive, monsterDistance, monsterPressure, progress, turn]);

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

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.className = "runner-3d-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x102832);
    scene.fog = new THREE.Fog(0x102832, 20, 88);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 180);
    camera.position.set(0, 5.1, 9.8);

    const hemi = new THREE.HemisphereLight(0xdff7ff, 0x233428, 2.5);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff0c6, 3.3);
    keyLight.position.set(-7, 12, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -14;
    keyLight.shadow.camera.right = 14;
    keyLight.shadow.camera.top = 17;
    keyLight.shadow.camera.bottom = -8;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x6edbe8, 1.45);
    rimLight.position.set(9, 7, -10);
    scene.add(rimLight);

    const dangerLight = new THREE.PointLight(0xff493f, 0, 10, 2);
    dangerLight.position.set(-1.7, 2.3, 2.8);
    scene.add(dangerLight);

    const gradientData = new Uint8Array([45, 120, 205, 255]);
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

    const palette = {
      ink: 0x23323f,
      cream: 0xfff7df,
      lime: 0xd8f45d,
      amber: 0xf6ae42,
      cyan: 0x69d2db,
      blue: 0x527fae,
      coral: 0xff776c,
      green: 0x68bb87,
      floor: 0x394b4f,
      lane: 0x58696c,
      steel: 0xaebdb8,
      dark: 0x101718,
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
    const roadChunks: THREE.Group[] = [];

    function createRoadChunk(index: number) {
      const chunk = new THREE.Group();
      chunk.position.z = -index * CHUNK_LENGTH;

      addMesh(
        new THREE.BoxGeometry(13.5, 0.36, CHUNK_LENGTH),
        toon(palette.floor),
        chunk,
        [0, -0.18, 0],
      );

      for (const laneX of [-3.2, 0, 3.2]) {
        addMesh(
          new THREE.BoxGeometry(2.78, 0.09, CHUNK_LENGTH - 0.2),
          toon(palette.lane),
          chunk,
          [laneX, 0.045, 0],
        );

        for (const edge of [-1.32, 1.32]) {
          addMesh(
            new THREE.BoxGeometry(0.065, 0.075, CHUNK_LENGTH),
            toon(palette.lime),
            chunk,
            [laneX + edge, 0.115, 0],
          );
        }
      }

      for (let z = -CHUNK_LENGTH / 2; z < CHUNK_LENGTH / 2; z += 2.25) {
        addMesh(
          new THREE.BoxGeometry(12.4, 0.035, 0.055),
          toon(0x738286),
          chunk,
          [0, 0.105, z],
        );
      }

      for (const side of [-1, 1]) {
        addMesh(
          new THREE.BoxGeometry(3.4, 0.48, CHUNK_LENGTH),
          toon(0x273b39),
          chunk,
          [side * 8.25, -0.03, 0],
        );

        for (const z of [-6, 0, 6]) {
          const prop = new THREE.Group();
          prop.position.set(side * (7.25 + (index % 2) * 0.4), 0, z);
          chunk.add(prop);

          const colors = [
            palette.coral,
            palette.cyan,
            palette.amber,
            palette.green,
          ];
          const color = colors[(index + (z + 6) / 6) % colors.length];
          const height = 1.4 + ((index + z) % 3 + 3) % 3 * 0.42;

          addMesh(
            new THREE.BoxGeometry(1.45, height, 1.45),
            toon(color),
            prop,
            [0, height / 2, 0],
          );
          addMesh(
            new THREE.BoxGeometry(1.68, 0.2, 1.68),
            toon(palette.cream),
            prop,
            [0, height + 0.07, 0],
          );

          const warning = addMesh(
            new THREE.BoxGeometry(0.7, 0.28, 0.08),
            toon(palette.lime),
            prop,
            [0, height * 0.66, side < 0 ? 0.77 : -0.77],
          );
          warning.rotation.y = side < 0 ? 0 : Math.PI;
        }

        addMesh(
          new THREE.BoxGeometry(0.24, 5.1, 0.24),
          toon(palette.steel),
          chunk,
          [side * 6.5, 2.55, -7.4],
        );
      }

      addMesh(
        new THREE.BoxGeometry(13.25, 0.24, 0.24),
        toon(palette.steel),
        chunk,
        [0, 5.06, -7.4],
      );

      for (const x of [-3.9, 0, 3.9]) {
        const lamp = addMesh(
          new THREE.BoxGeometry(1.55, 0.12, 0.5),
          toon(palette.lime),
          chunk,
          [x, 4.88, -7.35],
        );
        lamp.castShadow = false;
      }

      world.add(chunk);
      roadChunks.push(chunk);
    }

    for (let index = 0; index < CHUNK_COUNT; index += 1) {
      createRoadChunk(index);
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
      toon(0xa7b8ad),
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
      toon(0x9b5f26),
      bodyRoot,
      [0, 1.74, 0.96],
    );
    addMesh(
      new THREE.OctahedronGeometry(0.22, 0),
      toon(palette.lime),
      bodyRoot,
      [0.28, 1.38, 1.07],
      [0, 0, Math.PI / 4],
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
      toon(0xffb4c3),
      headRoot,
      [-0.34, 0.9, -0.18],
      [0, 0, -0.08],
    );
    addMesh(
      new THREE.CapsuleGeometry(0.09, 0.6, 5, 10),
      toon(0xffb4c3),
      headRoot,
      [0.34, 0.9, -0.18],
      [0, 0, 0.08],
    );

    const playerShadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x061010,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.86, 32),
      playerShadowMaterial,
    );
    playerShadow.rotation.x = -Math.PI / 2;
    playerShadow.position.set(0, 0.018, 0.15);
    scene.add(playerShadow);

    const monster = new THREE.Group();
    monster.position.set(-1.6, 0, 2.6);
    monster.scale.setScalar(0.68);
    scene.add(monster);

    const monsterBody = new THREE.Group();
    monster.add(monsterBody);
    addMesh(
      new THREE.CapsuleGeometry(0.86, 1.55, 8, 16),
      toon(0x111515),
      monsterBody,
      [0, 1.48, 0],
      [0, 0, 0],
      [1.08, 1, 0.76],
    );
    addMesh(
      new THREE.SphereGeometry(0.72, 18, 14),
      toon(0x171819),
      monsterBody,
      [0, 2.84, 0],
    );
    addMesh(
      new THREE.ConeGeometry(0.24, 0.88, 5),
      toon(0x0b0d0d),
      monsterBody,
      [-0.38, 3.55, 0],
      [0, 0, -0.25],
    );
    addMesh(
      new THREE.ConeGeometry(0.24, 0.88, 5),
      toon(0x0b0d0d),
      monsterBody,
      [0.38, 3.55, 0],
      [0, 0, 0.25],
    );

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff3c35 });
    const leftEye = addMesh(
      new THREE.SphereGeometry(0.095, 10, 8),
      eyeMaterial,
      monsterBody,
      [-0.23, 2.94, 0.67],
      [0, 0, 0],
      [1.45, 0.56, 0.5],
    );
    const rightEye = addMesh(
      new THREE.SphereGeometry(0.095, 10, 8),
      eyeMaterial,
      monsterBody,
      [0.23, 2.94, 0.67],
      [0, 0, 0],
      [1.45, 0.56, 0.5],
    );
    leftEye.castShadow = false;
    rightEye.castShadow = false;

    const leftMonsterArm = new THREE.Group();
    const rightMonsterArm = new THREE.Group();
    leftMonsterArm.position.set(-0.92, 2.05, 0);
    rightMonsterArm.position.set(0.92, 2.05, 0);
    monsterBody.add(leftMonsterArm, rightMonsterArm);
    addMesh(
      new THREE.CapsuleGeometry(0.25, 1.18, 6, 12),
      toon(0x0b0e0e),
      leftMonsterArm,
      [0, -0.5, 0],
    );
    addMesh(
      new THREE.CapsuleGeometry(0.25, 1.18, 6, 12),
      toon(0x0b0e0e),
      rightMonsterArm,
      [0, -0.5, 0],
    );

    const clue = new THREE.Group();
    clue.visible = false;
    scene.add(clue);
    addMesh(
      new THREE.TorusGeometry(0.6, 0.09, 10, 32),
      toon(palette.lime),
      clue,
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
    );
    addMesh(
      new THREE.OctahedronGeometry(0.35, 0),
      toon(palette.amber),
      clue,
    );
    const clueLight = new THREE.PointLight(0xd8f45d, 2.2, 7, 2);
    clue.add(clueLight);

    const dustGeometry = new THREE.BufferGeometry();
    const dustPoints: number[] = [];
    for (let index = 0; index < 120; index += 1) {
      dustPoints.push(
        THREE.MathUtils.randFloatSpread(13),
        Math.random() * 4.8 + 0.25,
        -Math.random() * 75,
      );
    }
    dustGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(dustPoints, 3),
    );
    const dustMaterial = new THREE.PointsMaterial({
      color: 0xdff6dc,
      size: 0.045,
      transparent: true,
      opacity: 0.36,
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
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

      for (const chunk of roadChunks) {
        chunk.position.z += RUN_SPEED * dt;
        if (chunk.position.z > CHUNK_LENGTH) {
          chunk.position.z -= CHUNK_LENGTH * CHUNK_COUNT;
        }
      }

      world.rotation.y = THREE.MathUtils.damp(
        world.rotation.y,
        current.turn * -0.035,
        3.6,
        dt,
      );
      world.position.x = THREE.MathUtils.damp(
        world.position.x,
        current.turn * -0.28,
        3.6,
        dt,
      );

      const targetMonsterX = -1.55 + current.turn * 0.42;
      const targetMonsterZ = 3.25 - current.monsterPressure * 1.72;
      const targetMonsterScale = 0.62 + current.monsterPressure * 0.38;
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
        THREE.MathUtils.damp(
          monster.scale.x,
          targetMonsterScale,
          2.8,
          dt,
        ),
      );
      monsterBody.rotation.z = Math.sin(elapsed * 4.7) * 0.045;
      leftMonsterArm.rotation.x = -swing * 0.58;
      rightMonsterArm.rotation.x = swing * 0.58;
      dangerLight.intensity =
        0.4 + current.monsterPressure * 2.2 +
        Math.abs(Math.sin(elapsed * 5.5)) * 0.18;
      dangerLight.position.copy(monster.position);
      dangerLight.position.y += 2.35;
      dangerLight.position.z += 0.6;

      if (current.clueActive && !previousClueActive) {
        clue.position.set(3.15, 1.65, -13);
        clue.visible = true;
        clueTraveling = true;
      }
      previousClueActive = current.clueActive;

      if (clueTraveling) {
        clue.position.z += RUN_SPEED * dt;
        clue.rotation.y += dt * 2.8;
        clue.rotation.z = Math.sin(elapsed * 4) * 0.2;
        const pulse = 1 + Math.sin(elapsed * 7) * 0.08;
        clue.scale.setScalar(pulse);
        if (!current.clueActive || clue.position.z > 3.4) {
          clue.visible = false;
          clueTraveling = false;
        }
      }

      dust.position.z += RUN_SPEED * dt * 0.44;
      if (dust.position.z > 18) dust.position.z = 0;

      camera.position.x = THREE.MathUtils.damp(
        camera.position.x,
        player.position.x * 0.24 + current.turn * 0.25,
        4,
        dt,
      );
      camera.position.y =
        5.1 + Math.sin(elapsed * 11.5) * 0.025 +
        current.monsterPressure * 0.08;
      camera.lookAt(player.position.x * 0.18, 1.5, -5.9);

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
        <b>正在建立逃生通道</b>
        <small>載入角色、光影與追逐場景</small>
      </div>
      <div className="runner-3d-status runner-3d-status-failed">
        <span>!</span>
        <b>無法啟動 3D 畫面</b>
        <small>請確認瀏覽器已啟用 WebGL</small>
      </div>
    </div>
  );
}
