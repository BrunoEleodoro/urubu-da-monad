'use client'

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  monadTradeSimulationRecipient,
  monadUsdc,
} from '@/lib/chains'

import styles from './game-screen.module.css'

const PAIR = 'MON/USD'
const CHAIN = 'Monad Mainnet'
const FEED =
  '0x31491744e2dbf6df7fcf4ac0820d18a609b49076d45066d3568424e62f686cd1'
const LATEST_API = 'https://hermes.pyth.network/v2/updates/price/latest'
const STREAM_API = 'https://hermes.pyth.network/v2/updates/price/stream'
const MAX = 12
const MAX_CHART_POINTS = 240
const STREAM_RETRY_MS = 2000
const ROUND_DURATION_MS = 2 * 60 * 1000
const MAX_BET = 1
const MIN_BET = 0.1
const SIMULATED_TRADE_AMOUNT = 1
const PAD = { top: 24, right: 80, bottom: 40, left: 16 }

type Direction = 'up' | 'down'
type WalletAction = 'connect' | 'disconnect' | 'switch-chain'

interface PriceEntry {
  id: string
  price: number
  conf: number
  ema: number
  time: number
  receivedAt: number
}

interface ChartPoint {
  t: number
  price: number
}

interface ActiveBet {
  direction: Direction
  amount: number
  entryPrice: number
  entryTime: number
}

interface BetMarker {
  t: number
  price: number
  amount: number
  direction: Direction
}

interface RoundResult {
  tone: 'win' | 'lose'
  text: string
  sub: string
}

interface TradeNotice {
  tone: 'default' | 'pending' | 'error' | 'success'
  message: string
}

export interface WalletUiState {
  connected: boolean
  connecting: boolean
  interactive: boolean
  action: WalletAction
  buttonLabel: string
  address: string
  addressLabel: string
  usdcBalanceLabel: string
  usdcBalanceValue: number | null
  chainLabel: string
  status: string
}

interface TradeSimulationResult {
  amountLabel: string
  receiverLabel: string
}

interface GameScreenProps {
  wallet: WalletUiState
  showPasskeyWalletButton: boolean
  onConnectWallet: () => Promise<void>
  onSwitchToMonad: () => Promise<void>
  onDisconnectWallet: () => void
  onOpenOffRamp: () => void
  onOpenOnRamp: () => void
  onOpenPasskeyWallet: () => void
  onSimulateTrade: (input: {
    direction: Direction
    amount: number
  }) => Promise<TradeSimulationResult>
}

function cn(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ')
}

function shortenAddress(address?: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function clampBet(value: number) {
  if (!Number.isFinite(value)) return 0.5
  return Number(Math.min(MAX_BET, Math.max(MIN_BET, value)).toFixed(2))
}

function parseEntry(node: {
  id: string
  price: { price: string; conf: string; expo: string | number; publish_time: string | number }
  ema_price: { price: string }
}) {
  const priceNode = node.price
  const emaNode = node.ema_price
  const expo = Number(priceNode.expo)
  const mul = Math.pow(10, expo)

  return {
    id: node.id,
    price: Number(priceNode.price) * mul,
    conf: Number(priceNode.conf) * mul,
    ema: Number(emaNode.price) * mul,
    time: Number(priceNode.publish_time),
    receivedAt: Date.now(),
  } satisfies PriceEntry
}

function usdDigits(value: number) {
  const abs = Math.abs(value)
  if (!Number.isFinite(abs)) return 4
  if (abs >= 1000) return 4
  if (abs >= 100) return 5
  if (abs >= 1) return 6
  if (abs >= 0.1) return 7
  if (abs >= 0.01) return 8
  return 8
}

function axisUsdDigits(min: number, max: number) {
  const anchor = Math.max(Math.abs(min), Math.abs(max), Math.abs(max - min))
  if (anchor >= 1000) return 3
  if (anchor >= 100) return 4
  if (anchor >= 1) return 5
  if (anchor >= 0.1) return 6
  return 7
}

function fmtUsd(value: number, digits = usdDigits(value)) {
  return (
    '$' +
    value.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  )
}

function fmt(value: number) {
  return fmtUsd(value)
}

function fmtHi(value: number) {
  return fmtUsd(value, 6)
}

function fmtTime(seconds: number) {
  return new Date(seconds * 1000).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function entryKey(entry: PriceEntry) {
  return [entry.time, entry.price, entry.conf, entry.ema].join(':')
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return 'Unable to simulate the 1 USDC transfer.'
}

async function fetchLatestPrice() {
  const response = await fetch(`${LATEST_API}?ids[]=${FEED}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const data = (await response.json()) as {
    parsed?: Array<{
      id: string
      price: {
        price: string
        conf: string
        expo: string | number
        publish_time: string | number
      }
      ema_price: {
        price: string
      }
    }>
  }

  if (!data.parsed?.length) {
    throw new Error('No parsed price returned')
  }

  return parseEntry(data.parsed[0])
}

export function GameScreen({
  wallet,
  showPasskeyWalletButton,
  onConnectWallet,
  onSwitchToMonad,
  onDisconnectWallet,
  onOpenOffRamp,
  onOpenOnRamp,
  onOpenPasskeyWallet,
  onSimulateTrade,
}: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)
  const frameRef = useRef<number | null>(null)
  const streamSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const fallbackPollRef = useRef<number | null>(null)
  const waitForDataRef = useRef<number | null>(null)
  const nextRoundTimeoutRef = useRef<number | null>(null)
  const dimensionsRef = useRef({ width: 0, height: 0, dpr: 1 })
  const lastEntryKeyRef = useRef<string | null>(null)
  const cacheRef = useRef<PriceEntry[]>([])
  const chartPointsRef = useRef<ChartPoint[]>([])
  const firstPriceRef = useRef<number | null>(null)
  const lastConfirmedPriceRef = useRef<number | null>(null)
  const targetPriceRef = useRef<number | null>(null)
  const lerpFromRef = useRef<{ price: number; t: number } | null>(null)
  const lerpStartMsRef = useRef(0)
  const roundNumberRef = useRef(0)
  const roundStartTimeRef = useRef<number | null>(null)
  const roundStateRef = useRef<'waiting' | 'open' | 'cooldown'>('waiting')
  const activeBetRef = useRef<ActiveBet | null>(null)
  const betMarkersRef = useRef<BetMarker[]>([])
  const demoBalanceRef = useRef(25000)
  const liveEnabledRef = useRef(false)
  const tradePendingDirectionRef = useRef<Direction | null>(null)

  const pnlAmountRef = useRef<HTMLDivElement>(null)
  const pnlDetailRef = useRef<HTMLDivElement>(null)
  const pnlTimerRef = useRef<HTMLDivElement>(null)
  const pnlHintRef = useRef<HTMLDivElement>(null)

  const [cache, setCache] = useState<PriceEntry[]>([])
  const [betAmount, setBetAmount] = useState('0.50')
  const [tradeDrawerOpen, setTradeDrawerOpen] = useState(false)
  const [roundState, setRoundState] = useState<'waiting' | 'open' | 'cooldown'>(
    'waiting',
  )
  const [hasMarketData, setHasMarketData] = useState(false)
  const [activeBet, setActiveBet] = useState<ActiveBet | null>(null)
  const [tradePendingDirection, setTradePendingDirection] =
    useState<Direction | null>(null)
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null)
  const [tradeNotice, setTradeNotice] = useState<TradeNotice>({
    tone: 'default',
    message: `Each LONG/SHORT simulates ${SIMULATED_TRADE_AMOUNT.toFixed(2)} ${monadUsdc.symbol} to ${shortenAddress(monadTradeSimulationRecipient)} on ${CHAIN}.`,
  })

  const deferredCache = useDeferredValue(cache)

  const setRoundMode = useCallback(
    (value: 'waiting' | 'open' | 'cooldown') => {
      roundStateRef.current = value
      setRoundState(value)
    },
    [],
  )

  const setCurrentBet = useCallback((value: ActiveBet | null) => {
    activeBetRef.current = value
    setActiveBet(value)
  }, [])

  const trimChartPoints = useCallback(() => {
    if (chartPointsRef.current.length > MAX_CHART_POINTS) {
      chartPointsRef.current = chartPointsRef.current.slice(-MAX_CHART_POINTS)
    }
  }, [])

  const currentDisplayPrice = useCallback((now: number) => {
    if (targetPriceRef.current === null) return lastConfirmedPriceRef.current
    if (!lerpFromRef.current) return targetPriceRef.current

    const elapsed = now - lerpStartMsRef.current
    const t = Math.min(elapsed / 400, 1)
    return (
      lerpFromRef.current.price +
      (targetPriceRef.current - lerpFromRef.current.price) * t
    )
  }, [])

  const updateOverlay = useCallback(
    (currentPrice: number) => {
      const amountNode = pnlAmountRef.current
      const detailNode = pnlDetailRef.current
      const timerNode = pnlTimerRef.current
      const hintNode = pnlHintRef.current

      if (!amountNode || !detailNode || !timerNode || !hintNode) return

      if (roundStartTimeRef.current) {
        const remaining = Math.max(
          0,
          ROUND_DURATION_MS - (Date.now() - roundStartTimeRef.current),
        )
        const seconds = Math.ceil(remaining / 1000)
        const minutesValue = Math.floor(seconds / 60)
        const secondsValue = seconds % 60
        timerNode.textContent = `${String(minutesValue).padStart(2, '0')}:${String(secondsValue).padStart(2, '0')}`
      } else {
        timerNode.textContent = ''
      }

      if (!activeBetRef.current) {
        amountNode.textContent = fmtHi(currentPrice)
        amountNode.dataset.tone = 'idle'
        detailNode.textContent = `${PAIR} · ${fmtHi(currentPrice)}`
        detailNode.dataset.tone = 'idle'
        hintNode.style.display = ''
        hintNode.textContent =
          roundStateRef.current === 'open'
            ? 'Place a bet ▲ UP or ▼ DOWN'
            : hasMarketData
              ? 'Next round starting...'
              : 'Connecting to the live MON/USD feed...'
        return
      }

      const bet = activeBetRef.current
      const priceDiff = currentPrice - bet.entryPrice
      const pctChange = priceDiff / bet.entryPrice
      const dirMult = bet.direction === 'down' ? -1 : 1
      const totalPnl = bet.amount * pctChange * dirMult * 10
      const won = totalPnl >= 0
      const pctPnl = ((totalPnl / bet.amount) * 100) || 0

      amountNode.textContent = `${pctPnl >= 0 ? '+' : ''}${pctPnl.toFixed(4)}%`
      amountNode.dataset.tone = won ? 'win' : 'lose'
      detailNode.textContent = `${bet.direction === 'up' ? '▲' : '▼'} ${
        won ? '+$' : '-$'
      }${Math.abs(totalPnl).toFixed(6)} | Entry ${fmtHi(bet.entryPrice)} | Now ${fmtHi(currentPrice)}`
      detailNode.dataset.tone = won ? 'win' : 'lose'
      hintNode.style.display = 'none'
    },
    [hasMarketData],
  )

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas?.parentElement) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.parentElement.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const context = canvas.getContext('2d')

    if (!context) return

    dimensionsRef.current = { width, height, dpr }
    contextRef.current = context

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  const drawChart = useCallback(
    (now: number) => {
      const context = contextRef.current
      const { width, height } = dimensionsRef.current

      if (!context || !width || !height) return

      context.clearRect(0, 0, width, height)

      const chartWidth = width - PAD.left - PAD.right
      const chartHeight = height - PAD.top - PAD.bottom

      context.strokeStyle = 'rgba(255,255,255,0.03)'
      context.lineWidth = 1

      for (let index = 0; index <= 6; index += 1) {
        const y = PAD.top + (chartHeight / 6) * index
        context.beginPath()
        context.moveTo(PAD.left, y)
        context.lineTo(width - PAD.right, y)
        context.stroke()
      }

      for (let index = 0; index <= 8; index += 1) {
        const x = PAD.left + (chartWidth / 8) * index
        context.beginPath()
        context.moveTo(x, PAD.top)
        context.lineTo(x, height - PAD.bottom)
        context.stroke()
      }

      if (chartPointsRef.current.length === 0) {
        context.font = '13px var(--font-mono), monospace'
        context.fillStyle = '#3e3e5a'
        context.textAlign = 'center'
        context.fillText('Waiting for Pyth oracle data...', width / 2, height / 2)
        return
      }

      const liveTime = Date.now()
      const livePrice = currentDisplayPrice(now)

      if (livePrice === null) return

      const renderPoints = chartPointsRef.current.concat({
        t: liveTime,
        price: livePrice,
      })

      updateOverlay(livePrice)

      const timeMin = renderPoints[0].t
      const timeMax = renderPoints[renderPoints.length - 1].t

      let priceMin = Number.POSITIVE_INFINITY
      let priceMax = Number.NEGATIVE_INFINITY

      for (const point of renderPoints) {
        if (point.price < priceMin) priceMin = point.price
        if (point.price > priceMax) priceMax = point.price
      }

      for (const marker of betMarkersRef.current) {
        if (marker.price < priceMin) priceMin = marker.price
        if (marker.price > priceMax) priceMax = marker.price
      }

      const priceRange = priceMax - priceMin || 1
      priceMin -= priceRange * 0.18
      priceMax += priceRange * 0.18

      const timeRange = timeMax - timeMin || 1
      const toX = (timeValue: number) =>
        PAD.left + ((timeValue - timeMin) / timeRange) * chartWidth
      const toY = (priceValue: number) =>
        PAD.top + (1 - (priceValue - priceMin) / (priceMax - priceMin)) * chartHeight

      context.font = '10px var(--font-mono), monospace'
      context.fillStyle = '#3e3e5a'

      for (let index = 0; index <= 5; index += 1) {
        const priceValue = priceMin + (priceMax - priceMin) * (index / 5)
        context.textAlign = 'left'
        context.fillText(
          fmtUsd(priceValue, axisUsdDigits(priceMin, priceMax)),
          width - PAD.right + 6,
          toY(priceValue) + 3,
        )
      }

      context.textAlign = 'center'
      const timeStep = Math.max(1, Math.floor(renderPoints.length / 5))

      for (let index = 0; index < renderPoints.length; index += timeStep) {
        const timeValue = new Date(renderPoints[index].t)
        context.fillText(
          timeValue.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          toX(renderPoints[index].t),
          height - 10,
        )
      }

      if (activeBetRef.current) {
        const entryPrice = activeBetRef.current.entryPrice
        const entryY = toY(entryPrice)
        context.save()
        context.setLineDash([6, 4])
        context.strokeStyle = 'rgba(245,158,11,0.35)'
        context.lineWidth = 1
        context.beginPath()
        context.moveTo(PAD.left, entryY)
        context.lineTo(width - PAD.right, entryY)
        context.stroke()
        context.font = '10px var(--font-mono), monospace'
        context.fillStyle = '#f59e0b'
        context.textAlign = 'left'
        context.fillText(
          `ENTRY ${fmtUsd(entryPrice, axisUsdDigits(priceMin, priceMax))}`,
          width - PAD.right + 6,
          entryY - 6,
        )
        context.restore()
      } else if (firstPriceRef.current !== null) {
        context.save()
        context.setLineDash([6, 4])
        context.strokeStyle = 'rgba(245,158,11,0.2)'
        context.lineWidth = 1
        const baseY = toY(firstPriceRef.current)
        context.beginPath()
        context.moveTo(PAD.left, baseY)
        context.lineTo(width - PAD.right, baseY)
        context.stroke()
        context.restore()
      }

      const entryPrice = activeBetRef.current?.entryPrice ?? null
      let curveHex = '#f59e0b'
      let curveRgb = '245,158,11'

      if (entryPrice !== null) {
        const above = livePrice >= entryPrice
        const winning =
          activeBetRef.current?.direction === 'down' ? !above : above
        curveHex = winning ? '#22c55e' : '#ef4444'
        curveRgb = winning ? '34,197,94' : '239,68,68'
      }

      context.beginPath()
      context.moveTo(toX(renderPoints[0].t), toY(renderPoints[0].price))

      if (renderPoints.length === 2) {
        context.lineTo(toX(renderPoints[1].t), toY(renderPoints[1].price))
      } else {
        for (let index = 0; index < renderPoints.length - 1; index += 1) {
          const x0 = toX(renderPoints[index].t)
          const y0 = toY(renderPoints[index].price)
          const x1 = toX(renderPoints[index + 1].t)
          const y1 = toY(renderPoints[index + 1].price)
          const mx = (x0 + x1) / 2
          const my = (y0 + y1) / 2

          if (index === 0) {
            context.lineTo(mx, my)
          } else {
            context.quadraticCurveTo(x0, y0, mx, my)
          }
        }

        const lastPoint = renderPoints[renderPoints.length - 1]
        context.lineTo(toX(lastPoint.t), toY(lastPoint.price))
      }

      context.strokeStyle = curveHex
      context.lineWidth = 3
      context.lineJoin = 'round'
      context.lineCap = 'round'
      context.stroke()

      const lastPoint = renderPoints[renderPoints.length - 1]
      context.lineTo(toX(lastPoint.t), height - PAD.bottom)
      context.lineTo(toX(renderPoints[0].t), height - PAD.bottom)
      context.closePath()

      const gradient = context.createLinearGradient(0, PAD.top, 0, height - PAD.bottom)
      gradient.addColorStop(0, `rgba(${curveRgb}, 0.25)`)
      gradient.addColorStop(0.5, `rgba(${curveRgb}, 0.10)`)
      gradient.addColorStop(1, `rgba(${curveRgb}, 0)`)
      context.fillStyle = gradient
      context.fill()

      context.save()
      context.beginPath()
      context.moveTo(toX(renderPoints[0].t), toY(renderPoints[0].price))

      for (let index = 0; index < renderPoints.length - 1; index += 1) {
        const x0 = toX(renderPoints[index].t)
        const y0 = toY(renderPoints[index].price)
        const x1 = toX(renderPoints[index + 1].t)
        const y1 = toY(renderPoints[index + 1].price)
        const mx = (x0 + x1) / 2
        const my = (y0 + y1) / 2

        if (index === 0) {
          context.lineTo(mx, my)
        } else {
          context.quadraticCurveTo(x0, y0, mx, my)
        }
      }

      context.lineTo(toX(lastPoint.t), toY(lastPoint.price))
      context.strokeStyle = `rgba(${curveRgb}, 0.3)`
      context.lineWidth = 8
      context.lineJoin = 'round'
      context.stroke()
      context.restore()

      for (const marker of betMarkersRef.current) {
        if (marker.t < timeMin || marker.t > timeMax) continue

        const markerX = toX(marker.t)
        const markerY = toY(marker.price)
        const isUp = marker.direction === 'up'
        const markerColor = isUp ? '34,197,94' : '239,68,68'
        const markerHex = isUp ? '#22c55e' : '#ef4444'

        context.beginPath()
        context.arc(markerX, markerY, 18, 0, Math.PI * 2)
        context.fillStyle = `rgba(${markerColor}, 0.12)`
        context.fill()

        context.beginPath()
        context.arc(markerX, markerY, 12, 0, Math.PI * 2)
        context.fillStyle = `rgba(${markerColor}, 0.2)`
        context.fill()

        context.font = '22px serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText('\u{1F985}', markerX, markerY)

        context.font = '9px var(--font-mono), monospace'
        context.fillStyle = markerHex
        context.textBaseline = 'top'
        context.fillText(
          `$${marker.amount.toFixed(2)} ${isUp ? '▲' : '▼'}`,
          markerX,
          markerY + 16,
        )
        context.textBaseline = 'alphabetic'
      }

      const dotX = toX(lastPoint.t)
      const dotY = toY(lastPoint.price)

      context.beginPath()
      context.arc(dotX, dotY, 12, 0, Math.PI * 2)
      context.fillStyle = `rgba(${curveRgb}, 0.15)`
      context.fill()

      context.beginPath()
      context.arc(dotX, dotY, 8, 0, Math.PI * 2)
      context.strokeStyle = `rgba(${curveRgb}, 0.35)`
      context.lineWidth = 2
      context.stroke()

      context.beginPath()
      context.arc(dotX, dotY, 5, 0, Math.PI * 2)
      context.fillStyle = curveHex
      context.fill()
    },
    [currentDisplayPrice, hasMarketData, updateOverlay],
  )

  const renderLoop = useCallback(
    (now: number) => {
      drawChart(now)

      if (roundStartTimeRef.current) {
        const elapsed = Date.now() - roundStartTimeRef.current
        const remaining = Math.max(0, ROUND_DURATION_MS - elapsed)

        if (remaining <= 0) {
          roundStartTimeRef.current = null
          setRoundMode('cooldown')

          const currentPrice = lastConfirmedPriceRef.current
          const bet = activeBetRef.current
          let totalPnl = 0

          if (currentPrice !== null && bet) {
            const priceDiff = currentPrice - bet.entryPrice
            const pctChange = priceDiff / bet.entryPrice
            const dirMult = bet.direction === 'down' ? -1 : 1
            const pnl = bet.amount * pctChange * dirMult * 10

            totalPnl = pnl
            demoBalanceRef.current += bet.amount + pnl

            const won = totalPnl >= 0
            const pctResult = (totalPnl / bet.amount) * 100
            setRoundResult({
              tone: won ? 'win' : 'lose',
              text: `${pctResult >= 0 ? '+' : ''}${pctResult.toFixed(4)}%`,
              sub: `\u{1F985} ${won ? '+$' : '-$'}${Math.abs(totalPnl).toFixed(6)}`,
            })
          }

          setCurrentBet(null)

          if (nextRoundTimeoutRef.current) {
            window.clearTimeout(nextRoundTimeoutRef.current)
          }

          nextRoundTimeoutRef.current = window.setTimeout(() => {
            if (lastConfirmedPriceRef.current === null) return

            roundNumberRef.current += 1
            roundStartTimeRef.current = Date.now()
            firstPriceRef.current = lastConfirmedPriceRef.current
            chartPointsRef.current = [
              {
                t: roundStartTimeRef.current,
                price: lastConfirmedPriceRef.current,
              },
            ]

            setCurrentBet(null)
            setRoundResult(null)
            setTradePendingDirection(null)
            tradePendingDirectionRef.current = null
            setRoundMode('open')
          }, 3000)
        }
      }

      frameRef.current = window.requestAnimationFrame(renderLoop)
    },
    [drawChart, setCurrentBet, setRoundMode],
  )

  const ingestEntry = useCallback(
    (entry: PriceEntry) => {
      const key = entryKey(entry)
      if (key === lastEntryKeyRef.current) return false

      lastEntryKeyRef.current = key

      const now = entry.receivedAt || Date.now()

      if (firstPriceRef.current === null) {
        firstPriceRef.current = entry.price
      }

      const nextCache = cacheRef.current.concat(entry).slice(-MAX)
      cacheRef.current = nextCache
      startTransition(() => setCache(nextCache))

      if (lastConfirmedPriceRef.current !== null) {
        chartPointsRef.current.push({
          t: now,
          price: currentDisplayPrice(performance.now()) ?? entry.price,
        })
      }

      lerpFromRef.current = {
        price: lastConfirmedPriceRef.current ?? entry.price,
        t: now,
      }
      targetPriceRef.current = entry.price
      lerpStartMsRef.current = performance.now()
      lastConfirmedPriceRef.current = entry.price

      if (chartPointsRef.current.length === 0) {
        chartPointsRef.current.push({ t: now, price: entry.price })
        lerpFromRef.current = null
      }

      trimChartPoints()
      setHasMarketData(true)
      return true
    },
    [currentDisplayPrice, trimChartPoints],
  )

  const fetchOnce = useCallback(async () => {
    const entry = await fetchLatestPrice()
    ingestEntry(entry)
  }, [ingestEntry])

  const stopFeedTransports = useCallback(() => {
    if (streamSourceRef.current) {
      streamSourceRef.current.close()
      streamSourceRef.current = null
    }

    if (fallbackPollRef.current !== null) {
      window.clearInterval(fallbackPollRef.current)
      fallbackPollRef.current = null
    }

    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const startFallbackPolling = useCallback(() => {
    if (fallbackPollRef.current !== null) return

    void fetchOnce()
    fallbackPollRef.current = window.setInterval(() => {
      void fetchOnce()
    }, 1000)
  }, [fetchOnce])

  const connectLiveStream = useCallback(() => {
    if (!liveEnabledRef.current) return

    if (typeof window === 'undefined' || !('EventSource' in window)) {
      startFallbackPolling()
      return
    }

    if (streamSourceRef.current) {
      streamSourceRef.current.close()
    }

    const source = new EventSource(`${STREAM_API}?ids[]=${FEED}`)
    streamSourceRef.current = source

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          parsed?: Array<{
            id: string
            price: {
              price: string
              conf: string
              expo: string | number
              publish_time: string | number
            }
            ema_price: {
              price: string
            }
          }>
        }

        if (!payload.parsed?.length) return

        const entry = parseEntry(payload.parsed[0])
        ingestEntry(entry)
      } catch {
        // Ignore malformed events and keep the stream alive.
      }
    }

    source.onerror = () => {
      if (streamSourceRef.current) {
        streamSourceRef.current.close()
        streamSourceRef.current = null
      }

      if (!liveEnabledRef.current || reconnectTimeoutRef.current !== null) return

      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectTimeoutRef.current = null
        connectLiveStream()
      }, STREAM_RETRY_MS)
    }
  }, [ingestEntry, startFallbackPolling])

  const startRound = useCallback(() => {
    if (lastConfirmedPriceRef.current === null) return

    roundNumberRef.current += 1
    roundStartTimeRef.current = Date.now()
    firstPriceRef.current = lastConfirmedPriceRef.current
    chartPointsRef.current = [
      {
        t: roundStartTimeRef.current,
        price: lastConfirmedPriceRef.current,
      },
    ]

    setCurrentBet(null)
    setRoundResult(null)
    setTradePendingDirection(null)
    tradePendingDirectionRef.current = null
    setRoundMode('open')
  }, [setCurrentBet, setRoundMode])

  const handleWalletButtonClick = useCallback(async () => {
    if (wallet.action === 'disconnect') {
      onDisconnectWallet()
      return
    }

    if (wallet.action === 'switch-chain') {
      await onSwitchToMonad()
      return
    }

    await onConnectWallet()
  }, [onConnectWallet, onDisconnectWallet, onSwitchToMonad, wallet.action])

  const handlePlaceBet = useCallback(
    async (direction: Direction) => {
      if (
        roundStateRef.current !== 'open' ||
        activeBetRef.current ||
        tradePendingDirectionRef.current ||
        lastConfirmedPriceRef.current === null
      ) {
        return
      }

      if (wallet.connecting) {
        setTradeNotice({
          tone: 'pending',
          message: 'Finish the wallet flow to continue.',
        })
        return
      }

      if (!wallet.connected) {
        setTradeNotice({
          tone: 'error',
          message: 'Connect your wallet to simulate the 1 USDC transfer.',
        })
        await onConnectWallet()
        return
      }

      if (wallet.action === 'switch-chain') {
        setTradeNotice({
          tone: 'error',
          message: 'Switch to Monad Mainnet before opening a position.',
        })
        await onSwitchToMonad()
        return
      }

      if (
        wallet.usdcBalanceValue !== null &&
        wallet.usdcBalanceValue < SIMULATED_TRADE_AMOUNT
      ) {
        setTradeNotice({
          tone: 'error',
          message: `You need at least ${SIMULATED_TRADE_AMOUNT.toFixed(2)} ${monadUsdc.symbol} to simulate this transfer.`,
        })
        return
      }

      const amount = clampBet(Number.parseFloat(betAmount) || 0.5)

      if (amount > demoBalanceRef.current) {
        setTradeNotice({
          tone: 'error',
          message: 'Not enough round balance to open this position.',
        })
        return
      }

      tradePendingDirectionRef.current = direction
      setTradePendingDirection(direction)
      setTradeNotice({
        tone: 'pending',
        message: `Simulating ${SIMULATED_TRADE_AMOUNT.toFixed(2)} ${monadUsdc.symbol} on ${CHAIN}...`,
      })

      try {
        const simulation = await onSimulateTrade({ direction, amount })

        if (roundStateRef.current !== 'open' || activeBetRef.current) {
          setTradeNotice({
            tone: 'error',
            message: 'The round closed before the simulation finished.',
          })
          return
        }

        const livePrice = currentDisplayPrice(performance.now())

        if (livePrice === null) {
          throw new Error('Live price unavailable.')
        }

        demoBalanceRef.current -= amount

        const nextBet = {
          direction,
          amount,
          entryPrice: livePrice,
          entryTime: Date.now(),
        } satisfies ActiveBet

        setCurrentBet(nextBet)
        betMarkersRef.current = betMarkersRef.current.concat({
          t: Date.now(),
          price: livePrice,
          amount,
          direction,
        })

        setTradeNotice({
          tone: 'success',
          message: `Simulation ready: ${simulation.amountLabel} -> ${simulation.receiverLabel}.`,
        })

        if (window.innerWidth <= 768) {
          setTradeDrawerOpen(false)
        }
      } catch (error) {
        setTradeNotice({
          tone: 'error',
          message: getErrorMessage(error),
        })
      } finally {
        tradePendingDirectionRef.current = null
        setTradePendingDirection(null)
      }
    },
    [
      betAmount,
      currentDisplayPrice,
      onConnectWallet,
      onSimulateTrade,
      onSwitchToMonad,
      setCurrentBet,
      wallet.action,
      wallet.connected,
      wallet.connecting,
      wallet.usdcBalanceValue,
    ],
  )

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    frameRef.current = window.requestAnimationFrame(renderLoop)
    liveEnabledRef.current = true

    void fetchOnce()
      .catch(() => {
        // The stream/fallback transport will keep trying even if the initial fetch fails.
      })
      .finally(() => {
        connectLiveStream()

        waitForDataRef.current = window.setInterval(() => {
          if (lastConfirmedPriceRef.current === null) return

          if (waitForDataRef.current !== null) {
            window.clearInterval(waitForDataRef.current)
            waitForDataRef.current = null
          }

          startRound()
        }, 200)
      })

    return () => {
      liveEnabledRef.current = false
      stopFeedTransports()

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }

      if (waitForDataRef.current !== null) {
        window.clearInterval(waitForDataRef.current)
      }

      if (nextRoundTimeoutRef.current !== null) {
        window.clearTimeout(nextRoundTimeoutRef.current)
      }

      window.removeEventListener('resize', resizeCanvas)
    }
  }, [connectLiveStream, fetchOnce, renderLoop, resizeCanvas, startRound, stopFeedTransports])

  const reversedCache = useMemo(() => [...deferredCache].reverse(), [deferredCache])

  const tradeMeta = useMemo(() => {
    if (activeBet) {
      return `${activeBet.direction === 'up' ? 'LONG' : 'SHORT'} $${activeBet.amount.toFixed(2)} live`
    }

    if (roundState === 'open') {
      return 'Open long or short'
    }

    return hasMarketData ? 'Waiting for the next round' : 'Connecting to live price'
  }, [activeBet, hasMarketData, roundState])

  const walletDisabled = !wallet.interactive && !wallet.connected
  const longLabel =
    tradePendingDirection === 'up'
      ? 'SIMULATING'
      : activeBet?.direction === 'up'
        ? 'PLACED'
        : 'LONG'
  const shortLabel =
    tradePendingDirection === 'down'
      ? 'SIMULATING'
      : activeBet?.direction === 'down'
        ? 'PLACED'
        : 'SHORT'
  const buttonsDisabled =
    !hasMarketData || roundState !== 'open' || activeBet !== null || tradePendingDirection !== null

  return (
    <main className={styles.root}>
      <div className={styles.shell}>
        <nav className={styles.topnav}>
          <div className={styles.topnavLeft}>
            <img
              src="/game/logo-icon.png"
              alt="Urubu da Monad"
              className={styles.topnavLogo}
            />
            <span className={styles.topnavBrand}>URUBU DA MONAD</span>
          </div>

          <div className={styles.topnavRight}>
            <div className={styles.rampDock}>
              <div className={styles.rampDockButtons}>
                <button
                  type="button"
                  className={styles.rampBtn}
                  onClick={onOpenOnRamp}
                >
                  On-ramp
                </button>
                <button
                  type="button"
                  className={cn(styles.rampBtn, styles.rampBtnSecondary)}
                  onClick={onOpenOffRamp}
                >
                  Off-ramp
                </button>
              </div>
              <span className={styles.rampMeta}>BRL and PIX via Orda</span>
            </div>

            <button
              type="button"
              className={cn(
                styles.walletBtn,
                wallet.connected && styles.walletBtnConnected,
                wallet.connecting && styles.walletBtnConnecting,
              )}
              onClick={() => {
                void handleWalletButtonClick()
              }}
              disabled={walletDisabled}
            >
              <span className={styles.walletIndicator} />
              <span className={styles.walletCopy}>
                <span className={styles.walletLabel}>{wallet.buttonLabel}</span>
                <span className={styles.walletSub}>
                  {wallet.connecting
                    ? 'Finish the wallet flow'
                    : wallet.connected
                      ? wallet.usdcBalanceLabel || wallet.chainLabel || 'Tap to disconnect'
                      : wallet.status || 'Use your Farcaster wallet'}
                </span>
              </span>
            </button>

            {showPasskeyWalletButton ? (
              <button
                type="button"
                className={styles.passkeyBtn}
                onClick={onOpenPasskeyWallet}
              >
                Passkey wallet
              </button>
            ) : null}

            <div className={styles.balanceBox}>
              <span className={styles.curr}>{monadUsdc.symbol}</span>
              <span>
                {wallet.connecting
                  ? '...'
                  : wallet.connected
                    ? wallet.usdcBalanceLabel ||
                      (wallet.action === 'switch-chain' ? 'Switch chain' : '0.00 USDC')
                    : '--'}
              </span>
            </div>
          </div>
        </nav>

        <div className={styles.mainLayout}>
          <div className={styles.center}>
            <div className={styles.chartArea}>
              <canvas ref={canvasRef} className={styles.priceCanvas} />

              <div className={styles.pnlOverlay}>
                <div
                  ref={pnlAmountRef}
                  className={styles.pnlAmount}
                  data-tone="idle"
                >
                  $0.000000
                </div>
                <div
                  ref={pnlDetailRef}
                  className={styles.pnlDetail}
                  data-tone="idle"
                >
                  {PAIR}
                </div>
                <div ref={pnlTimerRef} className={styles.pnlTimer} />
                <div ref={pnlHintRef} className={styles.pnlHint}>
                  Place a bet to start
                </div>
              </div>

              <div
                className={cn(
                  styles.roundResult,
                  roundResult && styles.roundResultShow,
                )}
              >
                <div
                  className={cn(
                    styles.roundResultText,
                    roundResult?.tone === 'win' && styles.roundResultTextWin,
                    roundResult?.tone === 'lose' && styles.roundResultTextLose,
                  )}
                >
                  {roundResult?.text}
                </div>
                <div
                  className={styles.roundResultSub}
                  style={{
                    color:
                      roundResult?.tone === 'win'
                        ? 'var(--green)'
                        : roundResult?.tone === 'lose'
                          ? 'var(--red)'
                          : undefined,
                  }}
                >
                  {roundResult?.sub}
                </div>
              </div>
            </div>

            <div className={styles.priceTableWrap}>
              <div className={styles.ptHdr}>
                Pyth Oracle Feed <span>({deferredCache.length}/{MAX})</span>
              </div>

              {reversedCache.length > 0 ? (
                <table className={styles.tbl}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Price</th>
                      <th>&Delta;</th>
                      <th>Conf</th>
                      <th>EMA</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reversedCache.map((entry, index) => {
                      const originalIndex = deferredCache.length - index - 1
                      const previous = deferredCache[originalIndex - 1]
                      const delta = previous
                        ? (((entry.price - previous.price) / previous.price) * 100).toFixed(6)
                        : null
                      const deltaClass =
                        delta === null
                          ? styles.cFlat
                          : Number(delta) > 0
                            ? styles.cUp
                            : Number(delta) < 0
                              ? styles.cDn
                              : styles.cFlat

                      return (
                        <tr key={`${entry.id}-${entry.time}-${index}`}>
                          <td className={styles.cIdx}>{originalIndex + 1}</td>
                          <td className={styles.cPrice}>{fmt(entry.price)}</td>
                          <td className={deltaClass}>
                            {delta === null
                              ? '—'
                              : `${Number(delta) > 0 ? '+' : ''}${delta}%`}
                          </td>
                          <td className={styles.cDim}>±{fmt(entry.conf)}</td>
                          <td>{fmt(entry.ema)}</td>
                          <td className={styles.cDim}>{fmtTime(entry.time)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div className={styles.empty}>
                  Connecting to the live MON/USD feed...
                </div>
              )}
            </div>
          </div>

          <aside
            className={cn(
              styles.betSidebar,
              tradeDrawerOpen && styles.betSidebarOpen,
            )}
          >
            <button
              type="button"
              className={styles.tradeToggle}
              onClick={() => setTradeDrawerOpen((open) => !open)}
            >
              <span className={styles.tradeToggleCopy}>
                <span className={styles.tradeToggleLabel}>Trade</span>
                <span className={styles.tradeToggleMeta}>{tradeMeta}</span>
              </span>
              <span
                className={cn(
                  styles.tradeToggleIcon,
                  tradeDrawerOpen && styles.tradeToggleIconOpen,
                )}
              >
                ▲
              </span>
            </button>

            <div className={styles.tradePanelBody}>
              <div className={styles.betSidebarHdr}>Trade</div>

              <div className={styles.betCard}>
                <div className={styles.tradeCopyTitle}>Set your position</div>
                <div className={styles.tradeCopySub}>One amount. Pick a side.</div>
                <div
                  className={cn(
                    styles.tradeCallout,
                    tradeNotice.tone === 'pending' && styles.tradeCalloutPending,
                    tradeNotice.tone === 'error' && styles.tradeCalloutError,
                    tradeNotice.tone === 'success' && styles.tradeCalloutSuccess,
                  )}
                >
                  {tradeNotice.message}
                </div>

                <div className={styles.bpRow}>
                  <span className={styles.bpLabel}>$</span>
                  <div className={styles.bpInputWrap}>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={MIN_BET}
                      max={MAX_BET}
                      value={betAmount}
                      onChange={(event) =>
                        setBetAmount(event.currentTarget.value)
                      }
                      className={styles.bpInput}
                    />
                    <button
                      type="button"
                      className={styles.bpAdj}
                      onClick={() =>
                        setBetAmount((value) =>
                          clampBet((Number.parseFloat(value) || 0.5) - 0.1).toFixed(2),
                        )
                      }
                    >
                      -
                    </button>
                    <button
                      type="button"
                      className={styles.bpAdj}
                      onClick={() =>
                        setBetAmount((value) =>
                          clampBet((Number.parseFloat(value) || 0.5) + 0.1).toFixed(2),
                        )
                      }
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className={styles.bpQuick}>
                  {[0.1, 0.25, 0.5, 1].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={styles.bpQuickButton}
                      onClick={() => setBetAmount(clampBet(value).toFixed(2))}
                    >
                      {value < 1 ? `${Math.round(value * 100)}c` : '$1'}
                    </button>
                  ))}
                </div>

                <div className={styles.bpActions}>
                  <button
                    type="button"
                    className={cn(styles.bpBetBtn, styles.btnUp)}
                    onClick={() => {
                      void handlePlaceBet('up')
                    }}
                    disabled={buttonsDisabled}
                  >
                    <span className={styles.arrow}>▲</span>
                    {longLabel}
                  </button>
                  <button
                    type="button"
                    className={cn(styles.bpBetBtn, styles.btnDown)}
                    onClick={() => {
                      void handlePlaceBet('down')
                    }}
                    disabled={buttonsDisabled}
                  >
                    <span className={styles.arrow}>▼</span>
                    {shortLabel}
                  </button>
                </div>
              </div>

              <div
                className={cn(
                  styles.betActiveStatus,
                  activeBet && styles.betActiveStatusShow,
                )}
              >
                <div
                  className={cn(
                    styles.basDir,
                    activeBet?.direction === 'up' && styles.basDirUp,
                    activeBet?.direction === 'down' && styles.basDirDown,
                  )}
                >
                  {activeBet?.direction === 'up'
                    ? '▲ LONG'
                    : activeBet?.direction === 'down'
                      ? '▼ SHORT'
                      : ''}
                </div>
                <div className={styles.basAmt}>
                  {activeBet
                    ? `$${activeBet.amount.toFixed(2)} @ ${fmtHi(activeBet.entryPrice)}`
                    : ''}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
