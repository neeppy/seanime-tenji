import type { AL_AnimeCollection_MediaListCollection_Lists_Entries, AL_BaseAnime } from "@/api/generated/types"
import { useGetRawAnimeCollection } from "@/api/hooks/anilist.hooks"
import { getEpisodePercentageComplete, useGetContinuityWatchHistory } from "@/api/hooks/continuity.hooks"
import { animeEntryPlaybackIntentAtom, createAnimeEntryPlaybackIntent } from "@/atoms/anime-entry.atoms"
import { useServerStatus } from "@/atoms/server.atoms"
import {
    getPreviousSeasonLabel,
    useDiscoverMissedSequels,
    useDiscoverPastSeasonAnime,
    useDiscoverUpcomingAnime,
} from "@/components/features/discover/discover-queries"
import {
    TV,
    TVButton,
    TVContinueCard,
    TVHeroCarousel,
    type TVHeroItem,
    TVInput,
    TVMediaGrid,
    TVPageSkeleton,
    TVSectionHeader,
    TVShelf,
    tvSize,
} from "@/components/tv"
import { requestTVFocus } from "@/components/tv/tv-native"
import { ContinueWatchingItem, useAnimeLibraryCollection } from "@/hooks/use-anime-library-collection"
import { useTVGenreShelf, useTVRecommendations } from "@/hooks/use-tv-recommendations"
import { getContinueWatchingSpoilerActive, getEpisodeSpoilerState, getSpoilerSafeAnimeImage } from "@/lib/anime-spoilers"
import { Ionicons } from "@/lib/icons/Ionicons"
import { cleanHtml, mediaTitle } from "@/lib/media-metadata"
import { useIsServerConnected } from "@/lib/offline"
import { LAUNCH_SEED, seededRandom, weightedShuffle } from "@/lib/recommendations"
import { filterEntriesByTitle } from "@/lib/utils/filtering"
import { router, useFocusEffect, useIsFocused } from "expo-router"
import { useSetAtom } from "jotai"
import * as React from "react"
import { BackHandler, FlatList, Pressable, ScrollView, Text, TVFocusGuideView, View } from "react-native"
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from "react-native-reanimated"

// The fork's TV home. Replaces the upstream library screen (tv-library-screen.tsx) on the
// Anime tab; that file is left untouched so upstream merges stay clean.

type ListEntry = AL_AnimeCollection_MediaListCollection_Lists_Entries

type Shelf = {
    key: string
    title: string
    media: AL_BaseAnime[]
    /** Shown under the title when one of this shelf's shows is in the carousel; none = not in the carousel */
    heroLabel?: string
    /** Which shows go into the carousel (defaults to the first ones) */
    heroMedia?: AL_BaseAnime[]
    hideLibraryBadge?: boolean
}

const HERO_PER_SHELF = 2
// Fixed for now; picking genres from your lists (or a setting) can come later
const GENRE_SHELVES = ["Romance", "Action"] as const
const BACK_TO_TOP_OFFSET = 200

// Focus moves to Continue watching once per launch, not on every return to this tab
let focusedOnLaunch = false

function bannerOf(media: AL_BaseAnime) {
    return media.bannerImage ?? media.coverImage?.extraLarge ?? media.coverImage?.large
}

export function TVHomeScreen() {
    const serverStatus = useServerStatus()
    const isConnected = useIsServerConnected()
    const isFocused = useIsFocused()
    const setPlaybackIntent = useSetAtom(animeEntryPlaybackIntentAtom)
    const { data: watchHistory } = useGetContinuityWatchHistory()
    const hideScore = serverStatus?.settings?.anilist?.hideAudienceScore ?? false
    const [search, setSearch] = React.useState("")
    const deferredSearch = React.useDeferredValue(search)
    const scrollRef = React.useRef<React.ElementRef<typeof Animated.ScrollView>>(null)
    const scrollY = useSharedValue(0)
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y
        },
    })
    const searchSlideDistance = tvSize(20)
    const searchAnimatedStyle = useAnimatedStyle(() => {
        const opacity = interpolate(scrollY.value, [0, 80], [1, 0], Extrapolation.CLAMP)
        const translateY = interpolate(scrollY.value, [0, 80], [0, -searchSlideDistance], Extrapolation.CLAMP)
        return { opacity, transform: [{ translateY }] }
    })

    const {
        libraryCollectionList,
        continueWatchingList,
        isLoading,
        refetch,
    } = useAnimeLibraryCollection()
    const rawCollection = useGetRawAnimeCollection()
    const missed = useDiscoverMissedSequels()
    const past = useDiscoverPastSeasonAnime()
    const upcoming = useDiscoverUpcomingAnime()

    useFocusEffect(React.useCallback(() => {
        if (isConnected) refetch()
    }, [isConnected, refetch]))

    // Every AniList entry once (custom lists repeat entries from the status lists)
    const listEntries = React.useMemo<ListEntry[]>(() => {
        const seen = new Set<number>()
        const entries: ListEntry[] = []
        for (const list of rawCollection.data?.MediaListCollection?.lists ?? []) {
            for (const entry of list.entries ?? []) {
                if (!entry.media || seen.has(entry.media.id)) continue
                seen.add(entry.media.id)
                entries.push(entry)
            }
        }
        return entries
    }, [rawCollection.data])
    const listedIds = React.useMemo(() => new Set(listEntries.map(entry => entry.media!.id)), [listEntries])
    const recommendations = useTVRecommendations(listEntries, listedIds)
    // Once the lists have loaded (or failed), so the genre shelves know what to hide
    const listsReady = !rawCollection.isLoading
    const romance = useTVGenreShelf(GENRE_SHELVES[0], listedIds, listsReady)
    const action = useTVGenreShelf(GENRE_SHELVES[1], listedIds, listsReady)

    const allLibraryEntries = React.useMemo(() => libraryCollectionList.flatMap(list => list?.entries ?? []), [libraryCollectionList])
    const searchMedia = React.useMemo(() => {
        if (!deferredSearch.trim()) return []
        return filterEntriesByTitle(allLibraryEntries, deferredSearch).map(item => item.media).filter((media): media is AL_BaseAnime => !!media)
    }, [allLibraryEntries, deferredSearch])
    const searching = search.trim().length > 0

    const shelves = React.useMemo<Shelf[]>(() => {
        // A show appears in one discovery shelf only, and shows already on your lists are hidden
        const shown = new Set<number>()
        const take = (media: (AL_BaseAnime | null | undefined)[], hideListed: boolean) => {
            const result: AL_BaseAnime[] = []
            for (const item of media) {
                if (!item || item.isAdult || shown.has(item.id) || (hideListed && listedIds.has(item.id))) continue
                shown.add(item.id)
                result.push(item)
            }
            return result
        }

        const items: Shelf[] = [
            {
                key: "sequels",
                title: "Sequels to your shows",
                heroLabel: "Sequel to a show you've watched",
                media: take(missed.data ?? [], false),
            },
            ...recommendations.shelves.map(shelf => ({
                key: `because-${shelf.seed.id}`,
                title: `Because you watched ${mediaTitle(shelf.seed)}`,
                heroLabel: `Because you watched ${mediaTitle(shelf.seed)}`,
                media: take(shelf.media, true),
            })),
            ...[romance, action].map((shelf, index) => {
                const genre = GENRE_SHELVES[index].toLowerCase()
                return {
                    key: `genre-${genre}`,
                    title: `${shelf.sortLabel} ${genre} you haven't seen`,
                    heroLabel: `Because you like ${genre}`,
                    media: take(shelf.media, true),
                }
            }),
            {
                key: "best-of-last-season",
                title: `Best of ${getPreviousSeasonLabel()}`,
                heroLabel: `Best of ${getPreviousSeasonLabel()}`,
                media: take((past.data?.Page?.media ?? []).filter(media => media?.status === "FINISHED"), true),
            },
        ]

        const planning = listEntries
            .filter(entry => entry.status === "PLANNING" && !entry.media!.isAdult)
            .map(entry => entry.media!)
        items.push({
            key: "planning",
            title: "Plan to watch",
            heroLabel: "On your Plan to watch list",
            // A different pair from the list on each launch
            heroMedia: weightedShuffle(planning.filter(media => !!media.bannerImage), () => 1, seededRandom(LAUNCH_SEED)),
            media: planning,
            hideLibraryBadge: true,
        })

        items.push({
            key: "upcoming",
            title: "Coming soon",
            media: (upcoming.data?.Page?.media ?? []).filter((media): media is AL_BaseAnime => !!media && !media.isAdult),
        })

        return items.filter(shelf => shelf.media.length > 0)
    }, [
        action,
        listEntries,
        listedIds,
        missed.data,
        past.data?.Page?.media,
        recommendations.shelves,
        romance,
        upcoming.data?.Page?.media,
    ])

    const openMedia = React.useCallback((id: number) => {
        router.push(`/(app)/entry/anime/${id}`)
    }, [])

    const openContinue = React.useCallback((item: ContinueWatchingItem) => {
        const episode = item.episode
        const mediaId = episode.baseAnime?.id
        if (!mediaId) return

        if (item.sourceView === "library" && episode.localFile?.path) {
            setPlaybackIntent(createAnimeEntryPlaybackIntent({
                kind: "play-local-episode",
                mediaId,
                episodeNumber: episode.episodeNumber,
            }))
        }

        router.push({
            pathname: "/(app)/entry/anime/[id]",
            params: {
                id: String(mediaId),
                initialView: item.sourceView,
            },
        })
    }, [setPlaybackIntent])

    const continueHeroItems = React.useMemo<TVHeroItem[]>(() => {
        const spoilerActive = getContinueWatchingSpoilerActive(serverStatus)

        return continueWatchingList
            .filter(item => !!item.episode.baseAnime)
            .slice(0, HERO_PER_SHELF)
            .map(item => {
                const episode = item.episode
                const media = episode.baseAnime!
                const spoiler = getEpisodeSpoilerState(serverStatus, {
                    episodeNumber: episode.progressNumber || episode.episodeNumber,
                    spoilerActive,
                })
                return {
                    key: `continue-${media.id}-${episode.progressNumber}`,
                    image: spoiler.hideThumbnail
                        ? getSpoilerSafeAnimeImage(media)
                        : media.bannerImage
                        ?? episode.episodeMetadata?.image
                        ?? media.coverImage?.extraLarge
                        ?? media.coverImage?.large,
                    kicker: "Continue watching",
                    title: mediaTitle(media),
                    subtitle: `${episode.displayTitle}${!spoiler.hideTitle && episode.episodeTitle ? `  ·  ${episode.episodeTitle}` : ""}`,
                    meta: [
                        media.seasonYear,
                        media.format?.replaceAll("_", " "),
                        media.genres?.slice(0, 3).join("  ·  "),
                    ].filter(Boolean).join("  ·  "),
                    description: cleanHtml(media.description),
                    score: hideScore ? undefined : media.meanScore,
                    progressPercent: getEpisodePercentageComplete(
                        watchHistory,
                        media.id,
                        episode.progressNumber,
                    ),
                    actionLabel: `Play ${episode.displayTitle}`,
                    onAction: () => openContinue(item),
                    secondaryLabel: "View details",
                    onSecondary: () => openMedia(media.id),
                }
            })
    }, [continueWatchingList, hideScore, openContinue, openMedia, serverStatus, watchHistory])

    // Build the carousel once the shelves have loaded, so it doesn't restart as each one arrives
    const shelvesLoading = isLoading
        || rawCollection.isLoading
        || recommendations.isLoading
        || romance.isLoading
        || action.isLoading
        || missed.isLoading
        || past.isLoading

    const heroItems = React.useMemo<TVHeroItem[]>(() => {
        if (shelvesLoading) return continueHeroItems

        const groups: TVHeroItem[][] = [continueHeroItems]
        for (const shelf of shelves) {
            if (!shelf.heroLabel) continue
            const label = shelf.heroLabel
            groups.push((shelf.heroMedia ?? shelf.media)
                .filter(media => !!media.bannerImage)
                .slice(0, HERO_PER_SHELF)
                .map(media => ({
                    key: `${shelf.key}-${media.id}`,
                    image: bannerOf(media),
                    title: mediaTitle(media),
                    subtitle: label,
                    meta: [
                        media.seasonYear,
                        media.format?.replaceAll("_", " "),
                        media.genres?.slice(0, 3).join("  ·  ") || (media.episodes ? `${media.episodes} episodes` : undefined),
                    ].filter(Boolean).join("  ·  "),
                    description: cleanHtml(media.description),
                    score: hideScore ? undefined : media.meanScore,
                    actionLabel: "Open anime",
                    onAction: () => openMedia(media.id),
                })))
        }

        // One from each shelf in turn, then the second from each
        const items: TVHeroItem[] = []
        for (let round = 0; round < HERO_PER_SHELF; round++) {
            for (const group of groups) {
                if (group[round]) items.push(group[round])
            }
        }
        return items
    }, [continueHeroItems, hideScore, openMedia, shelves, shelvesLoading])

    // Start on Continue watching: one press to resume, while the carousel cycles above
    const [firstContinueCard, setFirstContinueCard] = React.useState<React.ElementRef<typeof Pressable> | null>(null)
    React.useEffect(() => {
        if (focusedOnLaunch || !firstContinueCard) return
        focusedOnLaunch = true
        requestAnimationFrame(() => {
            requestAnimationFrame(() => requestTVFocus(firstContinueCard))
        })
    }, [firstContinueCard])

    // Back jumps to the top first; a second Back leaves as before
    React.useEffect(() => {
        if (!isFocused || searching) return
        const sub = BackHandler.addEventListener("hardwareBackPress", () => {
            if (scrollY.value < BACK_TO_TOP_OFFSET || !firstContinueCard) return false
            scrollRef.current?.scrollTo({ y: 0, animated: true })
            requestTVFocus(firstContinueCard)
            return true
        })
        return () => sub.remove()
    }, [firstContinueCard, isFocused, scrollRef, scrollY, searching])

    // Shelves mount one per frame, so the page shows straight away instead of building every card first
    const [shelfCount, setShelfCount] = React.useState(0)
    React.useEffect(() => {
        if (shelfCount >= shelves.length) return
        const frame = requestAnimationFrame(() => setShelfCount(count => count + 1))
        return () => cancelAnimationFrame(frame)
    }, [shelfCount, shelves.length])

    const renderContinue = React.useCallback(({ item, index }: { item: ContinueWatchingItem; index: number }) => (
        <TVContinueCard
            ref={index === 0 ? setFirstContinueCard : undefined}
            item={item}
            preferred={index === 0}
            progressPercent={item.episode.baseAnime?.id
                ? getEpisodePercentageComplete(watchHistory, item.episode.baseAnime.id, item.episode.progressNumber)
                : 0}
            onPress={() => openContinue(item)}
        />
    ), [openContinue, watchHistory])

    if (isLoading && isConnected) {
        return <TVPageSkeleton hero />
    }

    if (!shelves.length && !continueWatchingList.length && !searching && !shelvesLoading) {
        return (
            <ScrollView style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
                <View
                    style={{
                        flex: 1,
                        minHeight: tvSize(360),
                        alignItems: "center",
                        justifyContent: "center",
                        gap: tvSize(8),
                        paddingHorizontal: TV.gutter,
                        paddingTop: tvSize(100),
                    }}
                >
                    <Text className="font-bold text-white" style={{ fontSize: tvSize(30) }}>
                        {isConnected ? "Nothing to show yet" : "Server is offline"}
                    </Text>
                    <Text className="text-white/45" style={{ fontSize: tvSize(20) }}>
                        {isConnected ? "Browse by season to find something to watch." : "Reconnect to load your library."}
                    </Text>
                    <View style={{ marginTop: tvSize(20) }}>
                        <TVButton
                            label={isConnected ? "Open Seasons" : "Open Settings"}
                            variant="primary"
                            hasTVPreferredFocus
                            onPress={() => router.navigate((isConnected ? "/(app)/(tabs)/seasons" : "/(app)/(tabs)/(profile)") as never)}
                        />
                    </View>
                </View>
            </ScrollView>
        )
    }

    return (
        <View style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
            {isConnected ? (
                <Animated.View
                    pointerEvents="box-none"
                    style={[{
                        position: "absolute",
                        top: TV.navTop,
                        left: TV.gutter,
                        width: tvSize(480),
                        zIndex: 210,
                    }, searchAnimatedStyle]}
                >
                    <TVInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search your anime library"
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="search"
                        preferred={heroItems.length === 0}
                        floating
                        containerStyle={{ borderRadius: tvSize(99) }}
                        icon={(
                            <Ionicons
                                name="search"
                                size={tvSize(22)}
                                color="rgba(255,255,255,0.58)"
                            />
                        )}
                    />
                </Animated.View>
            ) : null}

            {searching ? (
                <TVMediaGrid
                    media={searchMedia}
                    query={search}
                    topInset={TV.navInset}
                    emptyText="Try another title from your AniList library."
                />
            ) : (
                <Animated.ScrollView
                    ref={scrollRef}
                    style={{ flex: 1 }}
                    fadingEdgeLength={{ start: TV.navInset + tvSize(18), end: 0 }}
                    contentContainerStyle={{
                        paddingBottom: tvSize(90),
                        gap: TV.sectionGap,
                    }}
                    showsVerticalScrollIndicator={false}
                    onScroll={scrollHandler}
                    scrollEventThrottle={16}
                >
                    <View style={{ gap: tvSize(34), paddingBottom: tvSize(8) }}>
                        <View
                            style={{
                                minHeight: heroItems.length > 0 || shelvesLoading ? tvSize(560) : tvSize(32),
                            }}
                        >
                            <TVHeroCarousel items={heroItems} active={isFocused} preferred loading={shelvesLoading} />
                        </View>

                        {continueWatchingList.length > 0 ? (
                            <View style={{ gap: tvSize(12) }}>
                                <TVSectionHeader
                                    title="Continue watching"
                                    count={continueWatchingList.length}
                                />
                                <TVFocusGuideView trapFocusLeft trapFocusRight>
                                    <FlatList
                                        horizontal
                                        data={continueWatchingList}
                                        renderItem={renderContinue}
                                        keyExtractor={(item,
                                            index,
                                        ) => item.episode.localFile?.path || `${item.episode.baseAnime?.id ?? "episode"}-${item.episode.type}-${item.episode.episodeNumber}-${index}`}
                                        snapToAlignment="item"
                                        snapToItemPadding={TV.gutter}
                                        style={{ flexGrow: 0, overflow: "visible" }}
                                        contentContainerStyle={{
                                            paddingHorizontal: TV.gutter,
                                            paddingTop: tvSize(10),
                                            paddingBottom: tvSize(14),
                                            gap: TV.cardGap,
                                        }}
                                        showsHorizontalScrollIndicator={false}
                                        removeClippedSubviews={false}
                                        initialNumToRender={6}
                                        maxToRenderPerBatch={6}
                                        windowSize={5}
                                    />
                                </TVFocusGuideView>
                            </View>
                        ) : null}
                    </View>

                    {shelves.slice(0, shelfCount).map((shelf, index) => (
                        <TVShelf
                            key={shelf.key}
                            title={shelf.title}
                            media={shelf.media}
                            showAudienceScore
                            hideLibraryBadge={shelf.hideLibraryBadge}
                            first={heroItems.length === 0 && continueWatchingList.length === 0 && index === 0}
                        />
                    ))}
                </Animated.ScrollView>
            )}
        </View>
    )
}
