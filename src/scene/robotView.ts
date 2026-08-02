/**
 * The three.js viewport: renderer, camera, lights, ground — everything
 * that needs a DOM and a GPU, kept apart from robotChain.ts so the chain
 * itself stays testable headless.
 *
 * One coordinate-frame decision lives here: robotics convention is z-up
 * (the DH tables, the FK, all of src/kinematics), while three.js scenes
 * are y-up by default. Rather than contaminate the math with the graphics
 * convention, a single adapter Group rotated −90° about x converts z-up
 * content into the y-up scene. The kinematics never knows.
 */
import {
  AmbientLight,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface RobotView {
  /** Parent for z-up content (the robot chain, IK gizmo target). */
  zUp: Group;
  /** Exposed for tools that need them (e.g. TransformControls). */
  scene: Scene;
  camera: PerspectiveCamera;
  domElement: HTMLCanvasElement;
  orbit: OrbitControls;
  setBackground(color: string): void;
  /** Register a per-render-frame callback (used by motion playback). */
  onFrame(cb: (nowMs: number) => void): void;
}

export function createRobotView(container: HTMLElement): RobotView {
  const scene = new Scene();

  const zUp = new Group();
  zUp.rotation.x = -Math.PI / 2;
  scene.add(zUp);

  scene.add(new AmbientLight(0xffffff, 0.7));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 3, 1.5);
  scene.add(sun);

  // Neutral mid-tones that read on both light and dark backgrounds.
  scene.add(new GridHelper(2, 20, 0x898781, 0x898781));

  const camera = new PerspectiveCamera(45, 1, 0.01, 50);
  camera.position.set(1.35, 1.05, 1.35);

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.45, 0);
  controls.enableDamping = true;

  function resize(): void {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const frameCallbacks: ((nowMs: number) => void)[] = [];
  renderer.setAnimationLoop((nowMs) => {
    for (const cb of frameCallbacks) cb(nowMs);
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    zUp,
    scene,
    camera,
    domElement: renderer.domElement,
    orbit: controls,
    setBackground(color: string): void {
      scene.background = new Color(color);
    },
    onFrame(cb): void {
      frameCallbacks.push(cb);
    },
  };
}
