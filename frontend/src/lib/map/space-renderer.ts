import {
  detectSpaceCapabilities,
  resolveSpaceQuality,
  SPACE_QUALITY_CONFIG,
  type SpaceQualityLevel,
} from "@/lib/map/space-quality";

const FLOATS_PER_STAR = 8;
const SKY_PARALLAX = 0.07;
const STAR_PARALLAX = 0.1;

const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 v_ndc;
void main() {
  vec2 position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_ndc = position * 2.0 - 1.0;
  gl_Position = vec4(v_ndc, 0.0, 1.0);
}`;

// Fully procedural deep-space sky: a tilted galactic band built from seamless
// 3D value-noise sampled on the view ray. No raster texture — the result is
// resolution-independent (crisp like vector art at any DPR) and needs zero
// download or image decode.
const SKY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform float u_aspect;
uniform float u_haze;
uniform float u_pitch;
uniform float u_tan_half_fov;
uniform float u_yaw;
uniform int u_octaves;
in vec2 v_ndc;
out vec4 frag_color;

vec3 rotate_x(vec3 value, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return vec3(value.x, cosine * value.y - sine * value.z, sine * value.y + cosine * value.z);
}

vec3 rotate_y(vec3 value, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return vec3(cosine * value.x + sine * value.z, value.y, -sine * value.x + cosine * value.z);
}

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * noise(p);
    p *= 2.02;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 ray = normalize(vec3(v_ndc.x * u_aspect * u_tan_half_fov, v_ndc.y * u_tan_half_fov, 1.0));
  ray = rotate_y(rotate_x(ray, -u_pitch * ${SKY_PARALLAX.toFixed(2)}), -u_yaw * ${SKY_PARALLAX.toFixed(2)});

  // deep-space base with a faint vertical falloff
  vec3 color = mix(vec3(0.010, 0.013, 0.024), vec3(0.004, 0.005, 0.012), ray.y * 0.5 + 0.5);

  if (u_octaves > 0) {
    // galactic band: a wide, soft, tilted great circle
    float band = ray.y * 0.86 + ray.x * 0.51;
    float band_mask = exp(-band * band / 0.22);

    // seamless dust — sampled on the 3D direction so it never seams or stretches
    float dust = fbm(ray * 3.4, u_octaves);
    float dust_fine = fbm(ray * 7.3 + 11.0, u_octaves);

    // the band glows continuously; the dust only mottles it (never fully dark),
    // so the Milky Way reads as a soft, faint luminous band rather than blotches
    float mottle = 0.5 + 0.5 * (dust * 0.7 + dust_fine * 0.3);
    float glow = band_mask * mottle;
    float core = pow(band_mask, 2.4) * (0.55 + 0.45 * dust);

    vec3 cool = vec3(0.42, 0.5, 0.68);
    vec3 warm = vec3(0.56, 0.46, 0.5);
    vec3 tint = mix(cool, warm, dust_fine);

    // faint all-sky dust so space reads as textured depth, never flat black
    float ambient = smoothstep(0.4, 0.95, dust) * 0.6 + 0.4 * dust_fine * dust_fine;

    color += vec3(0.07, 0.08, 0.13) * ambient * 0.4 * u_haze;
    color += tint * glow * 0.26 * u_haze;
    color += vec3(0.5, 0.55, 0.7) * core * 0.13 * u_haze;
  }

  frag_color = vec4(color, 1.0);
}`;

const STAR_VERTEX_SHADER = `#version 300 es
precision highp float;
in vec3 a_direction;
in float a_brightness;
in float a_temperature;
in float a_size;
in float a_phase;
in float a_speed;
uniform float u_aspect;
uniform float u_pitch;
uniform float u_pixel_ratio;
uniform float u_tan_half_fov;
uniform float u_time;
uniform float u_twinkle;
uniform float u_yaw;
out vec3 v_color;
out float v_brightness;

vec3 rotate_x(vec3 value, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return vec3(value.x, cosine * value.y - sine * value.z, sine * value.y + cosine * value.z);
}

vec3 rotate_y(vec3 value, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return vec3(cosine * value.x + sine * value.z, value.y, -sine * value.x + cosine * value.z);
}

void main() {
  vec3 direction = rotate_x(rotate_y(a_direction, u_yaw * ${STAR_PARALLAX.toFixed(2)}), u_pitch * ${STAR_PARALLAX.toFixed(2)});
  // Fade stars in/out across the view-sphere edge instead of a hard cutoff, so
  // they don't pop (blink) as the camera rotates them past the horizon.
  float visible = smoothstep(0.0, 0.14, direction.z);
  vec2 projected = direction.xy / max(direction.z * u_tan_half_fov, 0.001);
  projected.x /= u_aspect;
  gl_Position = direction.z > 0.0 ? vec4(projected, 0.0, 1.0) : vec4(2.0, 2.0, 0.0, 1.0);
  float shimmer = 1.0 + sin(u_time * a_speed + a_phase) * u_twinkle;
  // Keep points >=1.5px: sub-pixel points scintillate/flicker while panning.
  gl_PointSize = clamp(a_size * u_pixel_ratio, 1.5, 3.8);
  vec3 warm = vec3(1.0, 0.72, 0.5);
  vec3 neutral = vec3(1.0, 0.96, 0.88);
  vec3 cool = vec3(0.66, 0.78, 1.0);
  v_color = a_temperature < 0.5
    ? mix(warm, neutral, a_temperature * 2.0)
    : mix(neutral, cool, (a_temperature - 0.5) * 2.0);
  v_brightness = a_brightness * shimmer * visible;
}`;

const STAR_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_brightness;
out vec4 frag_color;
void main() {
  float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float core = smoothstep(1.0, 0.0, radius);
  float glow = pow(max(0.0, 1.0 - radius), 2.4);
  float alpha = (core * 0.92 + glow * 0.4) * v_brightness;
  frag_color = vec4(v_color * alpha, alpha);
}`;

interface BatteryManagerLike extends EventTarget {
  charging: boolean;
  level: number;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManagerLike>;
}

interface SpacePrograms {
  sky: WebGLProgram;
  stars: WebGLProgram;
}

interface SpaceUniforms {
  sky: {
    aspect: WebGLUniformLocation;
    haze: WebGLUniformLocation;
    octaves: WebGLUniformLocation;
    pitch: WebGLUniformLocation;
    tanHalfFov: WebGLUniformLocation;
    yaw: WebGLUniformLocation;
  };
  stars: {
    aspect: WebGLUniformLocation;
    pitch: WebGLUniformLocation;
    pixelRatio: WebGLUniformLocation;
    tanHalfFov: WebGLUniformLocation;
    time: WebGLUniformLocation;
    twinkle: WebGLUniformLocation;
    yaw: WebGLUniformLocation;
  };
}

export interface SpaceRendererResult {
  level: SpaceQualityLevel;
  renderer: SpaceRenderer | null;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createStarData(count: number, seed = 0x4c4f4349): Float32Array {
  const random = seededRandom(seed);
  const data = new Float32Array(count * FLOATS_PER_STAR);
  for (let index = 0; index < count; index += 1) {
    const longitude = random() * Math.PI * 2;
    const vertical = random() * 2 - 1;
    const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const offset = index * FLOATS_PER_STAR;
    data[offset] = Math.cos(longitude) * horizontal;
    data[offset + 1] = vertical;
    data[offset + 2] = Math.sin(longitude) * horizontal;
    // brightness: a dense floor of visible stars for depth, a long tail of bright ones
    data[offset + 3] = 0.4 + Math.pow(random(), 2.4) * 0.6;
    data[offset + 4] = random();
    // size: mostly small, a good number of brighter stars bloom larger
    data[offset + 5] = 0.9 + Math.pow(random(), 4.0) * 2.8;
    data[offset + 6] = random() * Math.PI * 2;
    data[offset + 7] = 0.16 + random() * 0.28;
  }
  return data;
}

export function shortestAngleDelta(from: number, to: number): number {
  return ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("space shader allocation failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "space shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("space program allocation failed");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "space program linking failed";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function requiredUniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`space uniform missing: ${name}`);
  return location;
}

function getContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  return canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    // No `desynchronized`: as a background layer alpha-composited under the map
    // canvas it gains nothing from low-latency mode, and the desync'd surface can
    // tear/flicker against the map on some compositors.
    failIfMajorPerformanceCaveat: true,
    powerPreference: "default",
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false,
  });
}

export function createSpaceRenderer(
  canvas: HTMLCanvasElement,
  onLevelChange?: (level: SpaceQualityLevel) => void,
): SpaceRendererResult {
  const level = resolveSpaceQuality(detectSpaceCapabilities());
  canvas.dataset.quality = level;
  if (level === "low") return { level, renderer: null };

  const gl = getContext(canvas);
  if (!gl) {
    canvas.dataset.quality = "fallback";
    return { level: "fallback", renderer: null };
  }

  try {
    const renderer = new SpaceRenderer(canvas, gl, level, onLevelChange);
    return { level, renderer };
  } catch (error) {
    console.warn("space renderer unavailable", error);
    canvas.dataset.quality = "fallback";
    return { level: "fallback", renderer: null };
  }
}

export class SpaceRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly onLevelChange?: (level: SpaceQualityLevel) => void;
  private readonly programs: SpacePrograms;
  private readonly uniforms: SpaceUniforms;
  private readonly vao: WebGLVertexArrayObject;
  private readonly starBuffer: WebGLBuffer;
  private readonly resizeObserver: ResizeObserver;
  private battery: BatteryManagerLike | null = null;
  private currentPitch = 0;
  private currentYaw = 0;
  private disposed = false;
  private effectiveStarCount: number;
  private frameAverage = 0;
  private frameSamples = 0;
  private globeVisible = true;
  private haze: number;
  private idleFps: number;
  private interactionActive = false;
  private lastFrameAt = 0;
  private lastLongitude: number | null = null;
  private lastRenderAt = 0;
  private level: Exclude<SpaceQualityLevel, "fallback" | "low">;
  private nebulaOctaves: number;
  private needsResize = true;
  private renderScale = 1;
  private starCapacity: number;
  private suspended = false;
  private targetPitch = 0;
  private targetYaw = 0;
  private timeout = 0;
  private twinkle: number;
  private animationFrame = 0;

  constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    level: Exclude<SpaceQualityLevel, "fallback" | "low">,
    onLevelChange?: (level: SpaceQualityLevel) => void,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.level = level;
    this.onLevelChange = onLevelChange;
    const config = SPACE_QUALITY_CONFIG[level];
    this.effectiveStarCount = config.starCount;
    this.starCapacity = config.starCount;
    this.haze = config.haze;
    this.idleFps = config.idleFps;
    this.twinkle = config.twinkle;
    this.nebulaOctaves = config.nebulaOctaves;

    this.programs = {
      sky: createProgram(gl, FULLSCREEN_VERTEX_SHADER, SKY_FRAGMENT_SHADER),
      stars: createProgram(gl, STAR_VERTEX_SHADER, STAR_FRAGMENT_SHADER),
    };
    this.uniforms = {
      sky: {
        aspect: requiredUniform(gl, this.programs.sky, "u_aspect"),
        haze: requiredUniform(gl, this.programs.sky, "u_haze"),
        octaves: requiredUniform(gl, this.programs.sky, "u_octaves"),
        pitch: requiredUniform(gl, this.programs.sky, "u_pitch"),
        tanHalfFov: requiredUniform(gl, this.programs.sky, "u_tan_half_fov"),
        yaw: requiredUniform(gl, this.programs.sky, "u_yaw"),
      },
      stars: {
        aspect: requiredUniform(gl, this.programs.stars, "u_aspect"),
        pitch: requiredUniform(gl, this.programs.stars, "u_pitch"),
        pixelRatio: requiredUniform(gl, this.programs.stars, "u_pixel_ratio"),
        tanHalfFov: requiredUniform(gl, this.programs.stars, "u_tan_half_fov"),
        time: requiredUniform(gl, this.programs.stars, "u_time"),
        twinkle: requiredUniform(gl, this.programs.stars, "u_twinkle"),
        yaw: requiredUniform(gl, this.programs.stars, "u_yaw"),
      },
    };
    const vao = gl.createVertexArray();
    const starBuffer = gl.createBuffer();
    if (!vao || !starBuffer) throw new Error("space buffer allocation failed");
    this.vao = vao;
    this.starBuffer = starBuffer;
    this.uploadStars(config.starCount);

    this.resizeObserver = new ResizeObserver(() => {
      this.needsResize = true;
      this.schedule();
    });
    this.resizeObserver.observe(canvas);
    document.addEventListener("visibilitychange", this.handleVisibility);
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    void this.observeBattery();
    // The sky is procedural, so nothing to download — reveal the canvas as soon
    // as the first frame paints over the CSS deep-space fallback.
    canvas.dataset.ready = "true";
    this.schedule();
  }

  setOrientation(longitude: number, latitude: number): void {
    const longitudeRadians = longitude * Math.PI / 180;
    if (this.lastLongitude === null) {
      this.lastLongitude = longitudeRadians;
      this.currentPitch = latitude * Math.PI / 180;
      this.targetPitch = this.currentPitch;
    } else {
      this.targetYaw += shortestAngleDelta(this.lastLongitude, longitudeRadians);
      this.lastLongitude = longitudeRadians;
      this.targetPitch = latitude * Math.PI / 180;
    }
    this.schedule();
  }

  setInteractionActive(active: boolean): void {
    this.interactionActive = active;
    this.schedule();
  }

  setGlobeVisible(visible: boolean): void {
    if (this.suspended) return;
    if (this.globeVisible === visible) return;
    this.globeVisible = visible;
    if (visible) this.schedule();
    else this.cancelScheduledFrame();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelScheduledFrame();
    this.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    if (this.battery) {
      this.battery.removeEventListener("chargingchange", this.handleBatteryChange);
      this.battery.removeEventListener("levelchange", this.handleBatteryChange);
    }
    this.gl.deleteBuffer(this.starBuffer);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.programs.sky);
    this.gl.deleteProgram(this.programs.stars);
    this.canvas.removeAttribute("data-ready");
    this.canvas.width = 1;
    this.canvas.height = 1;
  }

  private uploadStars(count: number): void {
    const gl = this.gl;
    const data = createStarData(count);
    this.starCapacity = count;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = FLOATS_PER_STAR * Float32Array.BYTES_PER_ELEMENT;
    const attributes: Array<[string, number, number]> = [
      ["a_direction", 3, 0],
      ["a_brightness", 1, 3],
      ["a_temperature", 1, 4],
      ["a_size", 1, 5],
      ["a_phase", 1, 6],
      ["a_speed", 1, 7],
    ];
    for (const [name, size, offset] of attributes) {
      const location = gl.getAttribLocation(this.programs.stars, name);
      if (location < 0) continue;
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT);
    }
    gl.bindVertexArray(null);
  }

  private schedule(): void {
    if (
      this.disposed ||
      this.animationFrame ||
      this.timeout ||
      !this.globeVisible ||
      document.visibilityState === "hidden"
    ) return;
    const settled = Math.abs(this.targetYaw - this.currentYaw) < 0.0001 && Math.abs(this.targetPitch - this.currentPitch) < 0.0001;
    if (!this.interactionActive && settled && this.idleFps <= 0) return;
    if (!this.interactionActive && settled) {
      this.timeout = window.setTimeout(() => {
        this.timeout = 0;
        this.animationFrame = window.requestAnimationFrame(this.renderFrame);
      }, Math.max(16, 1_000 / this.idleFps));
      return;
    }
    this.animationFrame = window.requestAnimationFrame(this.renderFrame);
  }

  private cancelScheduledFrame(): void {
    if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
    if (this.timeout) window.clearTimeout(this.timeout);
    this.animationFrame = 0;
    this.timeout = 0;
  }

  private readonly renderFrame = (timestamp: number): void => {
    this.animationFrame = 0;
    if (this.disposed || !this.globeVisible || document.visibilityState === "hidden") return;
    const config = SPACE_QUALITY_CONFIG[this.level];
    const frameDelta = this.lastFrameAt > 0 ? Math.min(50, timestamp - this.lastFrameAt) : 16.67;
    this.lastFrameAt = timestamp;
    const damping = 1 - Math.exp(-frameDelta / 180);
    this.currentYaw += (this.targetYaw - this.currentYaw) * damping;
    this.currentPitch += (this.targetPitch - this.currentPitch) * damping;

    const maximumFrameRate = Math.max(1, config.maxFps);
    const minimumInterval = 1_000 / maximumFrameRate;
    if (this.lastRenderAt === 0 || timestamp - this.lastRenderAt >= minimumInterval * 0.82) {
      const renderedDelta = this.lastRenderAt > 0 ? timestamp - this.lastRenderAt : minimumInterval;
      this.lastRenderAt = timestamp;
      this.render(timestamp);
      if (this.interactionActive) this.recordFrameTime(renderedDelta);
    }
    this.schedule();
  };

  private render(timestamp: number): void {
    const gl = this.gl;
    const config = SPACE_QUALITY_CONFIG[this.level];
    if (this.needsResize) this.resize();
    const width = Math.max(1, this.canvas.width);
    const height = Math.max(1, this.canvas.height);
    const aspect = width / height;
    const tanHalfFov = Math.tan(5 * Math.PI / 24);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.disable(gl.BLEND);
    gl.useProgram(this.programs.sky);
    gl.uniform1f(this.uniforms.sky.aspect, aspect);
    gl.uniform1f(this.uniforms.sky.haze, this.haze);
    gl.uniform1i(this.uniforms.sky.octaves, this.nebulaOctaves);
    gl.uniform1f(this.uniforms.sky.pitch, this.currentPitch);
    gl.uniform1f(this.uniforms.sky.tanHalfFov, tanHalfFov);
    gl.uniform1f(this.uniforms.sky.yaw, this.currentYaw);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.programs.stars);
    gl.uniform1f(this.uniforms.stars.aspect, aspect);
    gl.uniform1f(this.uniforms.stars.pitch, this.currentPitch);
    gl.uniform1f(this.uniforms.stars.pixelRatio, Math.min(window.devicePixelRatio || 1, config.pixelRatioCap) * this.renderScale);
    gl.uniform1f(this.uniforms.stars.tanHalfFov, tanHalfFov);
    gl.uniform1f(this.uniforms.stars.time, timestamp / 1_000);
    gl.uniform1f(this.uniforms.stars.twinkle, this.twinkle);
    gl.uniform1f(this.uniforms.stars.yaw, this.currentYaw);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, Math.min(this.effectiveStarCount, this.starCapacity));
    gl.bindVertexArray(null);
  }

  private resize(): void {
    const config = SPACE_QUALITY_CONFIG[this.level];
    const ratio = Math.min(window.devicePixelRatio || 1, config.pixelRatioCap) * this.renderScale;
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.needsResize = false;
  }

  private recordFrameTime(frameTime: number): void {
    const config = SPACE_QUALITY_CONFIG[this.level];
    this.frameAverage = this.frameSamples === 0 ? frameTime : this.frameAverage * 0.92 + frameTime * 0.08;
    this.frameSamples += 1;
    if (this.frameSamples < 120) return;
    const target = 1_000 / Math.min(config.maxFps, 60);
    if (this.frameAverage <= target * 1.28) {
      this.frameSamples = 0;
      return;
    }

    if (this.renderScale > config.minRenderScale + 0.01) {
      this.renderScale = Math.max(config.minRenderScale, this.renderScale - 0.15);
      this.needsResize = true;
    } else if (this.effectiveStarCount > Math.max(1_800, config.starCount * 0.45)) {
      this.effectiveStarCount = Math.max(1_800, Math.floor(this.effectiveStarCount * 0.7));
    } else if (this.nebulaOctaves > 0) {
      this.nebulaOctaves = 0;
      this.haze = 0;
      this.twinkle *= 0.5;
    } else if (this.frameAverage > target * 2.1) {
      this.suspendToFallback();
    }
    this.frameAverage = 0;
    this.frameSamples = 0;
  }

  private suspendToFallback(): void {
    this.suspended = true;
    this.globeVisible = false;
    this.cancelScheduledFrame();
    this.canvas.removeAttribute("data-ready");
    this.canvas.dataset.quality = "fallback";
    this.onLevelChange?.("fallback");
  }

  private async observeBattery(): Promise<void> {
    let battery: BatteryManagerLike | undefined;
    try {
      battery = await (navigator as NavigatorWithBattery).getBattery?.();
    } catch {
      return;
    }
    if (!battery || this.disposed) return;
    this.battery = battery;
    battery.addEventListener("chargingchange", this.handleBatteryChange);
    battery.addEventListener("levelchange", this.handleBatteryChange);
    this.handleBatteryChange();
  }

  private readonly handleBatteryChange = (): void => {
    if (!this.battery || this.battery.charging || this.battery.level >= 0.2) return;
    this.idleFps = 0;
    this.twinkle = 0;
    this.haze = 0;
    this.nebulaOctaves = 0;
    this.cancelScheduledFrame();
    if (this.interactionActive) this.schedule();
  };

  private readonly handleVisibility = (): void => {
    if (document.visibilityState === "hidden") {
      this.cancelScheduledFrame();
      return;
    }
    this.schedule();
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.suspendToFallback();
  };
}
