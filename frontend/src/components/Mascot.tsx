/**
 * Finny — Physics mascot 🐾
 * Gravity · Surface detection · Drag-to-place · Walking limbs · Jump · Emotions
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  motion,
  AnimatePresence,
  useMotionValue,
  type MotionValue,
} from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { X } from 'lucide-react'

// ── Physics constants ──────────────────────────────────────────────────────────
const W = 56          // mascot width  (px)
const H = 72          // mascot height (px)
const GRAVITY  = 0.42 // px / frame²
const MAX_VY   = 15   // terminal velocity
const BOUNCE   = 0.28 // energy kept on bounce
const WALK     = 1.5  // px / frame  walk speed
const JUMP_V   = -9.5 // initial jump vy

// ── Tips ──────────────────────────────────────────────────────────────────────
const PAGE_TIPS: Record<string, string[]> = {
  '/': [
    "Welcome home! Drag widgets to rearrange 🏠",
    "Net worth updates on every import 📈",
    "Check Analytics for pretty charts 📊",
  ],
  '/transactions': [
    "Batch-select rows to bulk-categorize ✅",
    "I learn from every edit you make 🧠",
    "Sort by subcategory to spot patterns!",
    "Drag column headers to reorder them!",
  ],
  '/budget': [
    "Budget at subcategory level now 🎯",
    "Copy last month's budgets in one click.",
    "Adjust your 50/30/20 targets in the rule editor!",
  ],
  '/analytics': [
    "No grey chart hover backgrounds — nice! 🎨",
    "Try changing the trend window for context.",
  ],
  '/settings': [
    "Drag subcategory chips to reorder them 🖱️",
    "Set up email reports for monthly summaries!",
    "Check System Health to see how things are doing.",
  ],
  '/import': [
    "Drop a PDF and I'll help parse it 📄",
    "Duplicates are detected automatically!",
  ],
}

const IDLE_TIPS = [
  "Poke me! Go on, I dare you 👉",
  "Remember to import last month's statements!",
  "Small habits = big financial wins 💪",
  "I like big budgets and I cannot lie 🎵",
  "Checked your subscriptions lately? 👀",
  "You're doing great — keep tracking ⭐",
  "*thinks in financial* 🤔",
  "Tag trips to see travel spend in one place ✈️",
  "Drag me anywhere you like!",
]

type Emotion = 'idle' | 'happy' | 'surprised' | 'sleepy' | 'excited' | 'dizzy' | 'thinking' | 'waving'

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

// ── SVG Character ─────────────────────────────────────────────────────────────
function FinnyBody({
  emotion,
  poked,
  onClick,
  leftLegRot,
  rightLegRot,
  leftArmRot,
  rightArmRot,
}: {
  emotion: Emotion
  poked: boolean
  onClick: () => void
  leftLegRot: MotionValue<number>
  rightLegRot: MotionValue<number>
  leftArmRot: MotionValue<number>
  rightArmRot: MotionValue<number>
}) {
  const bodyColor = {
    idle:      '#6366f1',
    happy:     '#10b981',
    surprised: '#f59e0b',
    sleepy:    '#8b5cf6',
    excited:   '#ef4444',
    dizzy:     '#ec4899',
    thinking:  '#3b82f6',
    waving:    '#6366f1',
  }[emotion]

  const mouthPath = {
    idle:      'M 20 38 Q 28 44 36 38',
    happy:     'M 18 36 Q 28 47 38 36',
    surprised: 'M 24 40 Q 28 48 32 40',
    sleepy:    'M 21 39 Q 28 43 35 39',
    excited:   'M 16 36 Q 28 49 40 36',
    dizzy:     'M 22 40 Q 28 36 34 40',
    thinking:  'M 22 39 Q 28 43 34 39',
    waving:    'M 19 37 Q 28 46 37 37',
  }[emotion]

  const eyeRx = emotion === 'surprised' ? 5   : emotion === 'excited' ? 4.5 : 3.5
  const eyeRy = emotion === 'surprised' ? 6.5 : emotion === 'happy'   ? 2.5 : emotion === 'sleepy' ? 1.8 : 4.5

  const mouthFilled = ['happy', 'excited', 'waving'].includes(emotion)
  const cheekAlpha  = ['happy', 'excited', 'waving'].includes(emotion) ? 0.55 : 0.3

  return (
    <svg
      viewBox="0 0 56 72"
      className="w-full h-full"
      onClick={onClick}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      <defs>
        <radialGradient id="fg-grad" cx="38%" cy="32%">
          <stop offset="0%"   stopColor="white"    stopOpacity="0.38" />
          <stop offset="100%" stopColor={bodyColor} stopOpacity="0" />
        </radialGradient>
        <filter id="char-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#0004" />
        </filter>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="28" cy="70.5" rx="14" ry="2.5" fill="black" opacity="0.13" />

      {/* ── Left leg ─── */}
      <motion.g style={{ rotate: leftLegRot, originX: '18px', originY: '52px' }}>
        <rect x="13" y="52" width="9" height="13" rx="4.5" fill={bodyColor} />
        <ellipse cx="18" cy="65.5" rx="7" ry="3.8" fill={bodyColor} />
        <ellipse cx="17" cy="65.5" rx="4.5" ry="2.2" fill="white" opacity="0.15" />
      </motion.g>

      {/* ── Right leg ─── */}
      <motion.g style={{ rotate: rightLegRot, originX: '38px', originY: '52px' }}>
        <rect x="34" y="52" width="9" height="13" rx="4.5" fill={bodyColor} />
        <ellipse cx="38" cy="65.5" rx="7" ry="3.8" fill={bodyColor} />
        <ellipse cx="37" cy="65.5" rx="4.5" ry="2.2" fill="white" opacity="0.15" />
      </motion.g>

      {/* ── Left arm ─── */}
      <motion.g style={{ rotate: leftArmRot, originX: '10px', originY: '30px' }}>
        <rect x="2" y="26" width="9" height="14" rx="4.5" fill={bodyColor} />
        {/* Hand / fist */}
        <circle cx="6.5" cy="41.5" r="5" fill={bodyColor} />
        <circle cx="4.8" cy="42.5" r="1.1" fill="white" opacity="0.22" />
        <circle cx="7.5" cy="43.5" r="1.1" fill="white" opacity="0.22" />
      </motion.g>

      {/* ── Right arm ─── */}
      <motion.g style={{ rotate: rightArmRot, originX: '46px', originY: '30px' }}>
        <rect x="45" y="26" width="9" height="14" rx="4.5" fill={bodyColor} />
        <circle cx="49.5" cy="41.5" r="5" fill={bodyColor} />
        <circle cx="47.8" cy="42.5" r="1.1" fill="white" opacity="0.22" />
        <circle cx="50.5" cy="43.5" r="1.1" fill="white" opacity="0.22" />
      </motion.g>

      {/* ── Body ─── */}
      <motion.ellipse
        cx="28" cy="35" rx="18" ry="20"
        fill={bodyColor}
        filter="url(#char-shadow)"
        animate={poked ? { rx: [18, 23, 13, 18], ry: [20, 13, 25, 20] } : {}}
        transition={{ duration: 0.42, ease: 'easeOut' }}
      />
      {/* Body sheen */}
      <ellipse cx="28" cy="35" rx="18" ry="20" fill="url(#fg-grad)" />
      {/* Belly shine */}
      <ellipse cx="26" cy="40" rx="6.5" ry="4.5" fill="white" opacity="0.07" />

      {/* ── Eyes ─── */}
      {emotion === 'sleepy' ? (
        <>
          <path d="M 16 24 Q 21.5 19.5 27 24"
            fill="none" stroke="#1e1b4b" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M 29 24 Q 34.5 19.5 40 24"
            fill="none" stroke="#1e1b4b" strokeWidth="2.8" strokeLinecap="round" />
        </>
      ) : emotion === 'dizzy' ? (
        <>
          <line x1="17" y1="21" x2="23" y2="27" stroke="#1e1b4b" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="23" y1="21" x2="17" y2="27" stroke="#1e1b4b" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="33" y1="21" x2="39" y2="27" stroke="#1e1b4b" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="39" y1="21" x2="33" y2="27" stroke="#1e1b4b" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="21.5" cy="23" rx={eyeRx} ry={eyeRy} fill="#1e1b4b" />
          <ellipse cx="34.5" cy="23" rx={eyeRx} ry={eyeRy} fill="#1e1b4b" />
          {/* Pupils */}
          <circle cx="23"   cy="21.5" r="1.6" fill="white" opacity="0.9" />
          <circle cx="36"   cy="21.5" r="1.6" fill="white" opacity="0.9" />
          {/* Iris glint */}
          <circle cx="23.8" cy="21"   r="0.8" fill="#818cf8" opacity="0.7" />
          <circle cx="36.8" cy="21"   r="0.8" fill="#818cf8" opacity="0.7" />
        </>
      )}

      {/* Cheeks */}
      <circle cx="11.5" cy="31" r="6" fill="#fda4af" opacity={cheekAlpha} />
      <circle cx="44.5" cy="31" r="6" fill="#fda4af" opacity={cheekAlpha} />

      {/* Mouth */}
      <path
        d={mouthPath}
        fill={mouthFilled ? '#1e1b4b' : 'none'}
        stroke="#1e1b4b"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Teeth */}
      {mouthFilled && (
        <rect x="23.5" y="39.5" width="9" height="4.5" rx="1.5" fill="white" opacity="0.88" />
      )}

      {/* ── Emotion FX ─── */}
      {emotion === 'thinking' && (
        <>
          <circle cx="41" cy="13" r="2.8" fill={bodyColor} opacity="0.72" />
          <circle cx="45" cy="8"  r="2"   fill={bodyColor} opacity="0.55" />
          <circle cx="48" cy="4"  r="1.3" fill={bodyColor} opacity="0.4" />
        </>
      )}
      {emotion === 'sleepy' && (
        <>
          <text x="37" y="14" fontSize="7"  fill="#8b5cf6" fontWeight="bold" opacity="0.85">z</text>
          <text x="41" y="9"  fontSize="5"  fill="#8b5cf6" fontWeight="bold" opacity="0.65">z</text>
          <text x="44" y="5"  fontSize="3.5" fill="#8b5cf6" fontWeight="bold" opacity="0.45">z</text>
        </>
      )}
      {emotion === 'dizzy' && (
        <>
          <text x="3"  y="13" fontSize="10" fill="#fbbf24">★</text>
          <text x="41" y="9"  fontSize="7"  fill="#f472b6">★</text>
        </>
      )}
      {emotion === 'surprised' && (
        <ellipse cx="43" cy="18" rx="2.8" ry="4" fill="#60a5fa" opacity="0.78" />
      )}
      {emotion === 'excited' && (
        <>
          <text x="-1" y="11" fontSize="9"  fill="#fbbf24">✦</text>
          <text x="44" y="7"  fontSize="6.5" fill="#34d399">✦</text>
        </>
      )}
    </svg>
  )
}

// ── Speech bubble ─────────────────────────────────────────────────────────────
function SpeechBubble({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.72, y: 8 }}
      animate={{ opacity: 1, scale: 1,    y: 0 }}
      exit={{ opacity: 0,   scale: 0.72,  y: 8 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      className="
        absolute bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2
        w-52 bg-white dark:bg-zinc-800
        border border-indigo-200 dark:border-indigo-700
        rounded-2xl shadow-xl p-3 z-10
      "
      style={{ pointerEvents: 'auto' }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
      <p className="text-xs leading-relaxed text-foreground pr-4">{text}</p>
      {/* Bubble tail */}
      <div className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-3 h-3 overflow-hidden">
        <div className="w-2.5 h-2.5 bg-white dark:bg-zinc-800 border-r border-b border-indigo-200 dark:border-indigo-700 rotate-45 -translate-y-[1px] translate-x-[2px]" />
      </div>
    </motion.div>
  )
}

// ── Main Mascot ───────────────────────────────────────────────────────────────
export function Mascot() {
  const location = useLocation()

  // ── React state (infrequent) ───────────────────────────────────────────────
  const [visible,   setVisible]   = useState(true)
  const [emotion,   setEmotion]   = useState<Emotion>('idle')
  const [bubble,    setBubble]    = useState<string | null>(null)
  const [facing,    setFacing]    = useState<1 | -1>(-1)
  const [poked,     setPoked]     = useState(false)
  const [pokeCount, setPokeCount] = useState(0)

  // ── Motion values (RAF-driven, no re-renders) ──────────────────────────────
  const mvX         = useMotionValue(() =>
    typeof window !== 'undefined' ? window.innerWidth - W - 24 : 400)
  const mvY         = useMotionValue(() =>
    typeof window !== 'undefined' ? window.innerHeight - H - 24 : 400)
  const leftLegRot  = useMotionValue(0)
  const rightLegRot = useMotionValue(0)
  const leftArmRot  = useMotionValue(0)
  const rightArmRot = useMotionValue(0)

  // ── Refs ───────────────────────────────────────────────────────────────────
  const emotionRef   = useRef<Emotion>('idle')
  const facingRef    = useRef<1 | -1>(-1)
  const bubbleRef    = useRef<string | null>(null)
  const pokeCountRef = useRef(0)
  const rafRef       = useRef(0)
  const mascotRef    = useRef<HTMLDivElement>(null)
  const surfacesRef  = useRef<DOMRect[]>([])
  const isScrollRef  = useRef(false)
  const scrollTimer  = useRef<ReturnType<typeof setTimeout>>()

  // sync state → refs so RAF closure stays fresh
  useEffect(() => { emotionRef.current   = emotion   }, [emotion])
  useEffect(() => { facingRef.current    = facing    }, [facing])
  useEffect(() => { bubbleRef.current    = bubble    }, [bubble])
  useEffect(() => { pokeCountRef.current = pokeCount }, [pokeCount])

  // ── Physics state (single ref object) ─────────────────────────────────────
  const phys = useRef({
    x: typeof window !== 'undefined' ? window.innerWidth  - W - 24 : 400,
    y: typeof window !== 'undefined' ? window.innerHeight - H - 24 : 400,
    vx: 0,
    vy: 0,
    onGround: true,
    walkDir: -1 as 1 | -1,
    walkPhase: 0,
    // drag
    isDragging: false,
    dragOffX: 0,
    dragOffY: 0,
    velHistory: [] as { x: number; y: number; t: number }[],
    // behaviour timers (ms timestamps)
    nextDirChange: 0,
    nextJump:      0,
    nextTip:       0,
  })

  // ── Surface detection ──────────────────────────────────────────────────────
  const refreshSurfaces = useCallback(() => {
    try {
      const nodes = document.querySelectorAll(
        'nav, header, [role="navigation"], [role="banner"], ' +
        '[class*="rounded-xl"], [class*="rounded-lg"], ' +
        'table, [class*="progress"]'
      )
      surfacesRef.current = Array.from(nodes)
        .map(el => el.getBoundingClientRect())
        .filter(r =>
          r.width > 100 &&
          r.height > 28 &&
          r.top > 0 &&
          r.top < window.innerHeight - 20
        )
    } catch {
      surfacesRef.current = []
    }
  }, [])

  // Nearest floor below the mascot's feet
  function getFloorY(px: number, py: number): number {
    if (isScrollRef.current) return window.innerHeight - 2
    const footX  = px + W / 2
    const footY  = py + H
    let   floor  = window.innerHeight - 2
    for (const r of surfacesRef.current) {
      if (footX >= r.left - 6 && footX <= r.right + 6) {
        if (r.top >= footY - 8 && r.top < floor) floor = r.top
      }
    }
    return floor
  }

  // ── RAF physics loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return

    refreshSurfaces()
    const surfInt = setInterval(refreshSurfaces, 2500)

    // Init timers
    const now0 = performance.now()
    phys.current.nextDirChange = now0 + 3000 + Math.random() * 4000
    phys.current.nextJump      = now0 + 7000 + Math.random() * 6000
    phys.current.nextTip       = now0 + 65000 + Math.random() * 55000

    let lastTime = now0

    function frame(now: number) {
      // Skip huge gaps (tab was backgrounded)
      if (now - lastTime > 500) { lastTime = now; rafRef.current = requestAnimationFrame(frame); return }
      const dt = (now - lastTime) / 16.67  // normalise to 60 fps units
      lastTime = now

      const p   = phys.current
      const emo = emotionRef.current

      if (!p.isDragging) {
        // ── Gravity ──────────────────────────────────────────────────────────
        p.vy = Math.min(p.vy + GRAVITY * dt, MAX_VY)

        // ── Move ─────────────────────────────────────────────────────────────
        let nx = p.x + p.vx * dt
        let ny = p.y + p.vy * dt

        // ── Floor / surface collision ─────────────────────────────────────────
        const floor = getFloorY(p.x, ny)
        if (ny + H >= floor) {
          ny = floor - H
          if (p.vy > 3) {
            p.vy = -p.vy * BOUNCE
            if (p.vy < -2.5) {
              setEmotion('surprised')
              setTimeout(() => { if (emotionRef.current === 'surprised') setEmotion('idle') }, 500)
            }
          } else {
            p.vy = 0
          }
          p.onGround = true
        } else {
          p.onGround = false
        }

        // ── Wall clamp ────────────────────────────────────────────────────────
        if (nx < 0) {
          nx = 0
          p.vx = Math.abs(p.vx) * 0.55
          p.walkDir = 1
          p.nextDirChange = now + 200
        }
        if (nx + W > window.innerWidth) {
          nx = window.innerWidth - W
          p.vx = -Math.abs(p.vx) * 0.55
          p.walkDir = -1
          p.nextDirChange = now + 200
        }

        // ── Walking on ground ─────────────────────────────────────────────────
        if (p.onGround) {
          // Random direction flip
          if (now > p.nextDirChange) {
            p.walkDir = (Math.random() > 0.35 ? -p.walkDir : p.walkDir) as 1 | -1
            p.nextDirChange = now + 2500 + Math.random() * 5000
          }
          // Smooth acceleration toward walk speed
          p.vx += (p.walkDir * WALK - p.vx) * 0.12
          // Random jump
          if (now > p.nextJump) {
            p.vy        = JUMP_V
            p.vx        = p.walkDir * WALK * 1.4
            p.onGround  = false
            p.nextJump  = now + 5000 + Math.random() * 9000
            setEmotion('excited')
            setTimeout(() => { if (emotionRef.current === 'excited') setEmotion('idle') }, 900)
          }
        } else {
          // Air drag
          p.vx *= Math.pow(0.996, dt)
        }

        p.x = nx
        p.y = ny
        mvX.set(nx)
        mvY.set(ny)

        // ── Walk phase ────────────────────────────────────────────────────────
        p.walkPhase += Math.abs(p.vx) * 0.14 * dt

        // ── Limb animation ────────────────────────────────────────────────────
        if (!p.onGround) {
          // Airborne: legs spread or tuck, arms up
          const tuck = p.vy < 0 ? -22 : 14   // rising=tuck, falling=dangle
          leftLegRot.set(tuck)
          rightLegRot.set(-tuck * 0.7)
          leftArmRot.set(-36)
          rightArmRot.set(36)
        } else {
          const legAmp = Math.min(Math.abs(p.vx) * 19, 30)
          leftLegRot.set(Math.sin(p.walkPhase) * legAmp)
          rightLegRot.set(Math.sin(p.walkPhase + Math.PI) * legAmp)

          const armAmp = Math.min(Math.abs(p.vx) * 15, 24)
          if (emo === 'waving') {
            leftArmRot.set(-8)
            rightArmRot.set(Math.sin(now / 140) * 40 - 18)
          } else if (emo === 'thinking') {
            leftArmRot.set(6)
            rightArmRot.set(-34)
          } else if (emo === 'excited') {
            leftArmRot.set(Math.sin(now / 110) * 32 - 14)
            rightArmRot.set(-Math.sin(now / 110) * 32 + 14)
          } else {
            // Natural walking swing (opposite to legs)
            leftArmRot.set(Math.sin(p.walkPhase + Math.PI) * armAmp)
            rightArmRot.set(Math.sin(p.walkPhase) * armAmp)
          }
        }

        // ── Facing direction ──────────────────────────────────────────────────
        if (Math.abs(p.vx) > 0.35) {
          const nf = p.vx > 0 ? 1 : -1
          if (nf !== facingRef.current) {
            facingRef.current = nf as 1 | -1
            setFacing(nf as 1 | -1)
          }
        }

        // ── Periodic idle tips ────────────────────────────────────────────────
        if (now > p.nextTip && !bubbleRef.current && emotionRef.current === 'idle') {
          const msg = pick(IDLE_TIPS)
          setBubble(msg)
          setEmotion('thinking')
          p.nextTip = now + 55000 + Math.random() * 65000
          setTimeout(() => {
            if (emotionRef.current === 'thinking') setEmotion('idle')
            setTimeout(() => { if (bubbleRef.current === msg) setBubble(null) }, 5500)
          }, 2800)
        }
      }

      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)

    // Scroll → temporarily ignore surfaces (mascot lands on floor)
    const onScroll = () => {
      isScrollRef.current = true
      clearTimeout(scrollTimer.current)
      scrollTimer.current = setTimeout(() => {
        isScrollRef.current = false
        refreshSurfaces()
      }, 380)
    }

    const onResize = () => {
      refreshSurfaces()
      const p = phys.current
      if (p.x + W > window.innerWidth)  p.x = window.innerWidth  - W - 10
      if (p.y + H > window.innerHeight) p.y = window.innerHeight - H - 10
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearInterval(surfInt)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [visible, refreshSurfaces, mvX, mvY, leftLegRot, rightLegRot, leftArmRot, rightArmRot])

  // ── Page-change tip ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      if (emotionRef.current !== 'idle') return
      const tips = PAGE_TIPS[location.pathname] ?? IDLE_TIPS
      const msg  = pick(tips)
      setBubble(msg)
      setEmotion('waving')
      setTimeout(() => {
        if (emotionRef.current === 'waving') setEmotion('idle')
        setTimeout(() => { if (bubbleRef.current === msg) setBubble(null) }, 5000)
      }, 2200)
    }, 2600)
    return () => clearTimeout(t)
  }, [location.pathname])

  // ── Sleep after long idle ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      if (emotionRef.current === 'idle' && !bubbleRef.current) {
        setEmotion('sleepy')
        const msg = "*yawns* ...doing financial dreams 💤"
        setBubble(msg)
        setTimeout(() => { if (bubbleRef.current === msg) setBubble(null) }, 4200)
        setTimeout(() => { if (emotionRef.current === 'sleepy') setEmotion('idle') }, 9500)
      }
    }, 80000)
    return () => clearTimeout(t)
  }, [emotion])

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const p = phys.current
    p.isDragging = true
    p.dragOffX   = p.x - e.clientX
    p.dragOffY   = p.y - e.clientY
    p.velHistory = []
    p.vx = 0
    p.vy = 0
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const p = phys.current
    if (!p.isDragging) return
    const nx = e.clientX + p.dragOffX
    const ny = e.clientY + p.dragOffY
    p.velHistory.push({ x: nx, y: ny, t: e.timeStamp })
    if (p.velHistory.length > 6) p.velHistory.shift()
    p.x = nx
    p.y = ny
    mvX.set(nx)
    mvY.set(ny)
  }, [mvX, mvY])

  const handlePointerUp = useCallback(() => {
    const p = phys.current
    p.isDragging = false
    // Compute throw velocity from recent pointer samples
    const hist = p.velHistory
    if (hist.length >= 2) {
      const n  = hist.length
      const dt = hist[n-1].t - hist[n-2].t
      if (dt > 0 && dt < 80) {
        p.vx = Math.max(-10, Math.min(10, (hist[n-1].x - hist[n-2].x) / dt * 16))
        p.vy = Math.max(-12, Math.min(12, (hist[n-1].y - hist[n-2].y) / dt * 16))
      }
    }
    p.velHistory = []
  }, [])

  // ── Poke ───────────────────────────────────────────────────────────────────
  const handlePoke = useCallback(() => {
    if (phys.current.isDragging) return
    const c = pokeCountRef.current + 1
    let msg: string
    let emo: Emotion
    if      (c === 1) { emo = 'surprised'; msg = "Whoa! Hey! 😲" }
    else if (c === 2) { emo = 'happy';     msg = "Hehe, again? 😄" }
    else if (c === 3) { emo = 'excited';   msg = "OK OK I love it! 🎉" }
    else if (c === 4) { emo = 'dizzy';     msg = "Getting dizzy... 😵" }
    else              { emo = 'dizzy';     msg = "You really like poking me! 😵‍💫" }

    setPoked(true)
    setPokeCount(c)
    setEmotion(emo)
    setBubble(msg)

    // Small bounce on poke
    phys.current.vy = -5.5
    phys.current.vx = (Math.random() - 0.5) * 5

    setTimeout(() => setPoked(false), 400)
    setTimeout(() => {
      if (emotionRef.current === emo) setEmotion('idle')
      if (bubbleRef.current  === msg) setBubble(null)
      // Gradually reset poke counter if no new poke
      setTimeout(() => setPokeCount(prev => (prev === c ? 0 : prev)), 2000)
    }, 3800)
  }, [])

  if (!visible) return null

  return (
    <motion.div
      ref={mascotRef}
      style={{ x: mvX, y: mvY, position: 'fixed', left: 0, top: 0, zIndex: 9999 }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1.4, type: 'spring', stiffness: 170, damping: 16 }}
      className="select-none"
    >
      {/* Speech bubble — outside flip so it always reads left-to-right */}
      <div
        style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: 10,
          pointerEvents: 'none',
          width: 210,
        }}
      >
        <AnimatePresence>
          {bubble && <SpeechBubble text={bubble} onDismiss={() => setBubble(null)} />}
        </AnimatePresence>
      </div>

      {/* Character flip container */}
      <motion.div
        animate={{ scaleX: facing }}
        transition={{ duration: 0.13 }}
        style={{ width: W, height: H }}
      >
        {/* Squish wrapper + drag target */}
        <motion.div
          style={{ width: W, height: H }}
          animate={poked
            ? { scaleX: [1, 1.38, 0.80, 1], scaleY: [1, 0.70, 1.20, 1] }
            : {}
          }
          transition={{ duration: 0.4, ease: 'easeOut' }}
          whileHover={{ scale: 1.1 }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="cursor-grab active:cursor-grabbing drop-shadow-xl"
        >
          <FinnyBody
            emotion={emotion}
            poked={poked}
            onClick={handlePoke}
            leftLegRot={leftLegRot}
            rightLegRot={rightLegRot}
            leftArmRot={leftArmRot}
            rightArmRot={rightArmRot}
          />
        </motion.div>
      </motion.div>

      {/* Dismiss × — outside flip container */}
      <motion.button
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1, scale: 1.15 }}
        style={{ position: 'absolute', top: -9, right: -9 }}
        className="
          w-5 h-5 rounded-full
          bg-muted border border-border
          text-muted-foreground
          flex items-center justify-center
          opacity-0 shadow-sm
          transition-opacity
        "
        onClick={(e) => { e.stopPropagation(); setVisible(false) }}
        title="Hide Finny"
      >
        <X className="w-3 h-3" />
      </motion.button>
    </motion.div>
  )
}
