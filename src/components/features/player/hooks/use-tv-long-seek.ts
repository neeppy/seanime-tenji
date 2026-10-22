import * as React from "react"
import { nextScale, seekStep, TV_LONG_SEEK } from "../tv-long-seek"

type Direction = -1 | 1

type Options = {
    enabled: boolean
    seek: (seconds: number) => void
    touch: () => void
}

export function useTVLongSeek({ enabled, seek, touch }: Options) {
    const timer = React.useRef<ReturnType<typeof setInterval> | null>(null)
    const hide = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const scale = React.useRef(1)
    const active = React.useRef(false)
    const latest = React.useRef({ seek, touch })
    const [visible, setVisible] = React.useState(false)
    latest.current = { seek, touch }

    const clear = React.useCallback((hideHud: boolean) => {
        if (timer.current !== null) {
            clearInterval(timer.current)
            timer.current = null
        }
        if (hide.current !== null) {
            clearTimeout(hide.current)
            hide.current = null
        }
        active.current = false
        scale.current = 1
        if (hideHud) setVisible(false)
    }, [])

    const stop = React.useCallback(() => {
        if (!active.current) return

        if (timer.current !== null) {
            clearInterval(timer.current)
            timer.current = null
        }
        active.current = false
        scale.current = 1

        if (hide.current !== null) clearTimeout(hide.current)
        hide.current = setTimeout(() => {
            hide.current = null
            setVisible(false)
        }, TV_LONG_SEEK.hudMs)
    }, [])

    const start = React.useCallback((direction: Direction) => {
        if (!enabled || active.current) return

        clear(false)
        active.current = true
        scale.current = 1
        setVisible(true)
        latest.current.seek(direction * TV_LONG_SEEK.seconds)
        latest.current.touch()

        timer.current = setInterval(() => {
            latest.current.seek(direction * seekStep(scale.current))
            scale.current = nextScale(scale.current)
            latest.current.touch()
        }, TV_LONG_SEEK.intervalMs)
    }, [clear, enabled])

    // Shows the seek bar briefly after a single press seek
    const flash = React.useCallback(() => {
        if (!enabled || active.current) return

        if (hide.current !== null) clearTimeout(hide.current)
        setVisible(true)
        hide.current = setTimeout(() => {
            hide.current = null
            setVisible(false)
        }, TV_LONG_SEEK.hudMs)
    }, [enabled])

    React.useEffect(() => {
        if (!enabled) clear(true)
    }, [clear, enabled])

    React.useEffect(() => () => clear(false), [clear])

    return { start, stop, flash, visible }
}
