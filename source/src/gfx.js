// Đồ hoạ nâng cao: bóng đổ, bóng tiếp xúc dưới gầm, phản chiếu sàn, môi trường lấy từ showroom
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

export const QUALITY = {
  low: { shadowMap: 0, reflect: 0, contact: 256 },
  medium: { shadowMap: 2048, reflect: 0, contact: 512 },
  high: { shadowMap: 2048, reflect: 0.4, contact: 512 },
  ultra: { shadowMap: 4096, reflect: 0.75, contact: 1024 },
};

let R, S, Q = QUALITY.high, sun = null, mirror = null, roomSize = 28;
export function initGfx(renderer, scene, quality) {
  R = renderer; S = scene; Q = QUALITY[quality] || QUALITY.high;
  R.shadowMap.enabled = !!Q.shadowMap;
  R.shadowMap.type = THREE.PCFSoftShadowMap;
  R.shadowMap.autoUpdate = false;        // xe đứng yên -> chỉ vẽ bóng khi cần
  // "mặt trời" giả = cụm đèn trần, chiếu gần thẳng xuống
  sun = new THREE.DirectionalLight(0xfff6ea, 1.1);
  sun.position.set(3, 14, 5); sun.target.position.set(0, 0, 0);
  S.add(sun, sun.target);
  setupShadowCam();
}
function setupShadowCam() {
  sun.castShadow = !!Q.shadowMap;
  if (!Q.shadowMap) return;
  const h = roomSize / 2;
  Object.assign(sun.shadow.camera, { left: -h, right: h, top: h, bottom: -h, near: 1, far: 40 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.025; sun.shadow.radius = 5; sun.shadow.blurSamples = 12;
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  R.shadowMap.needsUpdate = true;
}
export function setQuality(q) {
  Q = QUALITY[q] || QUALITY.high;
  R.shadowMap.enabled = !!Q.shadowMap; setupShadowCam();
  S.traverse(o => { if (o.material && o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  if (floorArgs) addFloorMirror(...floorArgs);
  if (mirror) { mirror.material.uniforms.strength.value = reflectStrength; mirror.material.uniforms.blur.value = reflectBlur; }
}
export function shadowsDirty() { if (R) R.shadowMap.needsUpdate = true; }

// ---- môi trường phản xạ lấy từ chính showroom (đèn trần phản chiếu trên sơn xe) ----
export function showroomEnvironment(root, box) {
  const tmp = new THREE.Scene(); const c = root.clone(true);
  c.position.y = -Math.min(1.4, (box.max.y - box.min.y) * 0.45);   // "đứng" ngang tầm xe
  tmp.add(c); tmp.add(new THREE.AmbientLight(0xffffff, 0.15));
  tmp.background = new THREE.Color(0x0b0c10);
  const pm = new THREE.PMREMGenerator(R); const env = pm.fromScene(tmp, 0.015, 0.1, 100).texture; pm.dispose();
  roomSize = Math.max(box.max.x - box.min.x, box.max.z - box.min.z); setupShadowCam();
  return env;
}
export function prepShowroom(root) {
  root.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = false; } });
}
export function prepCar(group) {
  group.traverse(o => {
    if (!o.isMesh) return; const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const glass = m && (m.transparent && m.opacity < 0.9);
    o.castShadow = !glass; o.receiveShadow = true;
  });
}

// ---- phản chiếu sàn: gương phẳng phủ mờ lên sàn bóng ----
let reflectStrength = 0.32, reflectBlur = 1.5;
const MirrorShader = {
  name: 'BlurredFloorReflection',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, strength: { value: 0.32 }, texel: { value: new THREE.Vector2(1 / 512, 1 / 512) }, blur: { value: 1.5 } },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main(){ vUv = textureMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; uniform float strength; uniform vec2 texel; uniform float blur; varying vec4 vUv;
    #include <logdepthbuf_pars_fragment>
    void main(){
      #include <logdepthbuf_fragment>
      vec2 uv = vUv.xy / vUv.w; vec3 c = vec3(0.0); float w = 0.0;
      for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) { float k = exp(-float(x*x + y*y) / 4.0); c += texture2D(tDiffuse, uv + vec2(float(x), float(y)) * texel * blur).rgb * k; w += k; }
      c /= w;
      gl_FragColor = vec4(c * color, strength);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
let floorArgs = null;
export function addFloorMirror(size, y = 0.0015) {
  floorArgs = [size, y];
  if (mirror) { S.remove(mirror); mirror.dispose(); mirror = null; }
  if (!Q.reflect) return null;
  const W = Math.max(256, Math.round(window.innerWidth * window.devicePixelRatio * Q.reflect));
  const H = Math.max(256, Math.round(window.innerHeight * window.devicePixelRatio * Q.reflect * 0.5));
  mirror = new Reflector(new THREE.PlaneGeometry(size, size), { textureWidth: W, textureHeight: H, clipBias: 0.0003, color: 0xb8bcc8, multisample: 0, shader: MirrorShader });
  mirror.material.transparent = true; mirror.material.depthWrite = false;
  mirror.material.uniforms.texel.value.set(1 / W, 1 / H);
  mirror.rotation.x = -Math.PI / 2; mirror.position.y = y; mirror.renderOrder = 1;
  // không vẽ lồng trong lượt render chính (hỏng trạng thái khi chia 2 khung nhìn) -> tự gọi trước mỗi khung
  mirror.userData.update = mirror.onBeforeRender; mirror.onBeforeRender = () => { };
  mirror.updateMatrixWorld(true);
  mirror.visible = reflectStrength > 0;
  mirror.material.uniforms.strength.value = reflectStrength; mirror.material.uniforms.blur.value = reflectBlur;
  S.add(mirror); return mirror;
}
export function setReflect(strength, blur) {
  reflectStrength = strength; reflectBlur = blur;
  if (!mirror) return;
  mirror.material.uniforms.strength.value = strength; mirror.material.uniforms.blur.value = blur;
  mirror.visible = strength > 0 && Q.reflect > 0;
}

// ---- bóng tiếp xúc mềm dưới gầm xe (tính 1 lần) ----
const blurH = new THREE.ShaderMaterial(HorizontalBlurShader), blurV = new THREE.ShaderMaterial(VerticalBlurShader);
blurH.depthTest = blurV.depthTest = false;
export function bakeContactShadow(car, opts = {}) {
  const res = Q.contact || 512; const darkness = opts.darkness ?? 1.25; const height = opts.height ?? 0.9;
  if (car.contact) { car.contact.group.parent && car.contact.group.parent.remove(car.contact.group); car.contact.rt.dispose(); car.contact.rtB.dispose(); }
  const b = car.lbAll; const w = (b.max.x - b.min.x) + 1.0, d = (b.max.z - b.min.z) + 1.0;
  const cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2;
  const g = new THREE.Group(); g.position.set(cx, 0.003, cz); car.group.add(g); car.group.updateMatrixWorld(true);
  const rt = new THREE.WebGLRenderTarget(res, res); rt.texture.generateMipmaps = false;
  const rtB = new THREE.WebGLRenderTarget(res, res); rtB.texture.generateMipmaps = false;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: rt.texture, opacity: opts.opacity ?? 0.92, transparent: true, depthWrite: false }));
  plane.renderOrder = 1; plane.scale.y = -1; g.add(plane);
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0, height); cam.rotation.x = Math.PI / 2; g.add(cam); cam.updateMatrixWorld(true);
  const depthMat = new THREE.MeshDepthMaterial(); depthMat.userData.darkness = { value: darkness };
  depthMat.onBeforeCompile = sh => { sh.uniforms.darkness = depthMat.userData.darkness; sh.fragmentShader = 'uniform float darkness;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );'); };
  depthMat.depthTest = false; depthMat.depthWrite = false;
  // chỉ vẽ xe này
  const LAYER = 7; car.inner.traverse(o => o.isMesh && o.visible && o.layers.enable(LAYER)); cam.layers.set(LAYER);
  const oldOverride = S.overrideMaterial, oldBg = S.background, oldClear = R.getClearAlpha(), oldTarget = R.getRenderTarget(), oldScissor = R.getScissorTest();
  const oldEnv = S.environment;
  S.overrideMaterial = depthMat; S.background = null; R.setClearAlpha(0); R.setScissorTest(false);
  R.setRenderTarget(rt); R.clear(); R.render(S, cam);
  S.overrideMaterial = null;
  // làm mềm 2 lượt
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); const qs = new THREE.Scene(); qs.add(quad); const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blur = (amt) => {
    quad.material = blurH; blurH.uniforms.tDiffuse.value = rt.texture; blurH.uniforms.h.value = amt / 256; R.setRenderTarget(rtB); R.clear(); R.render(qs, qc);
    quad.material = blurV; blurV.uniforms.tDiffuse.value = rtB.texture; blurV.uniforms.v.value = amt / 256; R.setRenderTarget(rt); R.clear(); R.render(qs, qc);
  };
  blur(opts.blur ?? 2.2); blur((opts.blur ?? 2.2) * 0.45);
  R.setRenderTarget(oldTarget); S.overrideMaterial = oldOverride; S.background = oldBg; S.environment = oldEnv; R.setClearAlpha(oldClear); R.setScissorTest(oldScissor);
  car.inner.traverse(o => o.isMesh && o.layers.disable(LAYER));
  quad.geometry.dispose(); g.remove(cam);
  car.contact = { group: g, rt, rtB, plane };
}

// vẽ ảnh phản chiếu cho 1 camera (gọi ngay trước khi render khung nhìn của camera đó)
export function renderReflection(camera) {
  if (!mirror || !mirror.visible || !mirror.userData.update) return;
  const sc = R.getScissorTest(); R.setScissorTest(false);
  mirror.userData.update(R, S, camera);
  R.setScissorTest(sc);
}
