// Fork: hold OK on a show card for quick list controls without opening the show.
// Plan to watch is focused, so adding to the plan is hold + OK. Completed asks for a score
// (one press) and fills in every episode. "More…" opens the full list form.
import type { AL_BaseAnime, AL_MediaListStatus, Anime_Entry, Anime_EntryListData } from "@/api/generated/types"
import { useEditAnilistListEntry } from "@/api/hooks/anilist.hooks"
import { useMediaEntryListDataValue } from "@/atoms/anilist-collection.atoms"
import { fuzzyDate, parseListDate } from "@/components/features/media/edit-list-entry-utils"
import { TVDrawer } from "@/components/tv/tv-drawer"
import { TVEditAnilistEntryDrawer } from "@/components/tv/tv-edit-anilist-entry-drawer"
import { TVButton } from "@/components/tv/tv-focus"
import { requestTVFocus } from "@/components/tv/tv-native"
import { tvSize } from "@/components/tv/tv-scale"
import { TVScoreRow } from "@/components/tv/tv-score-row"
import { mediaTitle } from "@/lib/media-metadata"
import { Ionicons } from "@expo/vector-icons"
import { atom, useAtom, useSetAtom } from "jotai"
import * as React from "react"
import { Pressable, Text, TVFocusGuideView, View } from "react-native"

const quickListMediaAtom = atom<AL_BaseAnime | null>(null)

/** Opens the quick list drawer for a show (used by the TV media card's long press) */
export function useOpenTVQuickList() {
    return useSetAtom(quickListMediaAtom)
}

type PressableRef = React.ElementRef<typeof Pressable>

const STATUS_ACTIONS: { status: AL_MediaListStatus, label: string, icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
    { status: "PLANNING", label: "Plan to watch", icon: "bookmark-outline" },
    { status: "COMPLETED", label: "Completed", icon: "checkmark-done" },
    { status: "CURRENT", label: "Watching", icon: "play-outline" },
    { status: "PAUSED", label: "Paused", icon: "pause-outline" },
    { status: "DROPPED", label: "Dropped", icon: "close-circle-outline" },
]

/** Episodes that are out: all of them, or up to the last aired one for a show still airing */
function airedEpisodes(media: AL_BaseAnime) {
    return media.nextAiringEpisode?.episode ? media.nextAiringEpisode.episode - 1 : media.episodes
}

/** Mounted once for the TV app; shows itself when a card asks for it */
export function TVQuickListDrawer() {
    const [media, setMedia] = useAtom(quickListMediaAtom)
    const [fullForm, setFullForm] = React.useState<AL_BaseAnime | null>(null)

    return (
        <>
            {media ? (
                <QuickListDrawer
                    key={media.id}
                    media={media}
                    onClose={() => setMedia(null)}
                    onMore={() => {
                        setMedia(null)
                        setFullForm(media)
                    }}
                />
            ) : null}
            {fullForm ? <FullListForm media={fullForm} onClose={() => setFullForm(null)} /> : null}
        </>
    )
}

function QuickListDrawer({ media, onClose, onMore }: { media: AL_BaseAnime, onClose: () => void, onMore: () => void }) {
    const listData = useMediaEntryListDataValue("anime", media.id) as Anime_EntryListData | undefined
    const { mutate: save, isPending: saving } = useEditAnilistListEntry(media.id, "anime")
    const [step, setStep] = React.useState<"status" | "score">("status")
    const firstRef = React.useRef<PressableRef>(null)
    const scoreRef = React.useRef<PressableRef>(null)
    const notReleased = media.status === "NOT_YET_RELEASED"
    const current = listData?.status
    const actions = notReleased ? STATUS_ACTIONS.filter(action => action.status === "PLANNING") : STATUS_ACTIONS
    // Plan to watch first, unless that's already the status; then Completed
    const focusIndex = current === "PLANNING" && actions.length > 1 ? 1 : 0

    // Keeps what's already on the entry; only the changed fields differ
    const submit = React.useCallback((status: AL_MediaListStatus, changes: { score?: number, progress?: number } = {}) => {
        save({
            mediaId: media.id,
            type: "anime",
            status,
            score: changes.score ?? listData?.score ?? 0,
            progress: changes.progress ?? listData?.progress ?? 0,
            startedAt: fuzzyDate(parseListDate(listData?.startedAt)),
            completedAt: fuzzyDate(parseListDate(listData?.completedAt)),
        }, { onSuccess: onClose })
    }, [listData, media.id, onClose, save])

    const focusStep = React.useCallback(() => {
        requestAnimationFrame(() => requestTVFocus(step === "score" ? scoreRef.current : firstRef.current))
    }, [step])

    // On open (again once the slide-in finishes, via onShow) and when moving between steps
    React.useEffect(() => {
        focusStep()
    }, [focusStep])

    const episodes = airedEpisodes(media)
    // Every episode that's out; left as it is when AniList doesn't know the count
    const complete = (score?: number) => submit("COMPLETED", { progress: episodes || undefined, score })

    return (
        <TVDrawer
            open
            onOpenChange={open => !open && onClose()}
            onRequestClose={() => step === "score" ? setStep("status") : onClose()}
            onShow={focusStep}
            title={mediaTitle(media)}
            subtitle={step === "score" ? "Score it" : current ? `On your list · ${statusLabel(current)}` : "Add to your list"}
            width={tvSize(560)}
            closeDisabled={saving}
            focusKey={step}
        >
            <View style={{ paddingHorizontal: tvSize(30), paddingTop: tvSize(6), gap: tvSize(12) }}>
                {step === "status" ? (
                    <TVFocusGuideView trapFocusLeft trapFocusRight style={{ gap: tvSize(12) }}>
                        {actions.map((action, index) => (
                            <TVButton
                                key={action.status}
                                ref={index === focusIndex ? firstRef : undefined}
                                label={action.label}
                                detail={current === action.status ? "Current" : undefined}
                                variant={index === 0 && current !== "PLANNING" ? "primary" : "secondary"}
                                disabled={saving}
                                icon={<Ionicons name={action.icon} size={tvSize(22)} color="white" />}
                                onPress={() => {
                                    if (action.status === "COMPLETED") {
                                        setStep("score")
                                        return
                                    }
                                    submit(action.status)
                                }}
                            />
                        ))}
                        <View style={{ height: tvSize(1), backgroundColor: "rgba(255,255,255,0.08)", marginVertical: tvSize(4) }} />
                        <TVButton
                            label="More…"
                            detail="Episodes, dates, remove"
                            variant="ghost"
                            disabled={saving}
                            icon={<Ionicons name="options-outline" size={tvSize(22)} color="white" />}
                            onPress={onMore}
                        />
                    </TVFocusGuideView>
                ) : (
                    <View style={{ gap: tvSize(20) }}>
                        <Text className="text-white/55" style={{ fontSize: tvSize(18) }}>
                            {saving ? "Saving…" : episodes ? `Marks all ${episodes} episodes watched.` : "Marks it completed."}
                        </Text>
                        <TVScoreRow
                            value={listData?.score ? Math.round(listData.score / 10) : 0}
                            focusRef={scoreRef}
                            disabled={saving}
                            onSelect={score => complete(score * 10)}
                        />
                        <TVFocusGuideView trapFocusLeft trapFocusRight style={{ flexDirection: "row" }}>
                            <TVButton
                                label="Skip score"
                                variant="secondary"
                                disabled={saving}
                                onPress={() => complete()}
                            />
                        </TVFocusGuideView>
                    </View>
                )}
            </View>
        </TVDrawer>
    )
}

function statusLabel(status: AL_MediaListStatus) {
    return STATUS_ACTIONS.find(action => action.status === status)?.label ?? (status === "REPEATING" ? "Rewatching" : status)
}

/** The full list form, for a show opened from a card rather than its page */
function FullListForm({ media, onClose }: { media: AL_BaseAnime, onClose: () => void }) {
    const listData = useMediaEntryListDataValue("anime", media.id) as Anime_EntryListData | undefined
    // The form only reads the media, its list entry and the id
    const entry = React.useMemo(() => ({ mediaId: media.id, media, listData } as Anime_Entry), [listData, media])
    return <TVEditAnilistEntryDrawer entry={entry} open onOpenChange={open => !open && onClose()} />
}
