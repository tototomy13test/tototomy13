import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const app = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(10, 12, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Lights
const ambient = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 0.6);
sun.position.set(100, 100, 0);
scene.add(sun);

// Controls (orbit for easier prototype)
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(8, 4, 8);
controls.update();

// Simple block materials
const materials: Record<string, THREE.MeshStandardMaterial> = {
  dirt: new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
  grass: new THREE.MeshStandardMaterial({ color: 0x2e8b57 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x808080 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8b4513 })
};

const BLOCK_SIZE = 1;
type Block = { x: number; y: number; z: number; type: string; mesh?: THREE.Mesh };

class World {
  blocks = new Map<string, Block>();
  group = new THREE.Group();

  constructor() {
    scene.add(this.group);
  }

  key(x: number, y: number, z: number) { return `${x},${y},${z}`; }

  addBlock(x: number, y: number, z: number, type = 'dirt') {
    const k = this.key(x,y,z);
    if (this.blocks.has(k)) return;
    const geom = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    const mesh = new THREE.Mesh(geom, materials[type]);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.userData = { blockPos: [x,y,z] };
    this.group.add(mesh);
    this.blocks.set(k, {x,y,z,type,mesh});
  }

  removeBlock(x:number,y:number,z:number) {
    const k = this.key(x,y,z);
    const b = this.blocks.get(k);
    if (!b) return;
    if (b.mesh) this.group.remove(b.mesh);
    this.blocks.delete(k);
  }
}

const world = new World();

// Simple terrain generation (flat with a few hills + trees)
function generateTerrain() {
  const size = 32;
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      // simple height by sin/cos for variation
      const h = Math.floor(3 + Math.abs(Math.sin(x*0.2)*2 + Math.cos(z*0.2)));
      for (let y = 0; y < h; y++) {
        const type = (y === h-1) ? 'grass' : (y < h-3 ? 'stone' : 'dirt');
        world.addBlock(x, y, z, type);
      }
      // occasional tree
      if (Math.random() < 0.03) {
        const trunkHeight = 3 + Math.floor(Math.random()*2);
        for (let t = 0; t < trunkHeight; t++) world.addBlock(x, h + t, z, 'wood');
        // leaves (simple cube)
        for (let lx = -2; lx <= 2; lx++) for (let lz = -2; lz <= 2; lz++) {
          if (Math.abs(lx) + Math.abs(lz) < 4) world.addBlock(x+lx, h + trunkHeight, z+lz, 'grass');
        }
      }
    }
  }
}
generateTerrain();

// Raycaster for placing / removing
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedBlockType = 'dirt';
(document.querySelectorAll('.slot') as NodeListOf<Element>).forEach(el => {
  el.addEventListener('click', () => {
    selectedBlockType = (el as HTMLElement).dataset.block || 'dirt';
    (document.getElementById('selected')!).textContent = selectedBlockType;
  });
});

window.addEventListener('mousedown', (ev) => {
  ev.preventDefault();
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  ray.setFromCamera(mouse, camera);
  const intersects = ray.intersectObjects(world.group.children, false);

  if (intersects.length > 0) {
    const it = intersects[0];
    const [bx, by, bz] = it.object.userData.blockPos as [number,number,number];
    if (ev.button === 0) {
      // left click: remove
      world.removeBlock(bx, by, bz);
    } else if (ev.button === 2) {
      // right click: place adjacent depending on face normal
      const n = it.face!.normal;
      const px = bx + (n.x);
      const py = by + (n.y);
      const pz = bz + (n.z);
      world.addBlock(px, py, pz, selectedBlockType);
    }
  }
});

// prevent context menu on right click
window.addEventListener('contextmenu', (e) => e.preventDefault());

// Simple animals: boxes that wander
class Animal {
  mesh: THREE.Mesh;
  speed = 0.02;
  dir = new THREE.Vector3();
  constructor(x:number,y:number,z:number, color=0xffffaa) {
    const mat = new THREE.MeshStandardMaterial({ color });
    const geo = new THREE.BoxGeometry(0.8,0.6,1.2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(x+0.5, y+0.6, z+0.5);
    scene.add(this.mesh);
    this.randomDir();
  }
  randomDir() {
    const a = Math.random() * Math.PI * 2;
    this.dir.set(Math.cos(a), 0, Math.sin(a));
  }
  update() {
    this.mesh.position.addScaledVector(this.dir, this.speed);
    if (Math.random() < 0.01) this.randomDir();
  }
}
const animals: Animal[] = [];
function spawnAnimals() {
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(Math.random()*24) + 2;
    const z = Math.floor(Math.random()*24) + 2;
    // find surface y
    let y = 10;
    for (let yy = 20; yy >= 0; yy--) {
      if (world.blocks.has(`${x},${yy},${z}`)) { y = yy+1; break; }
    }
    animals.push(new Animal(x,y,z, 0xffe0bd + Math.floor(Math.random()*10000)));
  }
}
spawnAnimals();

// Day/night cycle
let time = 0;
function updateDayNight(dt: number) {
  time += dt * 0.02;
  const t = (Math.sin(time) + 1) / 2; // 0..1
  ambient.intensity = 0.3 + 0.7 * t;
  sun.intensity = 0.2 + 0.8 * t;
  // background color interpolation (night -> day)
  scene.background = new THREE.Color().lerpColors(new THREE.Color(0x0a0a2a), new THREE.Color(0x87ceeb), t);
}

// Animation loop
let last = performance.now();
function animate() {
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;

  updateDayNight(dt);
  animals.forEach(a => a.update());

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// Simple instructions to the user in console
console.log('Prototipo: WASD mover (Orbit controls used for now), click izquierdo romper, click derecho colocar.');

// Export for debugging in console
(window as any).world = world;
(window as any).animals = animals;
