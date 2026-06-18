"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type VoxelMesh = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;

export function VoxelHeroScene() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const currentHost = hostRef.current;
    if (!currentHost) {
      return;
    }
    const host = currentHost;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05080a, 0.045);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    camera.position.set(0, 5.2, 13);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance"
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 42, 36, 36),
      new THREE.MeshStandardMaterial({
        color: 0x07100d,
        metalness: 0.25,
        roughness: 0.72,
        transparent: true,
        opacity: 0.9
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.45;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(42, 42, 0x9bff5b, 0x15352d);
    grid.position.y = -1.42;
    scene.add(grid);

    const materials = [
      new THREE.MeshStandardMaterial({ color: 0x9bff5b, emissive: 0x224d18, roughness: 0.42, metalness: 0.18 }),
      new THREE.MeshStandardMaterial({ color: 0x48e3ff, emissive: 0x0b4652, roughness: 0.36, metalness: 0.22 }),
      new THREE.MeshStandardMaterial({ color: 0xf7c948, emissive: 0x49320a, roughness: 0.5, metalness: 0.16 }),
      new THREE.MeshStandardMaterial({ color: 0xff6f91, emissive: 0x481223, roughness: 0.45, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: 0xa78bfa, emissive: 0x261a56, roughness: 0.4, metalness: 0.2 })
    ];
    const geometry = new THREE.BoxGeometry(0.82, 0.82, 0.82);
    const cubes: VoxelMesh[] = [];

    for (let ring = 0; ring < 4; ring += 1) {
      const radius = 1.5 + ring * 1.55;
      const count = 10 + ring * 5;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;
        const cube = new THREE.Mesh(geometry, materials[(i + ring) % materials.length]);
        cube.position.set(
          Math.cos(angle) * radius,
          Math.sin(i * 1.7) * 0.75 + ring * 0.18,
          Math.sin(angle) * radius
        );
        cube.rotation.set(i * 0.18, ring * 0.4, angle);
        cube.castShadow = true;
        cube.receiveShadow = true;
        group.add(cube);
        cubes.push(cube);
      }
    }

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x48e3ff,
        emissiveIntensity: 1.25,
        metalness: 0.25,
        roughness: 0.28
      })
    );
    group.add(core);

    const pointsGeometry = new THREE.BufferGeometry();
    const pointCount = 260;
    const positions = new Float32Array(pointCount * 3);
    for (let i = 0; i < pointCount; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 28;
      positions[i * 3 + 1] = Math.random() * 11 - 2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 22;
    }
    pointsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(
      pointsGeometry,
      new THREE.PointsMaterial({
        color: 0x9bff5b,
        size: 0.035,
        transparent: true,
        opacity: 0.72
      })
    );
    scene.add(particles);

    scene.add(new THREE.AmbientLight(0x7dfcc9, 0.55));
    const key = new THREE.DirectionalLight(0x9bff5b, 2.4);
    key.position.set(-3, 8, 6);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.PointLight(0x48e3ff, 8, 20);
    rim.position.set(5, 4, 4);
    scene.add(rim);
    const pulse = new THREE.PointLight(0xff6f91, 3, 16);
    pulse.position.set(-5, 2, -3);
    scene.add(pulse);

    let width = 0;
    let height = 0;
    let frame = 0;
    const pointer = new THREE.Vector2();

    function resize() {
      const bounds = host.getBoundingClientRect();
      width = Math.max(1, Math.floor(bounds.width));
      height = Math.max(1, Math.floor(bounds.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function onPointerMove(event: PointerEvent) {
      const bounds = host.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointer.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    host.addEventListener("pointermove", onPointerMove);
    resize();

    function animate(time: number) {
      frame = requestAnimationFrame(animate);
      const t = time * 0.001;
      group.rotation.y = t * 0.16 + pointer.x * 0.08;
      group.rotation.x = -0.08 + pointer.y * 0.05;
      core.rotation.x = t * 0.7;
      core.rotation.y = t * 0.42;
      core.scale.setScalar(1 + Math.sin(t * 2.4) * 0.045);
      particles.rotation.y = t * 0.028;
      pulse.intensity = 2.4 + Math.sin(t * 3) * 1.4;

      cubes.forEach((cube, index) => {
        cube.position.y += Math.sin(t * 1.7 + index) * 0.0018;
        cube.rotation.x += 0.004 + (index % 3) * 0.001;
        cube.rotation.y += 0.006;
      });

      camera.position.x += (pointer.x * 0.7 - camera.position.x) * 0.025;
      camera.position.y += (5.2 - pointer.y * 0.35 - camera.position.y) * 0.025;
      camera.lookAt(0, 0.2, 0);
      renderer.render(scene, camera);
    }

    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
      geometry.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      pointsGeometry.dispose();
      materials.forEach((material) => material.dispose());
      host.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={hostRef} className="voxel-scene" aria-hidden="true" />;
}
