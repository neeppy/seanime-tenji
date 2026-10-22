import { BUFFER_FILL } from "@/components/features/player/constants"
import { formatTime, isSkippableChapter } from "@/components/features/player/helpers"
import { useTVFocus } from "@/components/tv/tv-focus"
import { tvSize } from "@/components/tv/tv-scale"
import type { PlayerChapter, PlayerState } from "@/lib/player"
import type { MobilePlaybackSource } from "@/lib/player/types"
import {
    Captions,
    List,
    Pause,
    Play,
    RotateCcw,
    RotateCw,
    Settings,
    SkipForward,
    X,
} from "lucide-react-native"
import * as React from "react"
import {
    Animated,
    Pressable,
    Text,
    TVFocusGuideView,
    useTVEventHandler,
    View,
} from "react-native"

const FOCUS_BORDER = "#ffffff"

type ControlProps = {
    label: string
    icon: (color: string) => React.ReactNode
    onPress: () => void
    preferred?: boolean
    primary?: boolean
    wide?: boolean
    disabled?: boolean
    focusable?: boolean
    onFocus?: () => void
}

const TVPlayerControl = React.forwardRef<React.ElementRef<typeof Pressable>, ControlProps>(
    ({
        label,
        icon,
        onPress,
        preferred,
        primary,
        wide,
        disabled,
        focusable,
        onFocus,
    }, ref) => {
        const focus = useTVFocus(1.04)
        return (
            <Pressable
                ref={ref}
                onPress={onPress}
                disabled={disabled}
                focusable={focusable}
                hasTVPreferredFocus={preferred && focusable !== false}
                onFocus={() => {
                    focus.focus()
                    onFocus?.()
                }}
                onBlur={focus.blur}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled: Boolean(disabled) }}
                style={{
                    width: tvSize(wide ? 156 : 92),
                    flexShrink: 0,
                    opacity: disabled ? 0.35 : 1,
                }}
            >
                <Animated.View
                    style={[
                        focus.style,
                        {
                            alignSelf: "center",
                            width: tvSize(primary ? 72 : 62),
                            height: tvSize(primary ? 72 : 62),
                            borderRadius: tvSize(primary ? 36 : 31),
                            borderWidth: tvSize(3),
                            borderColor: focus.focused
                                ? FOCUS_BORDER
                                : "transparent",
                            backgroundColor: focus.focused
                                ? "rgba(255,255,255,0.16)"
                                : primary
                                    ? "rgba(255,255,255,0.12)"
                                    : "rgba(255,255,255,0.06)",
                            alignItems: "center",
                            justifyContent: "center",
                        },
                    ]}
                >
                    {icon("#ffffff")}
                </Animated.View>
                <Text
                    className="font-semibold"
                    numberOfLines={1}
                    style={{
                        marginTop: tvSize(8),
                        color: focus.focused ? "#ffffff" : "rgba(255,255,255,0.58)",
                        fontSize: tvSize(16),
                        textAlign: "center",
                    }}
                >
                    {label}
                </Text>
            </Pressable>
        )
    },
)

TVPlayerControl.displayName = "TVPlayerControl"

function TVPlayerExit({
    onPress,
    onFocus,
    focusable,
}: {
    onPress: () => void
    onFocus: () => void
    focusable?: boolean
}) {
    const focus = useTVFocus(1.04)

    return (
        <Pressable
            onPress={onPress}
            focusable={focusable}
            onFocus={() => {
                focus.focus()
                onFocus()
            }}
            onBlur={focus.blur}
            accessibilityRole="button"
            accessibilityLabel="Leave player"
            style={{
                position: "absolute",
                top: tvSize(52),
                left: tvSize(58),
                zIndex: 2,
            }}
        >
            <Animated.View
                style={[
                    focus.style,
                    {
                        width: tvSize(58),
                        height: tvSize(58),
                        borderRadius: tvSize(29),
                        borderWidth: tvSize(3),
                        borderColor: focus.focused ? FOCUS_BORDER : "transparent",
                        backgroundColor: focus.focused
                            ? "rgba(255,255,255,0.16)"
                            : "rgba(255,255,255,0.06)",
                        alignItems: "center",
                        justifyContent: "center",
                    },
                ]}
            >
                <X size={tvSize(25)} color="#ffffff" />
            </Animated.View>
        </Pressable>
    )
}

type Props = {
    visible: boolean
    source: MobilePlaybackSource | null
    state: PlayerState
    chapters: PlayerChapter[]
    displayTime: number
    progress: number
    buffered: number
    longSeekVisible: boolean
    seekSec: number
    canPlayNext: boolean
    canShowEpisodes: boolean
    skipLabel?: string
    onSkip?: () => void
    onTogglePlayPause: () => void
    onSeekRelative: (seconds: number) => void
    onPlayNext: () => void
    onOpenEpisodes: () => void
    onOpenTracks: () => void
    onOpenSettings: () => void
    onExit: () => void
    onShowControls: () => void
    onControlFocus: () => void
    onControlAction: () => void
    focusWhenHidden?: boolean
}

export function TVPlayerControls({
    visible,
    source,
    state,
    chapters,
    displayTime,
    progress,
    buffered,
    longSeekVisible,
    seekSec,
    canPlayNext,
    canShowEpisodes,
    skipLabel,
    onSkip,
    onTogglePlayPause,
    onSeekRelative,
    onPlayNext,
    onOpenEpisodes,
    onOpenTracks,
    onOpenSettings,
    onExit,
    onShowControls,
    onControlFocus,
    onControlAction,
    focusWhenHidden = true,
}: Props) {
    const playRef = React.useRef<React.ElementRef<typeof Pressable>>(null)
    const episodesRef = React.useRef<React.ElementRef<typeof Pressable>>(null)
    const tracksRef = React.useRef<React.ElementRef<typeof Pressable>>(null)
    const settingsRef = React.useRef<React.ElementRef<typeof Pressable>>(null)
    const returnRef = React.useRef<"episodes" | "tracks" | "settings" | null>(null)
    const [playTarget, setPlayTarget] = React.useState<React.ElementRef<typeof Pressable> | null>(null)
    const hiddenRef = React.useRef<React.ElementRef<typeof Pressable>>(null)
    const bindPlay = React.useCallback((target: React.ElementRef<typeof Pressable> | null) => {
        playRef.current = target
        setPlayTarget(target)
    }, [])

    React.useEffect(() => {
        if (!visible && focusWhenHidden) returnRef.current = null

        let frame = 0
        let tries = 0
        const run = () => {
            const target = visible
                ? returnRef.current === "episodes"
                    ? episodesRef.current
                    : returnRef.current === "tracks"
                        ? tracksRef.current
                        : returnRef.current === "settings"
                            ? settingsRef.current
                            : playRef.current
                : focusWhenHidden
                    ? hiddenRef.current
                    : null

            // This is the reliable focus API on react-native-tvos. Retry while
            // the native focus tree settles after the player panel closes.
            target?.requestTVFocus()
            tries++
            if (target && tries >= 5) returnRef.current = null
            if (tries < 5 && (visible || focusWhenHidden)) {
                frame = requestAnimationFrame(run)
            }
        }

        const timer = setTimeout(() => {
            if (visible) {
                run()
                return
            }
            if (focusWhenHidden) {
                run()
            }
        }, 50)

        return () => {
            clearTimeout(timer)
            if (frame) cancelAnimationFrame(frame)
        }
    }, [focusWhenHidden, visible])

    // The overlay stays mounted while hidden so showing it is a style change rather than a
    // full rebuild. Its props are frozen while hidden so playback progress doesn't re-render it.
    const liveProps: OverlayProps = {
        source,
        state,
        chapters,
        displayTime,
        progress,
        buffered,
        seekSec,
        canPlayNext,
        canShowEpisodes,
        skipLabel,
        onSkip,
        onTogglePlayPause,
        onSeekRelative,
        onPlayNext,
        onOpenEpisodes,
        onOpenTracks,
        onOpenSettings,
        onExit,
        onControlFocus,
        onControlAction,
        playTarget,
        bindPlay,
        episodesRef,
        tracksRef,
        settingsRef,
        returnRef,
    }
    const overlayPropsRef = React.useRef(liveProps)
    if (visible) overlayPropsRef.current = liveProps

    const hiddenLayer = visible ? null : (
        <>
            {focusWhenHidden ? (
                <Pressable
                    ref={hiddenRef}
                    hasTVPreferredFocus
                    onPress={onShowControls}
                    accessibilityLabel="Show player controls"
                    style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: 1,
                        height: 1,
                        opacity: 0,
                    }}
                />
            ) : null}
            {longSeekVisible ? (
                <View
                    pointerEvents="none"
                    style={{
                        position: "absolute",
                        left: tvSize(68),
                        right: tvSize(68),
                        bottom: tvSize(54),
                        zIndex: 40,
                        gap: tvSize(9),
                    }}
                >
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text
                            className="font-bold text-white"
                            style={{ fontSize: tvSize(19), fontVariant: ["tabular-nums"] }}
                        >
                            {formatTime(displayTime)}
                        </Text>
                        <Text
                            className="font-semibold text-white/60"
                            style={{ fontSize: tvSize(18), fontVariant: ["tabular-nums"] }}
                        >
                            {formatTime(state.duration)}
                        </Text>
                    </View>
                    <View
                        style={{
                            height: tvSize(9),
                            borderRadius: tvSize(5),
                            backgroundColor: "rgba(255,255,255,0.16)",
                            overflow: "hidden",
                        }}
                    >
                        <View
                            style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${Math.max(0, Math.min(1, buffered)) * 100}%`,
                                backgroundColor: BUFFER_FILL,
                            }}
                        />
                        <View
                            style={{
                                width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                                height: "100%",
                                borderRadius: tvSize(5),
                                backgroundColor: "#ffffff",
                            }}
                        />
                    </View>
                </View>
            ) : null}
        </>
    )

    return (
        <>
            <ControlsOverlay {...overlayPropsRef.current} visible={visible} />
            {hiddenLayer}
        </>
    )
}

type PressableRef = React.ElementRef<typeof Pressable>

type OverlayProps = Pick<Props,
    | "source"
    | "state"
    | "chapters"
    | "displayTime"
    | "progress"
    | "buffered"
    | "seekSec"
    | "canPlayNext"
    | "canShowEpisodes"
    | "skipLabel"
    | "onSkip"
    | "onTogglePlayPause"
    | "onSeekRelative"
    | "onPlayNext"
    | "onOpenEpisodes"
    | "onOpenTracks"
    | "onOpenSettings"
    | "onExit"
    | "onControlFocus"
    | "onControlAction"
> & {
    playTarget: PressableRef | null
    bindPlay: (target: PressableRef | null) => void
    episodesRef: React.RefObject<PressableRef | null>
    tracksRef: React.RefObject<PressableRef | null>
    settingsRef: React.RefObject<PressableRef | null>
    returnRef: React.RefObject<"episodes" | "tracks" | "settings" | null>
}

const ControlsOverlay = React.memo(function ControlsOverlay({
    visible,
    source,
    state,
    chapters,
    displayTime,
    progress,
    buffered,
    seekSec,
    canPlayNext,
    canShowEpisodes,
    skipLabel,
    onSkip,
    onTogglePlayPause,
    onSeekRelative,
    onPlayNext,
    onOpenEpisodes,
    onOpenTracks,
    onOpenSettings,
    onExit,
    onControlFocus,
    onControlAction,
    playTarget,
    bindPlay,
    episodesRef,
    tracksRef,
    settingsRef,
    returnRef,
}: OverlayProps & { visible: boolean }) {
    const [barFocused, setBarFocused] = React.useState(false)
    const segments = React.useMemo(() => getSegments(chapters, state.duration), [chapters, state.duration])

    React.useEffect(() => {
        if (!visible) setBarFocused(false)
    }, [visible])

    useTVEventHandler((event) => {
        if (!visible || !barFocused || !event) return
        if (event.eventKeyAction === 0) return

        if (event.eventType === "left") {
            onSeekRelative(-seekSec)
            onControlFocus()
            return
        }
        if (event.eventType === "right") {
            onSeekRelative(seekSec)
            onControlFocus()
        }
    })

    const title = source?.media?.title?.userPreferred
        ?? source?.media?.title?.english
        ?? "Now playing"
    const episode = source?.episode
        ? source.episode.displayTitle
        : `Episode ${source?.episodeNumber ?? ""}`.trim()
    const isFiller = (source?.episode ?? source?.episodes?.find(ep => ep.episodeNumber === source?.episodeNumber))
        ?.episodeMetadata?.isFiller
    const chapter = getChapter(chapters, displayTime)

    function run(action: () => void) {
        action()
        onControlAction()
    }

    return (
        <View
            pointerEvents={visible ? "box-none" : "none"}
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 40,
                opacity: visible ? 1 : 0,
            }}
        >
            <View
                pointerEvents="none"
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "rgba(0,0,0,0.45)",
                }}
            />
            <TVPlayerExit onPress={onExit} onFocus={onControlFocus} focusable={visible} />
            <View
                pointerEvents="none"
                style={{
                    position: "absolute",
                    top: tvSize(54),
                    left: tvSize(142),
                    right: tvSize(68),
                    gap: tvSize(6),
                }}
            >
                <Text
                    className="font-black text-white"
                    style={{ fontSize: tvSize(32), maxWidth: "75%" }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                >
                    {title}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: tvSize(10), maxWidth: "75%" }}>
                    <Text
                        className="font-medium text-white/60"
                        style={{ fontSize: tvSize(20), flexShrink: 1 }}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                    >
                        {episode}
                    </Text>
                    {isFiller ? (
                        <View
                            style={{
                                borderRadius: tvSize(7),
                                paddingHorizontal: tvSize(9),
                                paddingVertical: tvSize(4),
                                backgroundColor: "rgba(255,255,255,0.18)",
                            }}
                        >
                            <Text className="font-bold text-white/80" style={{ fontSize: tvSize(14) }}>
                                FILLER
                            </Text>
                        </View>
                    ) : null}
                </View>
            </View>

            <View
                style={{
                    position: "absolute",
                    left: tvSize(68),
                    right: tvSize(68),
                    bottom: tvSize(54),
                    gap: tvSize(18),
                }}
            >
                <View style={{ gap: tvSize(9) }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                        <Text
                            className="font-semibold text-white/75"
                            style={{ fontSize: tvSize(18) }}
                            numberOfLines={1}
                        >
                            {/*{barFocused
                                ? `Left / right to seek ${seekSec}s`
                                : chapter?.title ?? ""}*/}
                            {chapter?.title ?? ""}
                        </Text>
                        <Text
                            className="font-bold text-white"
                            style={{
                                fontSize: tvSize(19),
                                fontVariant: ["tabular-nums"],
                            }}
                        >
                            {formatTime(displayTime)}
                            <Text className="text-white/45"> / {formatTime(state.duration)}</Text>
                        </Text>
                    </View>

                    <TVFocusGuideView trapFocusLeft trapFocusRight>
                        <Pressable
                            onPress={onTogglePlayPause}
                            focusable={visible}
                            onFocus={() => {
                                setBarFocused(true)
                                onControlFocus()
                            }}
                            onBlur={() => setBarFocused(false)}
                            accessibilityRole="adjustable"
                            accessibilityLabel="Playback timeline"
                            accessibilityValue={{
                                min: 0,
                                max: Math.max(0, Math.round(state.duration)),
                                now: Math.max(0, Math.round(displayTime)),
                                text: `${formatTime(displayTime)} of ${formatTime(state.duration)}`,
                            }}
                            style={{
                                height: tvSize(38),
                                justifyContent: "center",
                            }}
                        >
                            <View
                                style={{
                                    height: tvSize(barFocused ? 11 : 7),
                                    flexDirection: "row",
                                    gap: tvSize(3),
                                }}
                            >
                                {segments.map((segment, index) => {
                                    const ratio = segment.endProgress <= segment.startProgress
                                        ? 0
                                        : Math.max(0, Math.min(
                                            1,
                                            (progress - segment.startProgress)
                                            / (segment.endProgress - segment.startProgress),
                                        ))
                                    const bufferedRatio = segment.endProgress <= segment.startProgress
                                        ? 0
                                        : Math.max(0, Math.min(
                                            1,
                                            (buffered - segment.startProgress)
                                            / (segment.endProgress - segment.startProgress),
                                        ))
                                    return (
                                    <View
                                        key={`${segment.id}-${index}`}
                                        style={{
                                            flexGrow: segment.duration,
                                            flexShrink: 1,
                                            flexBasis: 0,
                                            height: "100%",
                                            borderRadius: tvSize(4),
                                            backgroundColor: isSkippableChapter(segment.title)
                                                ? "rgba(147,197,253,0.45)"
                                                : "rgba(255,255,255,0.2)",
                                            overflow: "hidden",
                                        }}
                                    >
                                        <View
                                            style={{
                                                position: "absolute",
                                                left: 0,
                                                top: 0,
                                                bottom: 0,
                                                width: `${bufferedRatio * 100}%`,
                                                borderRadius: tvSize(4),
                                                backgroundColor: BUFFER_FILL,
                                            }}
                                        />
                                        <View
                                            style={{
                                                width: `${ratio * 100}%`,
                                                height: "100%",
                                                borderRadius: tvSize(4),
                                                backgroundColor: "#ffffff",
                                            }}
                                        />
                                    </View>
                                    )
                                })}
                            </View>
                            {barFocused ? (
                                <View
                                    pointerEvents="none"
                                    style={{
                                        position: "absolute",
                                        left: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                                        top: "50%",
                                        width: tvSize(20),
                                        height: tvSize(20),
                                        marginLeft: -tvSize(10),
                                        marginTop: -tvSize(10),
                                        borderRadius: tvSize(10),
                                        borderWidth: tvSize(3),
                                        borderColor: FOCUS_BORDER,
                                        backgroundColor: "#ffffff",
                                    }}
                                />
                            ) : null}
                        </Pressable>
                    </TVFocusGuideView>
                </View>

                <TVFocusGuideView
                    autoFocus={visible}
                    destinations={visible && playTarget ? [playTarget] : []}
                    trapFocusLeft
                    trapFocusRight
                    style={{
                        padding: tvSize(8),
                        margin: -tvSize(8),
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: tvSize(18),
                    }}
                >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: tvSize(12) }}>
                        <TVPlayerControl
                            focusable={visible}
                            label={`${seekSec}s`}
                            icon={(color) => <RotateCcw size={tvSize(23)} color={color} />}
                            onPress={() => run(() => onSeekRelative(-seekSec))}
                            onFocus={onControlFocus}
                        />
                        <TVPlayerControl
                            focusable={visible}
                            ref={bindPlay}
                            label={state.paused ? "Play" : "Pause"}
                            icon={(color) => state.paused
                                ? <Play size={tvSize(27)} color={color} fill={color} />
                                : <Pause size={tvSize(27)} color={color} fill={color} />}
                            primary
                            preferred
                            onPress={() => run(onTogglePlayPause)}
                            onFocus={onControlFocus}
                        />
                        <TVPlayerControl
                            focusable={visible}
                            label={`${seekSec}s`}
                            icon={(color) => <RotateCw size={tvSize(23)} color={color} />}
                            onPress={() => run(() => onSeekRelative(seekSec))}
                            onFocus={onControlFocus}
                        />
                        <TVPlayerControl
                            focusable={visible}
                            label="Next"
                            icon={(color) => <SkipForward size={tvSize(23)} color={color} />}
                            disabled={!canPlayNext}
                            onPress={() => run(onPlayNext)}
                            onFocus={onControlFocus}
                        />
                        {skipLabel && onSkip ? (
                            <TVPlayerControl
                                focusable={visible}
                                label={skipLabel}
                                icon={(color) => <SkipForward size={tvSize(22)} color={color} />}
                                onPress={() => run(onSkip)}
                                onFocus={onControlFocus}
                            />
                        ) : null}
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: tvSize(12) }}>
                        {canShowEpisodes ? (
                            <TVPlayerControl
                                focusable={visible}
                                ref={episodesRef}
                                label="Episodes"
                                icon={(color) => <List size={tvSize(22)} color={color} />}
                                onPress={() => {
                                    returnRef.current = "episodes"
                                    onOpenEpisodes()
                                }}
                                onFocus={onControlFocus}
                            />
                        ) : null}
                        <TVPlayerControl
                            focusable={visible}
                            ref={tracksRef}
                            label="Audio & subtitles"
                            wide
                            icon={(color) => <Captions size={tvSize(22)} color={color} />}
                            onPress={() => {
                                returnRef.current = "tracks"
                                onOpenTracks()
                            }}
                            onFocus={onControlFocus}
                        />
                        <TVPlayerControl
                            focusable={visible}
                            ref={settingsRef}
                            label="Settings"
                            icon={(color) => <Settings size={tvSize(22)} color={color} />}
                            onPress={() => {
                                returnRef.current = "settings"
                                onOpenSettings()
                            }}
                            onFocus={onControlFocus}
                        />
                    </View>
                </TVFocusGuideView>
            </View>
        </View>
    )
})

function getChapter(chapters: PlayerChapter[], time: number) {
    let current: PlayerChapter | undefined
    for (const chapter of chapters) {
        if (chapter.start > time) break
        current = chapter
    }
    return current
}

function getSegments(chapters: PlayerChapter[], duration: number) {
    const total = Math.max(duration, 1)
    if (chapters.length === 0) {
        return [{
            id: 0,
            title: undefined as string | undefined,
            duration: total,
            startProgress: 0,
            endProgress: 1,
        }]
    }

    const sorted = [...chapters].sort((a, b) => a.start - b.start)
    return sorted.map((chapter, index) => {
        const start = index === 0 ? 0 : chapter.start
        const end = Math.max(start, sorted[index + 1]?.start ?? total)
        return {
            id: chapter.id,
            title: chapter.title,
            duration: Math.max(0.1, end - start),
            startProgress: Math.max(0, Math.min(1, start / total)),
            endProgress: Math.max(0, Math.min(1, end / total)),
        }
    })
}
