'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

import { format } from '@raseed/money'
import type { CorridorFlow } from './corridor'

/**
 * The India ⇄ UAE corridor, in real WebGL.
 *
 * Three documents cut a 3D globe — "impressive-looking, tells you nothing" — and they were
 * right about a globe. Krishna has since asked for real WebGL explicitly, so this is the
 * version that earns it: **every particle is a unit of money you actually moved.** Count is
 * proportional to volume, speed to efficiency, and the two shores are the two currencies. A
 * globe would have decorated the page; this encodes the one relationship the app exists for.
 *
 * No three.js. r3f plus three is ~600KB on a dashboard whose entire point is that heavy work
 * happens locally and fast; this is a few hundred lines of raw GL doing one draw call. The
 * earlier CSS-3D version stays in `corridor.tsx` as the no-WebGL fallback, which is what makes
 * this safe to ship — progressive enhancement, not a hard dependency on a GPU.
 *
 * Invariants honoured, because they are easy to lose in a canvas:
 *   - Colours are read from CSS custom properties at draw time and **re-read on theme
 *     change**, so the corridor recolours with the rest of the app rather than freezing on
 *     whatever the palette was at mount.
 *   - `useReducedMotion` stops the clock and paints one static frame. The picture is still
 *     complete; it simply does not move.
 *   - The loop pauses when the canvas is off-screen. A dashboard that keeps a GPU busy in a
 *     background tab is a battery bug with a nice gradient on it.
 */

const VERT = `
attribute float a_seed;
uniform float u_time;
uniform vec2 u_from;
uniform vec2 u_to;
uniform vec2 u_ctrl;
uniform float u_speed;
uniform float u_dpr;
varying float v_t;
varying float v_fade;

void main() {
  // Each particle owns a phase; the whole stream is one quadratic Bezier walked at once.
  float t = fract(a_seed + u_time * u_speed);
  float mt = 1.0 - t;

  vec2 p = mt * mt * u_from + 2.0 * mt * t * u_ctrl + t * t * u_to;

  // Scatter across the width of the lane, tighter at the ends so it reads as a channel
  // rather than a cloud — money leaves one place and arrives at another.
  float spread = sin(t * 3.14159) * 0.06;
  float jitter = (fract(a_seed * 91.7) - 0.5) * 2.0;
  p.y += jitter * spread;

  gl_Position = vec4(p, 0.0, 1.0);
  gl_PointSize = (1.6 + 2.2 * sin(t * 3.14159)) * u_dpr;
  v_t = t;
  // Fade in and out at the shores so particles do not pop into existence.
  v_fade = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.88, 1.0, t));
}
`

const FRAG = `
precision mediump float;
uniform vec3 u_inr;
uniform vec3 u_aed;
varying float v_t;
varying float v_fade;

void main() {
  // Round point, soft edge. gl_PointCoord is the only cheap way to get a disc.
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  float alpha = (1.0 - smoothstep(0.06, 0.25, r)) * v_fade;

  // Currency as temperature: brass leaving India, verdigris arriving in the UAE.
  vec3 c = mix(u_inr, u_aed, smoothstep(0.1, 0.9, v_t));
  gl_FragColor = vec4(c, alpha * 0.85);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh)
    return null
  }
  return sh
}

/** `#RRGGBB` or `rgb(r g b)` from a computed custom property → 0–1 triple for the shader. */
function toRgb(value: string): [number, number, number] {
  const v = value.trim()
  if (v.startsWith('#')) {
    const h = v.slice(1)
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    return [
      parseInt(full.slice(0, 2), 16) / 255,
      parseInt(full.slice(2, 4), 16) / 255,
      parseInt(full.slice(4, 6), 16) / 255,
    ]
  }
  const nums = v.match(/[\d.]+/g)
  if (!nums || nums.length < 3) return [1, 1, 1]
  return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255]
}

export function CorridorGL({
  flows,
  className,
  onUnsupported,
}: {
  flows: readonly CorridorFlow[]
  className?: string
  /** Called once if WebGL is unavailable, so the caller can render the CSS version instead. */
  onUnsupported?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduceMotion = useReducedMotion()
  const [failed, setFailed] = useState(false)

  const total = flows.reduce((a, f) => a + f.outbound.minor, 0)
  const meanEfficiency =
    flows.length === 0 ? 1 : flows.reduce((a, f) => a + f.efficiency, 0) / flows.length

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { antialias: true, alpha: true })
    if (!gl) {
      setFailed(true)
      onUnsupported?.()
      return
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const prog = vs && fs ? gl.createProgram() : null
    if (!vs || !fs || !prog) {
      setFailed(true)
      onUnsupported?.()
      return
    }
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setFailed(true)
      onUnsupported?.()
      return
    }
    gl.useProgram(prog)

    // Particle count tracks volume, floored so an empty corridor still reads as a corridor
    // and capped so a big month cannot melt a laptop.
    const count = Math.max(120, Math.min(1400, Math.round(total / 2000) + 120))
    const seeds = new Float32Array(count)
    // Deterministic scatter — no Math.random, so two loads look identical and a screenshot
    // taken today reproduces. Same discipline as the seeded demo ledger.
    for (let i = 0; i < count; i++) seeds[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW)
    const aSeed = gl.getAttribLocation(prog, 'a_seed')
    gl.enableVertexAttribArray(aSeed)
    gl.vertexAttribPointer(aSeed, 1, gl.FLOAT, false, 0, 0)

    const u = {
      time: gl.getUniformLocation(prog, 'u_time'),
      from: gl.getUniformLocation(prog, 'u_from'),
      to: gl.getUniformLocation(prog, 'u_to'),
      ctrl: gl.getUniformLocation(prog, 'u_ctrl'),
      speed: gl.getUniformLocation(prog, 'u_speed'),
      dpr: gl.getUniformLocation(prog, 'u_dpr'),
      inr: gl.getUniformLocation(prog, 'u_inr'),
      aed: gl.getUniformLocation(prog, 'u_aed'),
    }

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // Read the palette from CSS rather than importing hex. Re-read whenever the theme
    // attribute changes, or the corridor keeps the colours it was born with.
    let inr: [number, number, number] = [1, 1, 1]
    let aed: [number, number, number] = [1, 1, 1]
    const readPalette = () => {
      const cs = getComputedStyle(document.documentElement)
      inr = toRgb(cs.getPropertyValue('--inr'))
      aed = toRgb(cs.getPropertyValue('--aed'))
    }
    readPalette()
    const themeObserver = new MutationObserver(readPalette)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w === 0 || h === 0) return
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // A slower stream where the corridor is expensive: efficiency 1 flows freely, a 3%
    // haircut visibly drags. The metaphor is the measurement.
    const speed = 0.06 + meanEfficiency * 0.14

    let raf = 0
    let visible = true
    const io = new IntersectionObserver(([e]) => {
      visible = e?.isIntersecting ?? true
      if (visible && !reduceMotion && !raf) raf = requestAnimationFrame(frame)
    })
    io.observe(canvas)

    const start = performance.now()
    function frame(now: number) {
      raf = 0
      if (!gl) return
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.uniform1f(u.time, reduceMotion ? 0.35 : (now - start) / 1000)
      gl.uniform2f(u.from, -0.86, -0.34)
      gl.uniform2f(u.to, 0.86, 0.3)
      gl.uniform2f(u.ctrl, 0, 0.92)
      gl.uniform1f(u.speed, speed)
      gl.uniform1f(u.dpr, dpr)
      gl.uniform3fv(u.inr, inr)
      gl.uniform3fv(u.aed, aed)

      gl.drawArrays(gl.POINTS, 0, count)

      if (!reduceMotion && visible) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      themeObserver.disconnect()
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [total, meanEfficiency, reduceMotion, onUnsupported])

  if (failed) return null

  return (
    <figure className={className}>
      <div className="relative h-48 w-full overflow-hidden rounded-lg bg-surface-2/40">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          // The canvas is decoration over a figure whose numbers are in the caption below;
          // a screen reader gets the sentence, not a description of moving dots.
          aria-hidden
        />
        <span className="absolute bottom-2 left-3 font-mono text-[10px] tracking-wide text-text-lo">
          INDIA
        </span>
        <span className="absolute right-3 top-2 font-mono text-[10px] tracking-wide text-text-lo">
          UAE
        </span>
      </div>
      <figcaption className="mt-2 text-xs leading-relaxed text-text-lo">
        {flows.length === 0
          ? 'No corridor activity in this window.'
          : `${format(flows[0]!.outbound)} moved across ${flows.length} ${flows.length === 1 ? 'transfer' : 'transfers'}. Each particle is money you actually sent; the stream runs slower the more the corridor costs you.`}
      </figcaption>
    </figure>
  )
}
