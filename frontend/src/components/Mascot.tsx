/**
 * Mochi — the Finance Dashboard mascot
 *
 * A red panda finance companion that walks purposefully toward stat cards,
 * peeks over widget edges, and gives AI-powered commentary about what she sees.
 *
 * Interactions:
 *  • Click            → toggle walking / stationary
 *  • Repeated tap     → anger escalation (when stationary)
 *  • Drag             → physics throw; fast release = annoyed
 *  • Dismiss ×        → hide until page refresh
 */
import {
  useState, useEffect, useCallback, useRef,
} from 'react'
import {
  motion, AnimatePresence, useMotionValue, type MotionValue,
} from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import { api } from '@/utils/apiClient'

// ── Constants ──────────────────────────────────────────────────────────────────
const W = 82            // mascot pixel width
const H = 96            // mascot pixel height
const GRAVITY  = 0.45
const MAX_VY   = 16
const BOUNCE   = 0.25
const WALK_SPD = 2.0    // px/frame toward target
const ARRIVE   = 22     // px threshold to consider "arrived"
const BUBBLE_W = 280
const BUBBLE_EST_H = 96
const BUBBLE_GAP = 4
const VIEWPORT_PAD = 12
const DRAG_START_PX = 4
const DRAG_HOLD_MS = 0
const DUPLICATE_TAP_MS = 80
const RAPID_TAP_MS = 520
const INSPECT_MEMORY_MS = 5 * 60 * 1000

// ── Types ──────────────────────────────────────────────────────────────────────
type Emotion =
  | 'idle' | 'happy' | 'angry' | 'annoyed'
  | 'surprised' | 'excited' | 'thinking' | 'sleepy'
  | 'waving' | 'dizzy'

type Phase = 'stationary' | 'walking' | 'inspecting'
type HideSide = 'top'
type InspectTarget = {
  x: number
  y: number
  side: HideSide
  rect: DOMRect
  key: string
}
type BubblePlacement = 'top' | 'bottom'
type BubbleLayout = {
  left: number
  top: number
  arrowX: number
  placement: BubblePlacement
}

// ── Page-name helper ───────────────────────────────────────────────────────────
const PAGE_NAMES: Record<string, string> = {
  '/':              'dashboard',
  '/transactions':  'transactions',
  '/budget':        'budget',
  '/analytics':     'analytics',
  '/settings':      'settings',
  '/import':        'import',
  '/subscriptions': 'subscriptions',
  '/trips':         'trips',
  '/reimbursements':'reimbursements',
  '/ask-ai':        'ask-ai',
  '/advisor':       'advisor',
}

// Fallback witty lines used when AI is not configured / call fails
const FALLBACK: Record<string, string[]> = {
  dashboard:     [
    "Numbers don't lie… but they do bite 💸",
    "Your net worth is just a fancy way of saying 'how scared you should be' 📊",
    "Dashboard loading... anxiety loading... 😬",
  ],
  transactions:  [
    "Every transaction tells a story. Yours says 'snacks' 🛒",
    "Batch-select. Categorize. Repeat. Extremely official tiny audit behavior.",
  ],
  budget:        [
    "Budget: a system to tell your money where to cry 😭",
    "Red bars are just enthusiasm in disguise 🔴",
  ],
  analytics:     [
    "Stats don't judge. I do though 😏",
    "Your spending has personality. Too much personality 🎭",
  ],
  settings:      [
    "Customizing settings? Living dangerously 🛠️",
    "Great power, great responsibility, small toggle ⚙️",
  ],
  default:       [
    "Click me and I'll go inspect the numbers 👉",
    "Remember to import last month's statements!",
    "Small habits = big financial wins 💪",
    "I like big budgets and I cannot lie 🎵",
  ],
}

function fallback(page: string): string {
  const bucket = FALLBACK[page] ?? FALLBACK.default
  return bucket[Math.floor(Math.random() * bucket.length)]
}

// ── Screen text extraction ─────────────────────────────────────────────────────
// Probes DOM points near the mascot and returns visible text fragments
function getNearbyText(mascotX: number, mascotY: number, mascotEl?: HTMLElement | null, targetRect?: DOMRect | null): string {
  let previousPointerEvents: string | undefined
  try {
    previousPointerEvents = mascotEl?.style.pointerEvents
    if (mascotEl) mascotEl.style.pointerEvents = 'none'

    const cx = mascotX + W / 2
    const probePoints: [number, number][] = targetRect ? [
      [targetRect.left + targetRect.width * 0.22, targetRect.top + Math.min(34, targetRect.height * 0.35)],
      [targetRect.left + targetRect.width * 0.50, targetRect.top + Math.min(54, targetRect.height * 0.45)],
      [targetRect.left + targetRect.width * 0.78, targetRect.top + Math.min(34, targetRect.height * 0.35)],
      [targetRect.left + targetRect.width * 0.50, targetRect.top + targetRect.height * 0.68],
      [cx, mascotY + H + 12],
    ] : [
      [cx, mascotY - 25],
      [cx, mascotY - 80],
      [cx, mascotY - 150],
      [cx - 90, mascotY - 80],
      [cx + 90, mascotY - 80],
    ]

    const fragments: string[] = []
    const seen = new Set<string>()

    for (const [px, py] of probePoints) {
      if (px < 5 || px > window.innerWidth - 5 || py < 5 || py > window.innerHeight - 5) continue
      const stack = document.elementsFromPoint(px, py)
      for (const el of stack) {
        if (el === document.body || el === document.documentElement) continue
        if ((el as HTMLElement).closest?.('[data-mochi-mascot="true"]')) continue
        if (el.tagName === 'svg' || el.tagName === 'SVG') continue
        const htmlEl = el as HTMLElement
        const rect = htmlEl.getBoundingClientRect()
        if (rect.width < 30) continue
        if (targetRect) {
          const overlapsTarget = rect.left < targetRect.right && rect.right > targetRect.left &&
            rect.top < targetRect.bottom && rect.bottom > targetRect.top
          if (!overlapsTarget) continue
        }

        // Prefer heading elements — get full innerText
        if (/^H[1-6]$/.test(el.tagName)) {
          const text = htmlEl.innerText?.trim() ?? ''
          if (text && text.length > 1 && text.length < 120 && !seen.has(text)) {
            seen.add(text)
            fragments.push(text)
          }
          continue
        }

        // For other elements, get direct text nodes only (avoids giant nested content)
        let directText = ''
        for (const child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            directText += (child.textContent ?? '').trim() + ' '
          }
        }
        directText = directText.trim()
        if (directText && directText.length > 2 && directText.length < 120 && !seen.has(directText)) {
          seen.add(directText)
          fragments.push(directText)
        }

        if (fragments.length >= 8) break
      }
      if (fragments.length >= 8) break
    }

    return fragments.slice(0, 6).join(' | ')
  } catch {
    return ''
  } finally {
    if (mascotEl) mascotEl.style.pointerEvents = previousPointerEvents ?? ''
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function getBubbleLayout(mascotX: number, mascotY: number): BubbleLayout {
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight
  const bubbleW = Math.min(BUBBLE_W, viewportW - VIEWPORT_PAD * 2)
  const mascotCenterX = mascotX + W / 2
  const topCandidate = mascotY - BUBBLE_EST_H - BUBBLE_GAP
  const bottomCandidate = mascotY + H + BUBBLE_GAP
  const fitsAbove = topCandidate >= VIEWPORT_PAD
  const fitsBelow = bottomCandidate + BUBBLE_EST_H <= viewportH - VIEWPORT_PAD
  const placement: BubblePlacement = fitsAbove || !fitsBelow ? 'top' : 'bottom'
  const unclampedLeft = mascotCenterX - bubbleW / 2
  const left = clamp(unclampedLeft, VIEWPORT_PAD, viewportW - bubbleW - VIEWPORT_PAD)
  const rawTop = placement === 'top' ? topCandidate : bottomCandidate
  const top = clamp(rawTop, VIEWPORT_PAD, viewportH - BUBBLE_EST_H - VIEWPORT_PAD)

  return {
    left,
    top,
    arrowX: clamp(mascotCenterX - left, 22, bubbleW - 22),
    placement,
  }
}

function getHideTarget(rect: DOMRect, side: HideSide): { x: number; y: number } {
  switch (side) {
    case 'top':
      return {
        x: clamp(rect.left + rect.width / 2 - W / 2, 8, window.innerWidth - W - 8),
        y: rect.top - H * 0.55,
      }
  }
}

function getPeekClipPath(side: HideSide | null): string {
  if (!side) return 'none'
  switch (side) {
    case 'top':
      return 'inset(0 0 44px 0)'
  }
}

function getPeekMaskImage(side: HideSide | null): string {
  return 'none'
}

function getTargetKey(el: Element, rect: DOMRect): string {
  const htmlEl = el as HTMLElement
  const label = [
    htmlEl.getAttribute('aria-label'),
    htmlEl.getAttribute('title'),
    htmlEl.innerText,
    htmlEl.textContent,
  ]
    .find(text => text && text.trim().length > 0)
    ?.trim()
    .replace(/\s+/g, ' ')
    .slice(0, 90) ?? ''
  const role = htmlEl.getAttribute('role') ?? el.tagName.toLowerCase()
  const x = Math.round(rect.left / 20) * 20
  const y = Math.round(rect.top / 20) * 20
  const w = Math.round(rect.width / 20) * 20
  const h = Math.round(rect.height / 20) * 20
  return `${role}:${label}:${x}:${y}:${w}:${h}`
}

// ── Fox SVG ────────────────────────────────────────────────────────────────────
function FoxBody({
  emotion, poked, onClick,
  leftLegRot, rightLegRot, leftArmRot, rightArmRot,
}: {
  emotion: Emotion
  poked: boolean
  onClick: () => void
  facing: 1 | -1
  leftLegRot:  MotionValue<number>
  rightLegRot: MotionValue<number>
  leftArmRot:  MotionValue<number>
  rightArmRot: MotionValue<number>
}) {
  const isAngry = emotion === 'angry'
  const isHappy = ['happy', 'excited', 'waving'].includes(emotion)

  // Color palette — shifts to red when angry
  const foxOrange = isAngry ? '#C84040' : '#E8722A'
  const foxDark   = isAngry ? '#A03030' : '#C25A1A'
  const foxCream  = '#FFF3E0'
  const foxBrown  = '#4A1800'
  const foxPink   = isAngry ? '#FF9090' : '#FFB3C1'
  const foxNose   = '#1A0800'
  const foxEye    = isAngry ? '#6B0000' : '#2D1000'
  const steam     = '#94A3B8'

  // Eyebrow paths (above eyes at y≈22)
  const [browL, browR] = ({
    idle:      ['M16,15 Q22,12 28,15', 'M32,15 Q38,12 44,15'],
    happy:     ['M16,13 Q22,10 28,13', 'M32,13 Q38,10 44,13'],
    angry:     ['M16,15 Q22,19 28,14', 'M32,14 Q38,19 44,15'],
    annoyed:   ['M16,16 Q22,15 28,16', 'M32,16 Q38,15 44,16'],
    surprised: ['M16,11 Q22,8  28,11', 'M32,11 Q38,8  44,11'],
    excited:   ['M16,12 Q22,9  28,12', 'M32,12 Q38,9  44,12'],
    thinking:  ['M16,15 Q22,12 28,15', 'M32,13 Q38,10 44,13'],
    sleepy:    ['M16,17 Q22,16 28,17', 'M32,17 Q38,16 44,17'],
    waving:    ['M16,13 Q22,10 28,13', 'M32,13 Q38,10 44,13'],
    dizzy:     ['M16,15 Q22,12 28,15', 'M32,15 Q38,12 44,15'],
  } as Record<Emotion, [string, string]>)[emotion]

  // Mouth path (below snout around y≈43)
  const mouthPath = ({
    idle:      'M22,42 Q30,47 38,42',
    happy:     'M19,40 Q30,51 41,40',
    angry:     'M22,46 Q30,40 38,46',
    annoyed:   'M23,44 Q30,42 37,44',
    surprised: 'M27,43 Q30,50 33,43',
    excited:   'M17,38 Q30,52 43,38',
    thinking:  'M23,43 Q30,46 37,43',
    sleepy:    'M23,44 Q30,47 37,44',
    waving:    'M19,40 Q30,51 41,40',
    dizzy:     'M23,43 Q27,39 30,43 Q33,47 37,43',
  } as Record<Emotion, string>)[emotion]

  const mouthFilled = isHappy
  const cheekAlpha  = isHappy ? 0.55 : isAngry ? 0 : 0.28

  return (
    <svg
      viewBox="0 0 60 80"
      className="w-full h-full"
      style={{ cursor: 'pointer', userSelect: 'none', overflow: 'visible' }}
      onClick={onClick}
    >
      <defs>
        <radialGradient id="fox-head-shine" cx="38%" cy="28%">
          <stop offset="0%"   stopColor="white"     stopOpacity="0.38" />
          <stop offset="100%" stopColor={foxOrange}  stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fox-body-shine" cx="38%" cy="22%">
          <stop offset="0%"   stopColor="white"  stopOpacity="0.28" />
          <stop offset="100%" stopColor={foxDark} stopOpacity="0" />
        </radialGradient>
        <filter id="fox-shadow">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#0003" />
        </filter>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="30" cy="80" rx="17" ry="3" fill="black" opacity="0.10" />

      {/* ── Tail (behind body, left side so it trails when facing right) ── */}
      <motion.g
        style={{ originX: '16px', originY: '55px' }}
        animate={{ rotate: [0, 14, 0, -10, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
      >
        {/* Main tail */}
        <path
          d="M16,55 Q1,46 -1,34 Q-3,22 7,19 Q12,17 14,22 Q9,30 12,41 Q15,51 24,53 Z"
          fill={foxOrange}
        />
        {/* Cream tip */}
        <path
          d="M14,20 Q7,16 7,19 Q9,27 14,30 Q17,26 14,20 Z"
          fill={foxCream}
        />
        {/* Subtle sheen */}
        <path
          d="M16,55 Q1,46 -1,34 Q-3,22 7,19"
          fill="none" stroke="white" strokeWidth="1.4"
          strokeOpacity="0.18" strokeLinecap="round"
        />
      </motion.g>

      {/* ── Left leg (hip pivot at 22,67) ── */}
      <motion.g style={{ rotate: leftLegRot, originX: '22px', originY: '67px' }}>
        <path
          d="M17,66 Q14,73 16,78 Q20,82 25,79 Q26,72 26,66 Z"
          fill={foxDark}
        />
        {/* Paw */}
        <ellipse cx="20" cy="80" rx="7" ry="4.5" fill={foxCream} />
        <ellipse cx="19" cy="79" rx="4" ry="2.5" fill="white" opacity="0.18" />
      </motion.g>

      {/* ── Right leg (hip pivot at 38,67) ── */}
      <motion.g style={{ rotate: rightLegRot, originX: '38px', originY: '67px' }}>
        <path
          d="M33,66 Q30,73 32,78 Q36,82 41,79 Q42,72 42,66 Z"
          fill={foxDark}
        />
        {/* Paw */}
        <ellipse cx="36" cy="80" rx="7" ry="4.5" fill={foxCream} />
        <ellipse cx="35" cy="79" rx="4" ry="2.5" fill="white" opacity="0.18" />
      </motion.g>

      {/* ── Left arm (shoulder pivot at 9,44) ── */}
      <motion.g style={{ rotate: leftArmRot, originX: '9px', originY: '44px' }}>
        <path d="M4,43 Q1,52 3,60 Q6,64 12,62 Q14,55 14,44 Z" fill={foxOrange} />
        <ellipse cx="5" cy="62" rx="5.5" ry="3.5" fill={foxCream} />
      </motion.g>

      {/* ── Right arm (shoulder pivot at 51,44) ── */}
      <motion.g style={{ rotate: rightArmRot, originX: '51px', originY: '44px' }}>
        <path d="M56,43 Q59,52 57,60 Q54,64 48,62 Q46,55 46,44 Z" fill={foxOrange} />
        <ellipse cx="55" cy="62" rx="5.5" ry="3.5" fill={foxCream} />
      </motion.g>

      {/* ── Body (torso) ── */}
      <motion.ellipse
        cx="30" cy="58" rx="15" ry="17"
        fill={foxOrange}
        filter="url(#fox-shadow)"
        animate={poked ? { rx: [15, 21, 11, 15], ry: [17, 11, 23, 17] } : {}}
        transition={{ duration: 0.42, ease: 'easeOut' }}
      />
      <ellipse cx="30" cy="58" rx="15" ry="17" fill="url(#fox-body-shine)" />
      {/* Belly */}
      <ellipse cx="30" cy="61" rx="9" ry="12" fill={foxCream} opacity="0.88" />

      {/* ── Ears (drawn before head so head overlaps the bases) ── */}
      {/* Left ear */}
      <path
        d="M9,22 Q6,8 14,2 Q20,-1 23,12 Q18,15 13,22 Z"
        fill={foxOrange}
      />
      <path
        d="M11,21 Q9,9 15,4 Q20,2 22,12 Q18,14 14,20 Z"
        fill={foxPink}
      />
      {/* Right ear */}
      <path
        d="M51,22 Q54,8 46,2 Q40,-1 37,12 Q42,15 47,22 Z"
        fill={foxOrange}
      />
      <path
        d="M49,21 Q51,9 45,4 Q40,2 38,12 Q42,14 46,20 Z"
        fill={foxPink}
      />

      {/* ── Head ── */}
      <path
        d="M12,26 C11,14 16,4 30,4 C44,4 49,14 48,26 C47,38 42,44 30,44 C18,44 13,38 12,26 Z"
        fill={foxOrange}
        filter="url(#fox-shadow)"
      />
      {/* Head shine */}
      <path
        d="M12,26 C11,14 16,4 30,4 C44,4 49,14 48,26 C47,38 42,44 30,44 C18,44 13,38 12,26 Z"
        fill="url(#fox-head-shine)"
      />

      {/* ── Face mask (cream, lower 40% of face) ── */}
      <path
        d="M15,33 C15,27 19,24 30,24 C41,24 45,27 45,33 C44,41 39,44 30,44 C21,44 16,41 15,33 Z"
        fill={foxCream}
        opacity="0.92"
      />

      {/* ── Snout (protrudes slightly) ── */}
      <ellipse cx="30" cy="39" rx="8.5" ry="6.5" fill={foxCream} />
      {/* Philtrum (center divider) */}
      <line x1="30" y1="35" x2="30" y2="38.5"
        stroke={foxBrown} strokeWidth="0.8" strokeOpacity="0.25" />

      {/* ── Nose ── */}
      <path
        d="M26,35 Q30,33 34,35 Q32,39 30,39 Q28,39 26,35 Z"
        fill={foxNose}
      />
      {/* Nose highlight */}
      <circle cx="28" cy="35.5" r="1.2" fill="white" opacity="0.40" />

      {/* ── Eyebrows ── */}
      <path d={browL} fill="none"
        stroke={isAngry ? '#991B1B' : foxBrown}
        strokeWidth="2.5" strokeLinecap="round" />
      <path d={browR} fill="none"
        stroke={isAngry ? '#991B1B' : foxBrown}
        strokeWidth="2.5" strokeLinecap="round" />

      {/* ── Eyes ── */}
      {emotion === 'sleepy' ? (
        <>
          <path d="M19,23 Q23,18 27,23"
            fill="none" stroke={foxEye} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M33,23 Q37,18 41,23"
            fill="none" stroke={foxEye} strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : emotion === 'dizzy' ? (
        <>
          <line x1="19" y1="20" x2="26" y2="26" stroke={foxEye} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="26" y1="20" x2="19" y2="26" stroke={foxEye} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="34" y1="20" x2="41" y2="26" stroke={foxEye} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="41" y1="20" x2="34" y2="26" stroke={foxEye} strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : emotion === 'excited' ? (
        <>
          <text x="17" y="27" fontSize="11" fill={foxBrown}>★</text>
          <text x="32" y="27" fontSize="11" fill={foxBrown}>★</text>
        </>
      ) : (
        <>
          {/* Whites */}
          <ellipse cx="22" cy="22"
            rx={emotion === 'surprised' ? 6   : 4.5}
            ry={emotion === 'surprised' ? 7.5 : emotion === 'happy' ? 3 : 6.5}
            fill="white" opacity="0.95" />
          <ellipse cx="38" cy="22"
            rx={emotion === 'surprised' ? 6   : 4.5}
            ry={emotion === 'surprised' ? 7.5 : emotion === 'happy' ? 3 : 6.5}
            fill="white" opacity="0.95" />
          {/* Amber iris ring */}
          <ellipse cx="22" cy="22"
            rx={emotion === 'surprised' ? 6   : 4.5}
            ry={emotion === 'surprised' ? 7.5 : emotion === 'happy' ? 3 : 6.5}
            fill="none" stroke="#C8860A" strokeWidth="0.9" opacity="0.45" />
          <ellipse cx="38" cy="22"
            rx={emotion === 'surprised' ? 6   : 4.5}
            ry={emotion === 'surprised' ? 7.5 : emotion === 'happy' ? 3 : 6.5}
            fill="none" stroke="#C8860A" strokeWidth="0.9" opacity="0.45" />
          {/* Irises */}
          <ellipse cx="22" cy="22.5"
            rx={emotion === 'surprised' ? 4   : 3}
            ry={emotion === 'surprised' ? 5.5 : emotion === 'happy' ? 2 : 4.8}
            fill={foxEye} />
          <ellipse cx="38" cy="22.5"
            rx={emotion === 'surprised' ? 4   : 3}
            ry={emotion === 'surprised' ? 5.5 : emotion === 'happy' ? 2 : 4.8}
            fill={foxEye} />
          {/* Specular highlights */}
          <circle cx="23.5" cy="20.5" r="1.4" fill="white" opacity="0.9" />
          <circle cx="39.5" cy="20.5" r="1.4" fill="white" opacity="0.9" />
        </>
      )}

      {/* ── Cheeks ── */}
      <ellipse cx="13" cy="30" rx="5.5" ry="4" fill="#F87171" opacity={cheekAlpha} />
      <ellipse cx="47" cy="30" rx="5.5" ry="4" fill="#F87171" opacity={cheekAlpha} />
      {isAngry && (
        <>
          <ellipse cx="13" cy="30" rx="6.5" ry="5" fill="#DC2626" opacity="0.28" />
          <ellipse cx="47" cy="30" rx="6.5" ry="5" fill="#DC2626" opacity="0.28" />
        </>
      )}

      {/* ── Whiskers ── */}
      <line x1="13" y1="36" x2="23" y2="37"   stroke={foxBrown} strokeWidth="0.8" strokeOpacity="0.4" strokeLinecap="round" />
      <line x1="12" y1="38.5" x2="22" y2="39" stroke={foxBrown} strokeWidth="0.8" strokeOpacity="0.4" strokeLinecap="round" />
      <line x1="13" y1="41" x2="22" y2="41"   stroke={foxBrown} strokeWidth="0.7" strokeOpacity="0.3" strokeLinecap="round" />
      <line x1="47" y1="36" x2="37" y2="37"   stroke={foxBrown} strokeWidth="0.8" strokeOpacity="0.4" strokeLinecap="round" />
      <line x1="48" y1="38.5" x2="38" y2="39" stroke={foxBrown} strokeWidth="0.8" strokeOpacity="0.4" strokeLinecap="round" />
      <line x1="47" y1="41" x2="38" y2="41"   stroke={foxBrown} strokeWidth="0.7" strokeOpacity="0.3" strokeLinecap="round" />

      {/* ── Mouth ── */}
      <path
        d={mouthPath}
        fill={mouthFilled ? foxBrown : 'none'}
        stroke={isAngry ? '#7A0000' : foxBrown}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {mouthFilled && (
        <rect x="23" y="42" width="14" height="5" rx="2.5" fill="white" opacity="0.88" />
      )}

      {/* ── Emotion FX ── */}
      {emotion === 'angry' && (
        <>
          <line x1="14" y1="5"  x2="12" y2="0"  stroke={steam} strokeWidth="2" strokeLinecap="round" />
          <line x1="20" y1="3"  x2="20" y2="-2" stroke={steam} strokeWidth="2" strokeLinecap="round" />
          <line x1="26" y1="2"  x2="27" y2="-3" stroke={steam} strokeWidth="2" strokeLinecap="round" />
          <text x="42" y="6" fontSize="10" fill="#EF4444">😤</text>
        </>
      )}
      {emotion === 'annoyed' && (
        <ellipse cx="51" cy="12" rx="3" ry="5" fill="#60A5FA" opacity="0.8" />
      )}
      {emotion === 'thinking' && (
        <>
          <circle cx="51" cy="12" r="3.5" fill={foxOrange} opacity="0.75" />
          <circle cx="56" cy="7"  r="2.5" fill={foxOrange} opacity="0.58" />
          <circle cx="60" cy="3"  r="1.8" fill={foxOrange} opacity="0.42" />
        </>
      )}
      {emotion === 'sleepy' && (
        <>
          <text x="43" y="13" fontSize="9"   fill="#8B5CF6" fontWeight="bold" opacity="0.85">z</text>
          <text x="48" y="8"  fontSize="7"   fill="#8B5CF6" fontWeight="bold" opacity="0.65">z</text>
          <text x="52" y="4"  fontSize="5"   fill="#8B5CF6" fontWeight="bold" opacity="0.45">z</text>
        </>
      )}
      {emotion === 'dizzy' && (
        <>
          <text x="4"  y="13" fontSize="12" fill="#FBBF24">★</text>
          <text x="48" y="9"  fontSize="9"  fill="#F472B6">★</text>
        </>
      )}
      {emotion === 'surprised' && (
        <ellipse cx="51" cy="14" rx="3" ry="5" fill="#60A5FA" opacity="0.8" />
      )}
      {emotion === 'excited' && (
        <>
          <text x="-3" y="11" fontSize="11" fill="#FBBF24">✦</text>
          <text x="50" y="7"  fontSize="8"  fill="#34D399">✦</text>
        </>
      )}
    </svg>
  )
}

// ── Branded Mochi SVG ────────────────────────────────────────────────────────
function MochiBody({
  emotion, poked, leftLegRot, rightLegRot, leftArmRot, rightArmRot, peeking = false,
}: {
  emotion: Emotion
  poked: boolean
  facing: 1 | -1
  leftLegRot:  MotionValue<number>
  rightLegRot: MotionValue<number>
  leftArmRot:  MotionValue<number>
  rightArmRot: MotionValue<number>
  peeking?: boolean
}) {
  const isAngry = emotion === 'angry'
  const isHappy = ['happy', 'excited', 'waving'].includes(emotion)
  const isSleepy = emotion === 'sleepy'
  const fur = isAngry ? '#B8493E' : '#D96737'
  const furWarm = isAngry ? '#D96055' : '#F18B4A'
  const furDark = isAngry ? '#78302A' : '#703B2A'
  const cream = '#FFE8BE'
  const creamLight = '#FFF5DE'
  const mask = isAngry ? '#5F2F2B' : '#6A3F32'
  const ink = '#211716'
  const blush = isHappy ? 0.45 : isAngry ? 0.12 : 0.24

  const browL = ({
    idle: 'M25 27 Q29 25.5 33 27',
    happy: 'M25 25 Q29 23.6 33 25',
    angry: 'M24 26 Q29 30 34 26',
    annoyed: 'M24 27 L34 27',
    surprised: 'M25 23.5 Q29 21.8 33 23.5',
    excited: 'M25 24 Q29 22.2 33 24',
    thinking: 'M24 27 Q29 24.5 34 26',
    sleepy: 'M25 28 Q29 27.2 33 28',
    waving: 'M25 25 Q29 23.6 33 25',
    dizzy: 'M24 26 Q29 24.5 34 26',
  } as Record<Emotion, string>)[emotion]

  const browR = ({
    idle: 'M49 27 Q53 25.5 57 27',
    happy: 'M49 25 Q53 23.6 57 25',
    angry: 'M48 26 Q53 30 58 26',
    annoyed: 'M48 27 L58 27',
    surprised: 'M49 23.5 Q53 21.8 57 23.5',
    excited: 'M49 24 Q53 22.2 57 24',
    thinking: 'M48 26 Q53 24.5 58 27',
    sleepy: 'M49 28 Q53 27.2 57 28',
    waving: 'M49 25 Q53 23.6 57 25',
    dizzy: 'M48 26 Q53 24.5 58 26',
  } as Record<Emotion, string>)[emotion]

  const mouth = ({
    idle: 'M35 45 Q41 49 47 45',
    happy: 'M33 43 Q41 53 49 43',
    angry: 'M35 49 Q41 45 47 49',
    annoyed: 'M35 47 Q41 46 47 47',
    surprised: 'M39 46 Q41 51 43 46',
    excited: 'M32 42 Q41 54 50 42',
    thinking: 'M35 45 Q41 48 47 45',
    sleepy: 'M36 46 Q41 48 46 46',
    waving: 'M33 43 Q41 53 49 43',
    dizzy: 'M35 46 Q38 43 41 46 Q44 49 47 46',
  } as Record<Emotion, string>)[emotion]

  return (
    <svg
      viewBox="0 0 82 96"
      className="w-full h-full"
      style={{ userSelect: 'none', overflow: 'visible' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mochi-fur" x1="22" y1="10" x2="62" y2="88">
          <stop offset="0%" stopColor={furWarm} />
          <stop offset="58%" stopColor={fur} />
          <stop offset="100%" stopColor={furDark} />
        </linearGradient>
        <radialGradient id="mochi-face" cx="42%" cy="26%">
          <stop offset="0%" stopColor="#FFFDF6" />
          <stop offset="76%" stopColor={creamLight} />
          <stop offset="100%" stopColor={cream} />
        </radialGradient>
        <linearGradient id="mochi-tail" x1="6" y1="71" x2="29" y2="42">
          <stop offset="0%" stopColor={furDark} />
          <stop offset="54%" stopColor={fur} />
          <stop offset="100%" stopColor="#F9C879" />
        </linearGradient>
        <linearGradient id="mochi-belly" x1="35" y1="56" x2="47" y2="88">
          <stop offset="0%" stopColor="#FFF7E6" />
          <stop offset="100%" stopColor="#FFDCA5" />
        </linearGradient>
        <linearGradient id="mochi-highlight" x1="25" y1="14" x2="55" y2="43">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.36" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <filter id="mochi-shadow">
          <feDropShadow dx="0" dy="5" stdDeviation="3" floodColor="#000" floodOpacity="0.2" />
        </filter>
      </defs>

      <ellipse cx="41" cy="92" rx="22" ry="4" fill="#000" opacity="0.14" />

      <motion.g
        style={{ originX: '24px', originY: '67px' }}
        animate={{ rotate: peeking ? [-5, 4, -5] : [-8, 7, -8] }}
        transition={{ repeat: Infinity, duration: peeking ? 2.6 : 4.2, ease: 'easeInOut' }}
      >
        <path
          d="M25 69 C11 69 2 60 4 48 C6 38 15 34 23 39 C17 45 18 55 27 60 C34 64 33 70 25 69 Z"
          fill="url(#mochi-tail)"
          filter="url(#mochi-shadow)"
        />
        <path d="M8 48 C14 45 20 47 24 53" fill="none" stroke="#FFE2A8" strokeWidth="5.5" strokeLinecap="round" opacity="0.9" />
        <path d="M13 61 C19 61 25 64 28 68" fill="none" stroke={furDark} strokeWidth="4.5" strokeLinecap="round" opacity="0.78" />
      </motion.g>

      <motion.g style={{ rotate: leftLegRot, originX: '32px', originY: '74px' }}>
        <path d="M29 72 C26 78 27 86 33 87 C38 85 38 78 35 72 Z" fill={mask} />
        <ellipse cx="33" cy="87" rx="6.5" ry="3.3" fill={mask} opacity="0.98" />
        <ellipse cx="33" cy="86.4" rx="3.2" ry="1.2" fill="#D59A73" opacity="0.35" />
      </motion.g>
      <motion.g style={{ rotate: rightLegRot, originX: '50px', originY: '74px' }}>
        <path d="M47 72 C44 78 45 85 50 87 C56 85 56 78 53 72 Z" fill={mask} />
        <ellipse cx="50" cy="87" rx="6.5" ry="3.3" fill={mask} opacity="0.98" />
        <ellipse cx="50" cy="86.4" rx="3.2" ry="1.2" fill="#D59A73" opacity="0.35" />
      </motion.g>

      <motion.g style={{ rotate: leftArmRot, originX: '27px', originY: '58px' }}>
        <path d="M28 56 C20 58 15 65 18 72 C22 75 28 71 28 65 C28 61 30 59 33 58 Z" fill={mask} />
        <ellipse cx="20" cy="72" rx="5.5" ry="4" fill={mask} opacity="0.98" />
        <ellipse cx="20" cy="71.2" rx="2.4" ry="1.1" fill="#D59A73" opacity="0.35" />
      </motion.g>
      <motion.g style={{ rotate: rightArmRot, originX: '55px', originY: '58px' }}>
        <path d="M54 56 C62 58 67 65 64 72 C60 75 54 71 54 65 C54 61 52 59 49 58 Z" fill={mask} />
        <ellipse cx="62" cy="72" rx="5.5" ry="4" fill={mask} opacity="0.98" />
        <ellipse cx="62" cy="71.2" rx="2.4" ry="1.1" fill="#D59A73" opacity="0.35" />
      </motion.g>

      <motion.g
        filter="url(#mochi-shadow)"
        animate={poked ? { scaleX: [1, 1.14, 0.9, 1], scaleY: [1, 0.88, 1.1, 1] } : {}}
        transition={{ duration: 0.36, ease: 'easeOut' }}
        style={{ originX: '41px', originY: '66px' }}
      >
        <path d="M22 52 C22 40 30 33 41 33 C52 33 60 40 60 52 L58 71 C57 84 49 90 41 90 C33 90 25 84 24 71 Z" fill="url(#mochi-fur)" />
        <path d="M30 58 C34 62 48 62 52 58 L51 77 C49 83 33 83 31 77 Z" fill="url(#mochi-belly)" />
        <path d="M26 53 C30 44 35 40 41 40 C47 40 52 44 56 53" fill="none" stroke="#FFD49D" strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />
      </motion.g>

      <motion.g
        filter="url(#mochi-shadow)"
        animate={{ y: peeking ? [0, -1.4, 0] : [0, 0.9, 0], rotate: peeking ? [-1.5, 1.5, -1.5] : [0, 0.8, 0] }}
        transition={{ repeat: Infinity, duration: peeking ? 1.9 : 3.4, ease: 'easeInOut' }}
        style={{ originX: '41px', originY: '34px' }}
      >
        <path d="M21 25 C14 16 15 8 22 5 C30 5 34 15 32 24 Z" fill={furDark} />
        <path d="M61 25 C68 16 67 8 60 5 C52 5 48 15 50 24 Z" fill={furDark} />
        <path d="M23 22 C19 16 20 11 23 10 C28 11 29 16 28 22 Z" fill={cream} opacity="0.9" />
        <path d="M59 22 C63 16 62 11 59 10 C54 11 53 16 54 22 Z" fill={cream} opacity="0.9" />
        <path d="M16 31 C15 16 25 9 41 9 C57 9 67 16 66 31 C65 46 55 55 41 55 C27 55 17 46 16 31 Z" fill="url(#mochi-fur)" />
        <path d="M17 29 C20 18 30 11 41 11 C52 11 62 18 65 29 C57 24 49 24 41 30 C33 24 25 24 17 29 Z" fill={furWarm} opacity="0.66" />
        <path d="M21 34 C21 26 28 22 36 25 C38 32 35 41 30 44 C25 45 21 40 21 34 Z" fill={mask} opacity="0.96" />
        <path d="M61 34 C61 26 54 22 46 25 C44 32 47 41 52 44 C57 45 61 40 61 34 Z" fill={mask} opacity="0.96" />
        <path d="M24 36 C24 30 30 26 36 28 C37 34 34 41 30 43 C26 43 24 40 24 36 Z" fill="url(#mochi-face)" />
        <path d="M58 36 C58 30 52 26 46 28 C45 34 48 41 52 43 C56 43 58 40 58 36 Z" fill="url(#mochi-face)" />
        <path d="M31 42 C33 36 37 33 41 33 C45 33 49 36 51 42 C49 50 45 54 41 54 C37 54 33 50 31 42 Z" fill={creamLight} />
        <path d="M18 25 C22 16 31 11 41 11 C51 11 60 16 64 25" fill="none" stroke="url(#mochi-highlight)" strokeWidth="5" strokeLinecap="round" />
      </motion.g>

      <path d={browL} fill="none" stroke={isAngry ? '#7F1D1D' : ink} strokeWidth="2.3" strokeLinecap="round" />
      <path d={browR} fill="none" stroke={isAngry ? '#7F1D1D' : ink} strokeWidth="2.3" strokeLinecap="round" />

      {isSleepy ? (
        <>
          <path d="M27 35 Q31 32 35 35" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M47 35 Q51 32 55 35" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : emotion === 'dizzy' ? (
        <>
          <path d="M27 32 L34 38 M34 32 L27 38 M48 32 L55 38 M55 32 L48 38" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
        </>
      ) : emotion === 'excited' ? (
        <>
          <path d="M31 30 L33 34 L37 35 L33 37 L31 41 L29 37 L25 35 L29 34 Z" fill={ink} />
          <path d="M51 30 L53 34 L57 35 L53 37 L51 41 L49 37 L45 35 L49 34 Z" fill={ink} />
        </>
      ) : (
        <>
          <ellipse cx="31" cy="35" rx={emotion === 'surprised' ? 5.5 : 4.5} ry={emotion === 'happy' ? 3 : 6.2} fill="#FFFFFF" />
          <ellipse cx="51" cy="35" rx={emotion === 'surprised' ? 5.5 : 4.5} ry={emotion === 'happy' ? 3 : 6.2} fill="#FFFFFF" />
          <ellipse cx="31" cy="36" rx={emotion === 'surprised' ? 3.2 : 2.7} ry={emotion === 'happy' ? 1.8 : 4} fill={ink} />
          <ellipse cx="51" cy="36" rx={emotion === 'surprised' ? 3.2 : 2.7} ry={emotion === 'happy' ? 1.8 : 4} fill={ink} />
          <circle cx="32.4" cy="33.4" r="1.15" fill="#FFFFFF" opacity="0.96" />
          <circle cx="52.4" cy="33.4" r="1.15" fill="#FFFFFF" opacity="0.96" />
        </>
      )}

      <ellipse cx="25" cy="43" rx="4.2" ry="3" fill="#F47C70" opacity={blush} />
      <ellipse cx="57" cy="43" rx="4.2" ry="3" fill="#F47C70" opacity={blush} />
      <path d={mouth} fill={isHappy ? ink : 'none'} stroke={isAngry ? '#7F1D1D' : ink} strokeWidth="2.2" strokeLinecap="round" />
      {isHappy && <rect x="36" y="46" width="10" height="4" rx="2" fill="#FFFFFF" opacity="0.92" />}
      <path d="M37 40 C39 38 43 38 45 40 C44 43 42 44 41 44 C40 44 38 43 37 40 Z" fill={ink} />
      <path d="M41 44 L41 46.5" stroke={ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />

      {peeking && (
        <>
          <path d="M17 57 Q23 52 30 57" fill="none" stroke={ink} strokeWidth="6" strokeLinecap="round" />
          <path d="M52 57 Q59 52 65 57" fill="none" stroke={ink} strokeWidth="6" strokeLinecap="round" />
        </>
      )}

      {emotion === 'thinking' && (
        <>
          <circle cx="65" cy="18" r="3.1" fill={furDark} opacity="0.55" />
          <circle cx="70" cy="13" r="2.1" fill={furDark} opacity="0.38" />
          <circle cx="73" cy="9" r="1.4" fill={furDark} opacity="0.26" />
        </>
      )}
      {emotion === 'annoyed' && <path d="M61 20 Q67 25 61 30" fill="none" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" opacity="0.75" />}
      {emotion === 'sleepy' && (
        <>
          <text x="57" y="20" fontSize="9" fill="#6366F1" fontWeight="700">z</text>
          <text x="63" y="14" fontSize="6" fill="#6366F1" fontWeight="700" opacity="0.65">z</text>
        </>
      )}
      {emotion === 'surprised' && <path d="M61 20 Q67 25 61 30" fill="none" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" opacity="0.75" />}
    </svg>
  )
}

// ── Speech bubble ─────────────────────────────────────────────────────────────
function SpeechBubble({
  text, isLoading, layout, onDismiss,
}: {
  text: string | null
  isLoading: boolean
  layout: BubbleLayout
  onDismiss: () => void
}) {
  const isBelow = layout.placement === 'bottom'
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.78, y: isBelow ? -8 : 8 }}
      animate={{ opacity: 1, scale: 1,    y: 0 }}
      exit={{    opacity: 0, scale: 0.78, y: isBelow ? -8 : 8 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      className="
        fixed bg-white dark:bg-zinc-800
        border border-orange-200 dark:border-orange-800
        rounded-2xl shadow-xl p-3 z-[10000]
      "
      style={{
        pointerEvents: 'auto',
        width: BUBBLE_W,
        maxWidth: `calc(100vw - ${VIEWPORT_PAD * 2}px)`,
        maxHeight: `calc(100vh - ${VIEWPORT_PAD * 2}px)`,
        overflowY: 'auto',
        left: layout.left,
        top: layout.top,
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground"
      >
        <X className="w-3 h-3" />
      </button>
      {isLoading ? (
        <div className="flex gap-1 items-center h-4 px-1">
          {[0,1,2].map(i => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-orange-400"
              animate={{ y: [0, -4, 0] }}
              transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-foreground pr-4">{text}</p>
      )}
      {/* Tail */}
      <div
        className={`absolute w-3 h-3 overflow-hidden ${isBelow ? '-top-[6px]' : '-bottom-[6px]'}`}
        style={{ left: layout.arrowX - 6 }}
      >
        <div
          className={`w-2.5 h-2.5 bg-white dark:bg-zinc-800 border-orange-200 dark:border-orange-800 rotate-45 translate-x-[2px] ${
            isBelow
              ? 'border-l border-t translate-y-[3px]'
              : 'border-r border-b -translate-y-[1px]'
          }`}
        />
      </div>
    </motion.div>
  )
}

// ── Main Mascot ────────────────────────────────────────────────────────────────
export function Mascot() {
  const location = useLocation()

  // ── Enabled state (localStorage, toggled from Settings) ───────────────────
  const [enabled, setEnabled] = useState(() => {
    const stored = localStorage.getItem('mochi_enabled')
    return stored !== 'false'
  })
  useEffect(() => {
    const handler = (e: Event) => setEnabled((e as CustomEvent<boolean>).detail)
    window.addEventListener('mochi_enabled_changed', handler)
    return () => window.removeEventListener('mochi_enabled_changed', handler)
  }, [])

  // ── React state ────────────────────────────────────────────────────────────
  const [visible,   setVisible]   = useState(true)
  const [phase,     setPhase]     = useState<Phase>('stationary')
  const [emotion,   setEmotion]   = useState<Emotion>('idle')
  const [bubble,    setBubble]    = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [facing,    setFacing]    = useState<1 | -1>(-1)
  const [poked,     setPoked]     = useState(false)
  const [pokeCount, setPokeCount] = useState(0)
  const [isDraggingVisual, setIsDraggingVisual] = useState(false)
  const [hideSide, setHideSide] = useState<HideSide | null>(null)
  const [bubbleLayout, setBubbleLayout] = useState<BubbleLayout>({
    left: 24,
    top: 24,
    arrowX: BUBBLE_W / 2,
    placement: 'top',
  })

  // ── Motion values (RAF-driven, zero re-renders for position) ─────────────
  const mvX         = useMotionValue(
    typeof window !== 'undefined' ? window.innerWidth - W - 28 : 500)
  const mvY         = useMotionValue(
    typeof window !== 'undefined' ? window.innerHeight - H - 20 : 400)
  const leftLegRot  = useMotionValue(0)
  const rightLegRot = useMotionValue(0)
  const leftArmRot  = useMotionValue(0)
  const rightArmRot = useMotionValue(0)
  const bodyBob     = useMotionValue(0)
  const bodyTilt    = useMotionValue(0)

  // ── Stable refs (avoid stale closures in RAF) ──────────────────────────────
  const emotionRef  = useRef<Emotion>('idle')
  const phaseRef    = useRef<Phase>('stationary')
  const facingRef   = useRef<1 | -1>(-1)
  const bubbleRef   = useRef<string | null>(null)
  const aiLoadingRef = useRef(false)
  const pokeCountRef = useRef(0)
  const rafRef      = useRef(0)
  const surfacesRef = useRef<DOMRect[]>([])
  const isScrollRef = useRef(false)
  const scrollTmr   = useRef<ReturnType<typeof setTimeout>>()
  const lastTapRef  = useRef<number | null>(null)
  const inspectTmr  = useRef<ReturnType<typeof setTimeout>>()
  const pageNameRef = useRef('dashboard')
  const monthRef    = useRef(new Date().getMonth() + 1)
  const yearRef     = useRef(new Date().getFullYear())
  const mascotRef   = useRef<HTMLDivElement | null>(null)
  const inspectTargetRef = useRef<DOMRect | null>(null)
  const bubbleLayoutRef = useRef<BubbleLayout>(bubbleLayout)
  const inspectedTargetsRef = useRef<Map<string, number>>(new Map())

  // sync state → refs
  useEffect(() => { emotionRef.current  = emotion  }, [emotion])
  useEffect(() => { phaseRef.current    = phase    }, [phase])
  useEffect(() => { facingRef.current   = facing   }, [facing])
  useEffect(() => { bubbleRef.current   = bubble   }, [bubble])
  useEffect(() => { aiLoadingRef.current = aiLoading }, [aiLoading])
  useEffect(() => { pokeCountRef.current = pokeCount }, [pokeCount])
  useEffect(() => { bubbleLayoutRef.current = bubbleLayout }, [bubbleLayout])
  useEffect(() => {
    if (!bubble && !aiLoading) return
    const p = phys.current
    const nextLayout = getBubbleLayout(p.x, p.y)
    bubbleLayoutRef.current = nextLayout
    setBubbleLayout(nextLayout)
  }, [bubble, aiLoading])
  useEffect(() => {
    pageNameRef.current = PAGE_NAMES[location.pathname] ?? 'dashboard'
    inspectedTargetsRef.current.clear()
  }, [location.pathname])

  // ── Physics state ──────────────────────────────────────────────────────────
  const phys = useRef({
    x: typeof window !== 'undefined' ? window.innerWidth  - W - 28 : 500,
    y: typeof window !== 'undefined' ? window.innerHeight - H - 20 : 400,
    vx: 0, vy: 0,
    onGround: true,
    walkPhase: 0,
    targetX: null as number | null,
    targetY: null as number | null,
    targetSide: null as HideSide | null,
    targetRect: null as DOMRect | null,
    targetKey: null as string | null,
    // drag
    isPointerDown: false,
    isDragging: false,
    dragOffX: 0, dragOffY: 0,
    velHistory: [] as { x: number; y: number; t: number }[],
    lastDragX: 0,
    lastDragY: 0,
    lastDragT: 0,
    // pointer tap detection
    downTime: 0,
    downX: 0, downY: 0,
  })

  // ── Surface detection ──────────────────────────────────────────────────────
  const refreshSurfaces = useCallback(() => {
    try {
      const nodes = document.querySelectorAll(
        'nav, header, [role="navigation"], [role="banner"], ' +
        '[class*="rounded-xl"], [class*="rounded-lg"], ' +
        'button, a[href], table, [class*="progress"], [class*="recharts-wrapper"]'
      )
      surfacesRef.current = Array.from(nodes)
        .map(el => el.getBoundingClientRect())
        .filter(r => r.width > 100 && r.height > 28 && r.top > 0 && r.top < window.innerHeight - 20)
    } catch {
      surfacesRef.current = []
    }
  }, [])

  function getFloorY(px: number, py: number): number {
    if (isScrollRef.current) return window.innerHeight - 2
    const footX = px + W / 2
    const footY = py + H
    let floor = window.innerHeight - 2
    for (const r of surfacesRef.current) {
      if (footX >= r.left - 6 && footX <= r.right + 6) {
        if (r.top >= footY - 8 && r.top < floor) floor = r.top
      }
    }
    return floor
  }

  // ── Find the nearest visible component to inspect ─────────────────────────
  const findTarget = useCallback((): InspectTarget | null => {
    const now = Date.now()
    for (const [key, inspectedAt] of inspectedTargetsRef.current) {
      if (now - inspectedAt > INSPECT_MEMORY_MS) inspectedTargetsRef.current.delete(key)
    }

    const candidates = Array.from(
      document.querySelectorAll(
        '[class*="rounded-xl"], [class*="rounded-lg"], [class*="card"], ' +
        'button, a[href], table, [class*="recharts-wrapper"], [role="button"]'
      )
    )
    const p = phys.current
    const mascotCenterX = p.x + W / 2
    const mascotCenterY = p.y + H / 2
    const viewportArea = window.innerWidth * window.innerHeight

    const visible = candidates.filter(el => {
      if ((el as HTMLElement).closest?.('[data-mochi-mascot="true"]')) return false
      const r = el.getBoundingClientRect()
      if (r.width < 86 || r.height < 28) return false
      if (r.width * r.height > viewportArea * 0.42) return false
      if (r.top < 48 || r.bottom > window.innerHeight - 16) return false
      if (r.right < 16 || r.left > window.innerWidth - 16) return false
      return true
    })
    if (visible.length === 0) return null

    const options = visible.map(el => {
      const rect = el.getBoundingClientRect()
      const nearestX = clamp(mascotCenterX, rect.left + W / 2, rect.right - W / 2)
      const x = clamp(nearestX - W / 2, 8, window.innerWidth - W - 8)
      const y = p.y
      const nearestY = rect.top
      const distance = Math.hypot(nearestX - mascotCenterX, nearestY - mascotCenterY)
      const specificity = Math.min(rect.width * rect.height / 22000, 6)
      const key = getTargetKey(el, rect)
      const inspectedAt = inspectedTargetsRef.current.get(key) ?? 0
      const alreadyInspected = now - inspectedAt <= INSPECT_MEMORY_MS
      return { x, y, side: 'top' as HideSide, rect, key, alreadyInspected, score: distance + specificity * 18 }
    })

    const freshOptions = options.filter(option => !option.alreadyInspected)
    if (freshOptions.length === 0) return null

    const pick = freshOptions.sort((a, b) => a.score - b.score)[0]
    return {
      x: pick.x,
      y: pick.y,
      side: pick.side,
      rect: pick.rect,
      key: pick.key,
    }
  }, [])

  // ── AI comment (uses what's visible on screen near Mochi) ─────────────────
  const fetchComment = useCallback(async () => {
    setAiLoading(true)
    setBubble(null)
    const p = phys.current
    setBubbleLayout(getBubbleLayout(p.x, p.y))
    try {
      const screenText = getNearbyText(p.x, p.y, mascotRef.current, inspectTargetRef.current ?? p.targetRect)
      const { data } = await api.post('/ai/mascot', {
        page:  pageNameRef.current,
        month: monthRef.current,
        year:  yearRef.current,
        ...(screenText ? { screen_text: screenText } : {}),
      })
      setBubble(data.comment ?? fallback(pageNameRef.current))
    } catch {
      setBubble(fallback(pageNameRef.current))
    } finally {
      setAiLoading(false)
    }
  }, [])

  // ── Start inspecting (arrived at target) ───────────────────────────────────
  const startInspect = useCallback(() => {
    const p = phys.current
    if (p.targetRect) {
      p.vx = 0
      p.vy = 0
      inspectTargetRef.current = p.targetRect
      if (p.targetKey) inspectedTargetsRef.current.set(p.targetKey, Date.now())
      setHideSide(p.targetSide)
    }
    setPhase('inspecting')
    setEmotion('thinking')
    fetchComment()
    inspectTmr.current = setTimeout(() => {
      setBubble(null)
      phys.current.targetX = null
      phys.current.targetY = null
      phys.current.targetSide = null
      phys.current.targetRect = null
      phys.current.targetKey = null
      inspectTargetRef.current = null
      setPhase('stationary')
      setHideSide(null)
      setEmotion('idle')
    }, 12000)
  }, [fetchComment])

  // ── RAF physics loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !visible) return

    refreshSurfaces()
    const surfInt = setInterval(refreshSurfaces, 2500)
    let lastTime = performance.now()

    function frame(now: number) {
      if (now - lastTime > 500) { lastTime = now; rafRef.current = requestAnimationFrame(frame); return }
      const dt = Math.min((now - lastTime) / 16.67, 2.5)
      lastTime = now

      const p   = phys.current
      const emo = emotionRef.current
      const ph  = phaseRef.current
      if (bubbleRef.current || aiLoadingRef.current) {
        const nextLayout = getBubbleLayout(p.x, p.y)
        const prevLayout = bubbleLayoutRef.current
        if (
          nextLayout.placement !== prevLayout.placement ||
          Math.abs(nextLayout.left - prevLayout.left) > 1 ||
          Math.abs(nextLayout.top - prevLayout.top) > 1 ||
          Math.abs(nextLayout.arrowX - prevLayout.arrowX) > 1
        ) {
          bubbleLayoutRef.current = nextLayout
          setBubbleLayout(nextLayout)
        }
      }

      if (!p.isDragging) {
        if (ph === 'inspecting' && p.targetRect) {
          if (p.targetSide) {
            const next = getHideTarget(p.targetRect, p.targetSide)
            p.targetX = Math.max(8, Math.min(window.innerWidth - W - 8, next.x))
            p.targetY = Math.max(8, Math.min(window.innerHeight - H - 8, next.y))
          }
          p.x += ((p.targetX ?? p.x) - p.x) * 0.12
          p.y += ((p.targetY ?? p.y) - p.y) * 0.12
          p.vx = 0
          p.vy = 0
          p.onGround = true
          mvX.set(p.x)
          mvY.set(p.y)
        }

        // Gravity
        if (!(p.targetRect && ph === 'inspecting')) {
          p.vy = Math.min(p.vy + GRAVITY * dt, MAX_VY)
        }

        // Floor / surface
        let ny = p.targetRect && ph === 'inspecting' ? p.y : p.y + p.vy * dt
        const floor = getFloorY(p.x, ny)
        if (p.targetRect && ph === 'inspecting') {
          p.onGround = true
        } else if (ny + H >= floor) {
            ny = floor - H
            if (p.vy > 3) {
              p.vy = -p.vy * BOUNCE
              if (p.vy < -2) {
                setEmotion('surprised')
                setTimeout(() => { if (emotionRef.current === 'surprised') setEmotion('idle') }, 600)
              }
            } else {
              p.vy = 0
            }
            p.onGround = true
        } else {
          p.onGround = false
        }

        // Horizontal movement based on phase
        if (ph === 'walking' && p.targetX !== null) {
          const dx = p.targetX - p.x
          const dy = (p.targetY ?? p.y) - p.y
          if (Math.abs(dx) < ARRIVE && Math.abs(dy) < ARRIVE) {
            p.vx = 0
            p.vy = 0
            startInspect()
          } else {
            const dir = dx > 0 ? 1 : -1
            const desiredVx = dir * Math.min(WALK_SPD, Math.max(0.45, Math.abs(dx) * 0.018))
            p.vx += (desiredVx - p.vx) * (p.onGround ? 0.12 : 0.045)
          }
        } else if (ph === 'stationary' || ph === 'inspecting') {
          p.vx *= Math.pow(0.90, dt)
          if (Math.abs(p.vx) < 0.05) p.vx = 0
        }

        // Wall clamp
        let nx = p.x + p.vx * dt
        if (nx < 0) { nx = 0; p.vx = Math.abs(p.vx) * 0.5 }
        if (nx + W > window.innerWidth) { nx = window.innerWidth - W; p.vx = -Math.abs(p.vx) * 0.5 }

        p.x = nx
        p.y = ny
        mvX.set(nx)
        mvY.set(ny)

        // Walk phase
        p.walkPhase += Math.abs(p.vx) * 0.14 * dt

        // Limb animation
        if (!p.onGround) {
          const tuck = p.vy < 0 ? -25 : 12
          leftLegRot.set(tuck)
          rightLegRot.set(-tuck * 0.7)
          leftArmRot.set(-38)
          rightArmRot.set(38)
          bodyBob.set(0)
          bodyTilt.set(Math.max(-12, Math.min(12, p.vy * 0.85)))
        } else {
          const legAmp = Math.min(Math.abs(p.vx) * 18, 28)
          leftLegRot.set(Math.sin(p.walkPhase) * legAmp)
          rightLegRot.set(Math.sin(p.walkPhase + Math.PI) * legAmp)

          const armAmp = Math.min(Math.abs(p.vx) * 14, 22)
          const speed = Math.abs(p.vx)
          if (speed > 0.15) {
            bodyBob.set(Math.sin(p.walkPhase * 1.8) * Math.min(speed * 2.4, 4.2))
            bodyTilt.set(Math.sin(p.walkPhase) * Math.min(speed * 3.4, 6) + p.vx * 1.2)
          } else {
            bodyBob.set(Math.sin(now / 720) * (emo === 'sleepy' ? 0.55 : 1.15))
            bodyTilt.set((emo === 'thinking' ? -2.5 : 0) + Math.sin(now / 1150) * 1.2)
          }

          if (emo === 'waving') {
            leftArmRot.set(-10)
            rightArmRot.set(Math.sin(now / 140) * 40 - 18)
          } else if (emo === 'thinking') {
            leftArmRot.set(8)
            rightArmRot.set(-36)
          } else if (emo === 'excited') {
            leftArmRot.set(Math.sin(now / 110) * 32 - 14)
            rightArmRot.set(-Math.sin(now / 110) * 32 + 14)
          } else if (emo === 'angry') {
            leftArmRot.set(Math.sin(now / 200) * 8 + 15)
            rightArmRot.set(-Math.sin(now / 200) * 8 - 15)
          } else {
            leftArmRot.set(Math.sin(p.walkPhase + Math.PI) * armAmp)
            rightArmRot.set(Math.sin(p.walkPhase) * armAmp)
          }
        }

        // Facing
        if (Math.abs(p.vx) > 0.3) {
          const nf: 1 | -1 = p.vx > 0 ? 1 : -1
          if (nf !== facingRef.current) { facingRef.current = nf; setFacing(nf) }
        }
      } else {
        bodyBob.set(0)
        bodyTilt.set(Math.max(-10, Math.min(10, p.vx * 1.1)))
      }

      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)

    const onScroll = () => {
      isScrollRef.current = true
      clearTimeout(scrollTmr.current)
      scrollTmr.current = setTimeout(() => {
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
  }, [enabled, visible, refreshSurfaces, mvX, mvY, leftLegRot, rightLegRot, leftArmRot, rightArmRot, bodyBob, bodyTilt, startInspect])

  // ── Page-change: wave + AI comment ────────────────────────────────────────
  useEffect(() => {
    clearTimeout(inspectTmr.current)
    setBubble(null)
    setAiLoading(false)
    phys.current.targetX = null
    phys.current.targetY = null
    phys.current.targetSide = null
    phys.current.targetRect = null
    phys.current.targetKey = null
    inspectTargetRef.current = null
    setHideSide(null)

    const t = setTimeout(() => {
      if (phaseRef.current === 'stationary' && emotionRef.current === 'idle') {
        setEmotion('waving')
        fetchComment()
        setTimeout(() => {
          if (emotionRef.current === 'waving') setEmotion('idle')
          setTimeout(() => { if (bubbleRef.current) setBubble(null) }, 6000)
        }, 2200)
      }
    }, 2800)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // ── Sleep if idle long enough ──────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      if (emotionRef.current === 'idle' && phaseRef.current === 'stationary' && !bubbleRef.current) {
        setEmotion('sleepy')
        const msg = "*yawns* ...dreaming of balanced budgets 💤"
        setBubble(msg)
        setTimeout(() => { if (bubbleRef.current === msg) setBubble(null) }, 4000)
        setTimeout(() => { if (emotionRef.current === 'sleepy') setEmotion('idle') }, 9000)
      }
    }, 90000)
    return () => clearTimeout(t)
  }, [emotion])

  // ── Pointer drag handlers ──────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const p = phys.current
    p.isPointerDown = true
    p.downTime = e.timeStamp
    p.downX    = e.clientX
    p.downY    = e.clientY
    p.velHistory = []
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const p = phys.current
    if (!p.isPointerDown) return
    if (e.pointerType === 'mouse' && e.buttons !== 1) return
    const dx = Math.abs(e.clientX - p.downX)
    const dy = Math.abs(e.clientY - p.downY)
    const moved = Math.hypot(e.clientX - p.downX, e.clientY - p.downY)
    const heldLongEnough = e.timeStamp - p.downTime >= DRAG_HOLD_MS

    if (!p.isDragging && moved > DRAG_START_PX && heldLongEnough) {
      p.isDragging = true
      setIsDraggingVisual(true)
      p.dragOffX = p.x - e.clientX
      p.dragOffY = p.y - e.clientY
      p.vx = 0
      p.vy = 0
      p.lastDragX = p.x
      p.lastDragY = p.y
      p.lastDragT = e.timeStamp
      clearTimeout(inspectTmr.current)
      if (phaseRef.current === 'inspecting' || phaseRef.current === 'walking') {
        setPhase('stationary')
      }
      p.targetX = null
      p.targetY = null
      p.targetSide = null
      p.targetRect = null
      p.targetKey = null
      inspectTargetRef.current = null
      setHideSide(null)
    }

    if (p.isDragging) {
      const nx = e.clientX + p.dragOffX
      const ny = e.clientY + p.dragOffY
      const dt = Math.max(1, e.timeStamp - p.lastDragT)
      p.vx = ((nx - p.lastDragX) / dt) * 16.67
      p.vy = ((ny - p.lastDragY) / dt) * 16.67
      p.lastDragX = nx
      p.lastDragY = ny
      p.lastDragT = e.timeStamp
      p.velHistory.push({ x: nx, y: ny, t: e.timeStamp })
      if (p.velHistory.length > 6) p.velHistory.shift()
      p.x = nx; p.y = ny
      mvX.set(nx); mvY.set(ny)
    }
  }, [mvX, mvY])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const p = phys.current
    const wasDragging = p.isDragging
    p.isPointerDown = false

    if (wasDragging) {
      p.isDragging = false
      setIsDraggingVisual(false)
      p.vx = Math.max(-8, Math.min(8, p.vx))
      p.vy = Math.max(-8, Math.min(8, p.vy))
      p.velHistory = []
    } else {
      setIsDraggingVisual(false)
      const tapDuration = e.timeStamp - p.downTime
      const tapMoved    = Math.hypot(e.clientX - p.downX, e.clientY - p.downY)
      if (tapDuration < 500 && tapMoved < DRAG_START_PX) {
        handleTap(e.timeStamp)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePointerLeave = useCallback(() => {
    const p = phys.current
    if (p.isPointerDown) return
    if (p.isDragging) return
    p.isPointerDown = false
    setIsDraggingVisual(false)
  }, [])

  // ── Tap logic: single click walks, rapid clicks poke/annoy ─────────────────
  const handleTap = useCallback((ts: number) => {
    const sinceLastTap = lastTapRef.current === null ? Infinity : ts - lastTapRef.current
    if (sinceLastTap < DUPLICATE_TAP_MS) return
    lastTapRef.current = ts

    if (sinceLastTap < RAPID_TAP_MS) {
      const count = pokeCountRef.current + 1
      const p = phys.current
      setPokeCount(count)
      setPoked(true)
      clearTimeout(inspectTmr.current)
      setAiLoading(false)
      setHideSide(null)
      p.targetX = null
      p.targetY = null
      p.targetSide = null
      p.targetRect = null
      p.targetKey = null
      inspectTargetRef.current = null
      p.vx = 0
      p.vy = count > 2 ? -3.4 : -1.8
      setPhase('stationary')

      const nextEmotion: Emotion = count >= 4 ? 'angry' : count >= 2 ? 'annoyed' : 'surprised'
      const msg = count >= 4
        ? "Tiny finance panda. Big personal-space policy 😤"
        : count >= 2
          ? "Okay okay, I'm not a calculator button 😑"
          : "Boop detected. Audit pending 👀"
      setEmotion(nextEmotion)
      setBubble(msg)
      setTimeout(() => setPoked(false), 420)
      setTimeout(() => {
        if (bubbleRef.current === msg) setBubble(null)
        if (emotionRef.current === nextEmotion) setEmotion('idle')
      }, 2600)
      setTimeout(() => {
        if (pokeCountRef.current === count) setPokeCount(0)
      }, 1800)
      return
    }

    setPokeCount(0)
    setPoked(false)
    clearTimeout(inspectTmr.current)
    setBubble(null)
    setAiLoading(false)
    setHideSide(null)

    const target = findTarget()
    if (target !== null) {
      const p = phys.current
      p.targetX = target.x
      p.targetY = target.y
      p.targetSide = target.side
      p.targetRect = target.rect
      p.targetKey = target.key
      p.vx = 0
      p.vy = 0
      inspectTargetRef.current = target.rect
      setPhase('walking')
      setEmotion('happy')
      setTimeout(() => { if (emotionRef.current === 'happy') setEmotion('idle') }, 1400)
    } else {
      const p = phys.current
      p.targetX = null
      p.targetY = null
      p.targetSide = null
      p.targetRect = null
      p.targetKey = null
      inspectTargetRef.current = null
      setPhase('stationary')
      setEmotion('waving')
      fetchComment()
      setTimeout(() => {
        if (emotionRef.current === 'waving') setEmotion('idle')
        if (bubbleRef.current) setBubble(null)
      }, 3500)
    }
  }, [fetchComment, findTarget])

  if (!enabled || !visible) return null

  return (
    <>
      <AnimatePresence>
        {(bubble || aiLoading) && (
          <SpeechBubble
            text={bubble}
            isLoading={aiLoading && !bubble}
            layout={bubbleLayout}
            onDismiss={() => { setBubble(null); setAiLoading(false) }}
          />
        )}
      </AnimatePresence>

      <motion.div
        ref={mascotRef}
        data-mochi-mascot="true"
        style={{
          x: mvX,
          y: mvY,
          position: 'fixed',
          left: 0,
          top: 0,
          width: W,
          height: H,
          zIndex: 9999,
          cursor: isDraggingVisual ? 'grabbing' : 'default',
          pointerEvents: 'auto',
        }}
        role="button"
        aria-label="Mochi mascot"
        tabIndex={0}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.0, type: 'spring', stiffness: 160, damping: 15 }}
        className="select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onDragStart={(e) => e.preventDefault()}
        draggable={false}
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        {/* Flip container */}
        <motion.div
          animate={{ scaleX: facing }}
          transition={{ duration: 0.13 }}
          style={{ width: W, height: H, y: bodyBob, rotate: bodyTilt }}
        >
          {/* Squish on poke */}
          <motion.div
            animate={poked
              ? { scaleX: [1, 1.4, 0.78, 1], scaleY: [1, 0.68, 1.22, 1] }
              : {}}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="drop-shadow-xl"
            style={{
              width: W,
              height: H,
              clipPath: phase === 'inspecting' ? getPeekClipPath(hideSide) : 'none',
              WebkitMaskImage: phase === 'inspecting' ? getPeekMaskImage(hideSide) : 'none',
              maskImage: phase === 'inspecting' ? getPeekMaskImage(hideSide) : 'none',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
              cursor: isDraggingVisual ? 'grabbing' : 'default',
              touchAction: 'none',
              pointerEvents: 'none',
            }}
          >
            <MochiBody
              emotion={emotion}
              poked={poked}
              facing={facing}
              leftLegRot={leftLegRot}
              rightLegRot={rightLegRot}
              leftArmRot={leftArmRot}
              rightArmRot={rightArmRot}
              peeking={phase === 'inspecting'}
            />
          </motion.div>
        </motion.div>

        {/* Dismiss × */}
        <motion.button
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1, scale: 1.15 }}
          style={{ position: 'absolute', top: -9, right: -9 }}
          className="w-5 h-5 rounded-full bg-muted border border-border text-muted-foreground flex items-center justify-center opacity-0 shadow-sm"
          data-mochi-hide="true"
          onClick={(e) => { e.stopPropagation(); setVisible(false) }}
          title="Hide Mochi"
        >
          <X className="w-3 h-3" />
        </motion.button>
      </motion.div>
    </>
  )
}
