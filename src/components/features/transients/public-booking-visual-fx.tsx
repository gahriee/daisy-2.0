"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

const VERTEX_SHADER_SRC = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform float u_intensity;

  void main() {
    vec2 uv = v_uv;
    float t = u_time * 0.22;

    // Gentle silk-wave interference field tuned to Daisy's stone, blush & Rausch tokens
    float w1 = sin(uv.x * 3.2 + t + u_mouse.x * 0.8) * cos(uv.y * 2.6 - t * 0.85);
    float w2 = sin((uv.x * 2.1 - uv.y * 2.9) + t * 1.15 + u_mouse.y * 0.7);
    float w3 = cos(length(uv - (0.5 + (u_mouse - 0.5) * 0.18)) * 4.5 - t * 1.1);
    float blend = clamp((w1 * 0.4 + w2 * 0.35 + w3 * 0.25) * 0.5 + 0.5, 0.0, 1.0);

    vec3 cSurface = vec3(1.0, 1.0, 1.0);          // #ffffff
    vec3 cStone   = vec3(0.969, 0.969, 0.969);    // #f7f7f7
    vec3 cBlush   = vec3(1.0, 0.910, 0.933);      // #ffe8ee
    vec3 cRausch  = vec3(0.878, 0.043, 0.255);    // #e00b41

    vec3 col = mix(cStone, cSurface, smoothstep(0.0, 0.55, blend));
    col = mix(col, cBlush, smoothstep(0.38, 0.88, blend) * u_intensity);
    float ribbon = smoothstep(0.84, 0.99, blend) * 0.12 * u_intensity;
    col = mix(col, cRausch, ribbon);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

type WebGLAmbientFieldProps = {
  className?: string;
  intensity?: number;
};

/**
 * Zero-dependency WebGL silk-wave shader backdrop tuned to Daisy's Rausch,
 * blush, stone, and white tokens. Automatically pauses off-screen and falls
 * back to a calm CSS gradient when WebGL is unavailable or reduced motion is on.
 */
export function WebGLAmbientField({
  className,
  intensity = 0.85,
}: WebGLAmbientFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mediaReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaReduced.matches) {
      const frame = window.requestAnimationFrame(() => setFallback(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      const frame = window.requestAnimationFrame(() => setFallback(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vs || !fs) {
      const frame = window.requestAnimationFrame(() => setFallback(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const program = gl.createProgram();
    if (!program) {
      const frame = window.requestAnimationFrame(() => setFallback(true));
      return () => window.cancelAnimationFrame(frame);
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const frame = window.requestAnimationFrame(() => setFallback(true));
      return () => window.cancelAnimationFrame(frame);
    }

    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posLoc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const timeLoc = gl.getUniformLocation(program, "u_time");
    const mouseLoc = gl.getUniformLocation(program, "u_mouse");
    const intensityLoc = gl.getUniformLocation(program, "u_intensity");

    let mouseX = 0.5;
    let mouseY = 0.5;
    let targetMouseX = 0.5;
    let targetMouseY = 0.5;
    let isVisible = true;
    let rafId = 0;
    const startTime = performance.now();

    function resize() {
      if (!canvas || !gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      targetMouseX = event.clientX / Math.max(1, window.innerWidth);
      targetMouseY = 1 - event.clientY / Math.max(1, window.innerHeight);
    }

    function render(now: number) {
      rafId = 0;
      if (!gl || !isVisible) return;
      resize();
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;
      gl.uniform1f(timeLoc, (now - startTime) * 0.001);
      gl.uniform2f(mouseLoc, mouseX, mouseY);
      gl.uniform1f(intensityLoc, intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafId = window.requestAnimationFrame(render);
    }

    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              const entry = entries[0];
              if (!entry) return;
              isVisible = entry.isIntersecting;
              if (isVisible && !rafId) {
                rafId = window.requestAnimationFrame(render);
              }
            },
            { threshold: 0.01 },
          )
        : null;
    observer?.observe(canvas);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", resize, { passive: true });
    rafId = window.requestAnimationFrame(render);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resize);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [intensity]);

  if (fallback) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "book-animated-mesh pointer-events-none absolute inset-0",
          className,
        )}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full",
        className,
      )}
    />
  );
}

type SelfDrawingLineProps = {
  className?: string;
  align?: "left" | "center";
  width?: number;
};

/**
 * Self-drawing editorial SVG accent line that traces itself smoothly when it
 * scrolls into view, paired with a Rausch-to-blush animated stroke gradient.
 */
export function SelfDrawingLine({
  className,
  align = "center",
  width = 160,
}: SelfDrawingLineProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const mediaReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaReduced.matches || typeof IntersectionObserver === "undefined") {
      const frame = window.requestAnimationFrame(() => setDrawn(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setDrawn(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      viewBox="0 0 180 12"
      fill="none"
      aria-hidden="true"
      style={{ width }}
      className={cn(
        "h-3 overflow-visible",
        align === "center" ? "mx-auto" : "",
        className,
      )}
    >
      <defs>
        <linearGradient id="daisy-draw-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#e00b41" />
          <stop offset="55%" stopColor="#f04b75" />
          <stop offset="100%" stopColor="#ffe8ee" />
        </linearGradient>
      </defs>
      <path
        d="M2 8.5 C 46 2, 132 2, 178 8.5"
        stroke="url(#daisy-draw-grad)"
        strokeWidth="2.2"
        strokeLinecap="round"
        pathLength={1}
        className={cn(
          "book-self-draw-path",
          drawn && "book-self-draw-path-active",
        )}
      />
    </svg>
  );
}

type MorphingAuraProps = {
  className?: string;
};

/**
 * Organic morphing SVG shape with a soft Rausch-blush gradient that gently
 * breathes behind focal elements without introducing boxy wrapper containers.
 */
export function MorphingAura({ className }: MorphingAuraProps) {
  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      aria-hidden="true"
      className={cn("pointer-events-none select-none", className)}
    >
      <defs>
        <linearGradient
          id="daisy-morph-grad"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#ffe8ee" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#ffd5e0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f7f7f7" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path
        className="book-morph-blob"
        fill="url(#daisy-morph-grad)"
        d="M312,118 C355,168 358,248 312,296 C266,344 176,356 118,314 C60,272 48,184 92,126 C136,68 269,68 312,118 Z"
      />
    </svg>
  );
}

type Tilt3DCardProps = {
  children: ReactNode;
  className?: string;
  maxTiltDeg?: number;
};

/**
 * Interactive 3D perspective tilt wrapper with subtle pointer-tracked specular
 * sheen on fine-pointer desktops. Automatically disabled on touch devices and
 * under `prefers-reduced-motion: reduce`.
 */
export function Tilt3DCard({
  children,
  className,
  maxTiltDeg = 6,
}: Tilt3DCardProps) {
  const [transform, setTransform] = useState<string>("");
  const [sheenPos, setSheenPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const canTiltRef = useRef(false);

  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      canTiltRef.current = finePointer.matches && !reduced.matches;
    };
    sync();
    finePointer.addEventListener("change", sync);
    reduced.addEventListener("change", sync);
    return () => {
      finePointer.removeEventListener("change", sync);
      reduced.removeEventListener("change", sync);
    };
  }, []);

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!canTiltRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / Math.max(1, rect.width);
    const py = (event.clientY - rect.top) / Math.max(1, rect.height);
    const rotateY = (px - 0.5) * maxTiltDeg * 2;
    const rotateX = (0.5 - py) * maxTiltDeg * 2;
    setTransform(
      `perspective(960px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.01, 1.01, 1.01)`,
    );
    setSheenPos({ x: px * 100, y: py * 100 });
  }

  function handleMouseLeave() {
    setTransform("");
    setSheenPos(null);
  }

  const style: CSSProperties = {
    transform: transform || undefined,
    transition: transform
      ? "transform 110ms ease-out"
      : "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
    transformStyle: "preserve-3d",
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
      className={cn("relative will-change-transform", className)}
    >
      {children}
      {sheenPos && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-60 transition-opacity duration-200"
          style={{
            background: `radial-gradient(circle at ${sheenPos.x.toFixed(1)}% ${sheenPos.y.toFixed(1)}%, rgb(255 255 255 / 0.28), transparent 58%)`,
          }}
        />
      )}
    </div>
  );
}
