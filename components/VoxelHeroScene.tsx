"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const BLOCK_SIZE = 0.84;

function terrainHeight(x: number, z: number) {
  const distance = Math.sqrt((x * 0.86) ** 2 + (z * 1.08) ** 2);
  const ridge = Math.sin(x * 0.73) * 0.7 + Math.cos(z * 0.62) * 0.55;
  return Math.floor(Math.max(0, 4.8 - distance * 0.58 + ridge));
}

function makePortalMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPulse: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uPulse;

      float bayer4(vec2 p) {
        vec2 f = mod(floor(p), 4.0);
        float index = f.x + f.y * 4.0;
        if (index < 1.0) return 0.0 / 16.0;
        if (index < 2.0) return 8.0 / 16.0;
        if (index < 3.0) return 2.0 / 16.0;
        if (index < 4.0) return 10.0 / 16.0;
        if (index < 5.0) return 12.0 / 16.0;
        if (index < 6.0) return 4.0 / 16.0;
        if (index < 7.0) return 14.0 / 16.0;
        if (index < 8.0) return 6.0 / 16.0;
        if (index < 9.0) return 3.0 / 16.0;
        if (index < 10.0) return 11.0 / 16.0;
        if (index < 11.0) return 1.0 / 16.0;
        if (index < 12.0) return 9.0 / 16.0;
        if (index < 13.0) return 15.0 / 16.0;
        if (index < 14.0) return 7.0 / 16.0;
        if (index < 15.0) return 13.0 / 16.0;
        return 5.0 / 16.0;
      }

      void main() {
        vec2 centered = vUv - 0.5;
        float edge = smoothstep(0.58, 0.12, length(centered * vec2(1.05, 0.72)));
        float bands = sin(vUv.y * 42.0 - uTime * 3.1 + sin(vUv.x * 13.0 + uTime) * 2.4);
        float current = sin((vUv.x + vUv.y) * 22.0 + uTime * 2.2) * 0.5 + 0.5;
        float signal = edge * (0.46 + bands * 0.16 + current * 0.24 + uPulse * 0.1);
        float threshold = bayer4(gl_FragCoord.xy) - 0.18;
        if (signal < threshold) discard;
        vec3 aqua = vec3(0.19, 0.92, 1.0);
        vec3 acid = vec3(0.63, 1.0, 0.32);
        vec3 color = mix(aqua, acid, current * 0.62 + uPulse * 0.15);
        gl_FragColor = vec4(color, signal * 0.78);
      }
    `
  });
}

export function VoxelHeroScene() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const currentHost = hostRef.current;
    if (!currentHost) return;
    const host = currentHost;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030806, 0.034);

    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
    camera.position.set(8.8, 7.6, 17.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.45));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    host.appendChild(renderer.domElement);

    const world = new THREE.Group();
    world.position.set(2.4, -2.25, -0.5);
    scene.add(world);

    const blockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    const blockMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.04
    });
    const blocks: Array<{ x: number; y: number; z: number; color: THREE.Color }> = [];
    const grass = new THREE.Color(0x648d42);
    const moss = new THREE.Color(0x344c35);
    const earth = new THREE.Color(0x3a3025);
    const stone = new THREE.Color(0x273032);

    for (let x = -9; x <= 9; x += 1) {
      for (let z = -7; z <= 7; z += 1) {
        const height = terrainHeight(x, z);
        if (!height) continue;
        for (let y = -1; y < height; y += 1) {
          const top = y === height - 1;
          const color = top
            ? grass.clone().lerp(moss, Math.min(0.7, Math.abs(z) * 0.045 + (Math.sin(x * 2.1 + z) + 1) * 0.08))
            : y > height - 3
              ? earth
              : stone;
          blocks.push({ x, y, z, color });
        }
      }
    }

    const terrain = new THREE.InstancedMesh(blockGeometry, blockMaterial, blocks.length);
    terrain.castShadow = true;
    terrain.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    blocks.forEach((block, index) => {
      matrix.makeTranslation(block.x * BLOCK_SIZE, block.y * BLOCK_SIZE, block.z * BLOCK_SIZE);
      terrain.setMatrixAt(index, matrix);
      terrain.setColorAt(index, block.color);
    });
    terrain.instanceMatrix.needsUpdate = true;
    if (terrain.instanceColor) terrain.instanceColor.needsUpdate = true;
    world.add(terrain);

    const waterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x071b1e,
      emissive: 0x071b1e,
      transparent: true,
      opacity: 0.56,
      roughness: 0.22,
      metalness: 0.45,
      transmission: 0.08
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(48, 34), waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -1.31;
    water.receiveShadow = true;
    world.add(water);

    const grid = new THREE.GridHelper(50, 62, 0x3adbd8, 0x183b36);
    grid.position.y = -1.27;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.16;
    world.add(grid);

    const portal = new THREE.Group();
    portal.position.set(2.1, 3.15, -1.5);
    portal.rotation.y = -0.28;
    world.add(portal);

    const portalBlockMaterial = new THREE.MeshStandardMaterial({
      color: 0x142526,
      emissive: 0x0f5e63,
      emissiveIntensity: 1.05,
      metalness: 0.58,
      roughness: 0.3
    });
    const portalBlocks: Array<[number, number]> = [];
    for (let y = -3; y <= 3; y += 1) {
      portalBlocks.push([-2, y], [2, y]);
    }
    for (let x = -1; x <= 1; x += 1) portalBlocks.push([x, 3]);
    portalBlocks.forEach(([x, y]) => {
      const block = new THREE.Mesh(blockGeometry, portalBlockMaterial);
      block.position.set(x * BLOCK_SIZE, y * BLOCK_SIZE, 0);
      block.castShadow = true;
      portal.add(block);
    });

    const portalMaterial = makePortalMaterial();
    const portalPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 4.7, 1, 1), portalMaterial);
    portalPlane.position.z = -0.03;
    portal.add(portalPlane);

    const portalHalo = new THREE.Mesh(
      new THREE.RingGeometry(2.65, 2.68, 80),
      new THREE.MeshBasicMaterial({ color: 0x54e8f1, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending })
    );
    portalHalo.scale.y = 1.18;
    portalHalo.position.z = -0.25;
    portal.add(portalHalo);

    const beaconMaterial = new THREE.MeshStandardMaterial({
      color: 0x111919,
      emissive: 0x6cff6a,
      emissiveIntensity: 0.42,
      roughness: 0.45,
      metalness: 0.65
    });
    const beaconLightMaterial = new THREE.MeshBasicMaterial({ color: 0x9dff59 });
    const beacons: THREE.Group[] = [];
    [[-6, 1, -1], [7, 0, 1], [-3, 1, 5]].forEach(([x, y, z], index) => {
      const beacon = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.4 + index * 0.4, 0.34), beaconMaterial);
      stem.position.y = 1.5;
      stem.castShadow = true;
      const signal = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.13, 0.72), beaconLightMaterial.clone());
      signal.position.y = 3.22 + index * 0.2;
      beacon.add(stem, signal);
      beacon.position.set(x * BLOCK_SIZE, y * BLOCK_SIZE, z * BLOCK_SIZE);
      world.add(beacon);
      beacons.push(beacon);
    });

    const crystalGeometry = new THREE.OctahedronGeometry(0.58, 0);
    const diamondCrystal = new THREE.Mesh(
      crystalGeometry,
      new THREE.MeshPhysicalMaterial({
        color: 0x77edff,
        emissive: 0x148cba,
        emissiveIntensity: 1.45,
        metalness: 0.12,
        roughness: 0.12,
        transmission: 0.18
      })
    );
    diamondCrystal.position.set(7.3, 4.4, 1.4);
    world.add(diamondCrystal);

    const goldCrystal = new THREE.Mesh(
      crystalGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xffc940,
        emissive: 0x9d5c04,
        emissiveIntensity: 1.2,
        metalness: 0.75,
        roughness: 0.22
      })
    );
    goldCrystal.scale.setScalar(0.78);
    goldCrystal.position.set(-5.2, 3.2, 1.8);
    world.add(goldCrystal);

    const particleCount = 360;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 32;
      particlePositions[i * 3 + 1] = Math.random() * 12 - 2;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 25;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: 0xa5ff73,
      size: 0.035,
      transparent: true,
      opacity: 0.56,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    scene.add(new THREE.HemisphereLight(0x9fe9ff, 0x121b11, 1.35));
    const sun = new THREE.DirectionalLight(0xe5ffe0, 3.5);
    sun.position.set(-8, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const portalLight = new THREE.PointLight(0x43eaff, 18, 18, 1.7);
    portalLight.position.set(4, 4.3, 1);
    scene.add(portalLight);
    const acidLight = new THREE.PointLight(0x9bff52, 8, 16, 1.6);
    acidLight.position.set(-5, 3, 5);
    scene.add(acidLight);

    const pointer = new THREE.Vector2();
    let scrollProgress = 0;
    let frame = 0;
    let running = !document.hidden;
    let width = 1;
    let height = 1;

    function resize() {
      const bounds = host.getBoundingClientRect();
      width = Math.max(1, Math.floor(bounds.width));
      height = Math.max(1, Math.floor(bounds.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = width < 760 ? 52 : 43;
      world.position.x = width < 760 ? 0.8 : 2.4;
      world.scale.setScalar(width < 760 ? 0.84 : 1);
      camera.updateProjectionMatrix();
      if (reducedMotion) renderer.render(scene, camera);
    }

    function onPointerMove(event: PointerEvent) {
      const bounds = host.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointer.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    }

    function onScroll() {
      const bounds = host.getBoundingClientRect();
      scrollProgress = THREE.MathUtils.clamp(-bounds.top / Math.max(1, bounds.height), 0, 1);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    host.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    resize();
    onScroll();

    function render(time: number) {
      const t = time * 0.001;
      portalMaterial.uniforms.uTime.value = t;
      portalMaterial.uniforms.uPulse.value = Math.sin(t * 1.8) * 0.5 + 0.5;
      portalLight.intensity = 15 + Math.sin(t * 2.2) * 3;
      portalHalo.rotation.z = t * 0.08;
      diamondCrystal.rotation.y = t * 0.7;
      diamondCrystal.position.y = 4.4 + Math.sin(t * 1.45) * 0.22;
      goldCrystal.rotation.y = -t * 0.58;
      goldCrystal.position.y = 3.2 + Math.sin(t * 1.2 + 1) * 0.16;
      beacons.forEach((beacon, index) => {
        const signal = beacon.children[1] as THREE.Mesh;
        signal.scale.setScalar(0.82 + Math.sin(t * 2.5 + index) * 0.18);
      });
      particles.rotation.y = t * 0.018;

      const mobile = width < 760;
      const targetX = mobile ? 7.4 : 8.8 + pointer.x * 0.65 - scrollProgress * 2.4;
      const targetY = mobile ? 8.1 : 7.6 - pointer.y * 0.42 + scrollProgress * 1.2;
      const targetZ = mobile ? 21.5 : 17.5 - scrollProgress * 2.8;
      camera.position.x += (targetX - camera.position.x) * 0.03;
      camera.position.y += (targetY - camera.position.y) * 0.03;
      camera.position.z += (targetZ - camera.position.z) * 0.03;
      world.rotation.y += ((mobile ? -0.12 : -0.04 + pointer.x * 0.035) - world.rotation.y) * 0.025;
      camera.lookAt(mobile ? 0 : 1.2 + scrollProgress * 0.7, 1.35, -0.4);
      renderer.render(scene, camera);
    }

    function animate(time: number) {
      if (!running) return;
      render(time);
      frame = requestAnimationFrame(animate);
    }

    function onVisibilityChange() {
      running = !document.hidden;
      if (running && !reducedMotion) frame = requestAnimationFrame(animate);
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (reducedMotion) render(0);
    else frame = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments)) return;
        if (object.geometry) object.geometry.dispose();
        const objectMaterial = object.material;
        if (Array.isArray(objectMaterial)) objectMaterial.forEach((material) => material.dispose());
        else objectMaterial?.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={hostRef} className="voxel-scene" aria-hidden="true" />;
}
