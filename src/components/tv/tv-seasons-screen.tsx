import type { AL_BaseAnime, AL_MediaFormat, AL_MediaSeason, AL_MediaSort } from "@/api/generated/types"
import { useInfiniteAnimeSearch } from "@/api/hooks/search.hooks"
import { formatSeasonLabel, getCurrentSeason, listSeasons } from "@/components/features/discover/discover-queries"
import { TV, TVMediaGrid, TVPillButton, tvSize } from "@/components/tv"
import { SEARCH_MEDIA_GENRES } from "@/lib/search/search-constants"
import { DEFAULT_SEARCH_PARAMS, type SearchParams } from "@/lib/search/search.atoms"
import { useIsFocused } from "expo-router"
import * as React from "react"
import { ActivityIndicator, FlatList, Pressable, Text, TVFocusGuideView, View } from "react-native"

type PillRef = React.ElementRef<typeof Pressable>

type SeasonItem = { season: AL_MediaSeason; year: number }

const FORMATS: { value: AL_MediaFormat | null; label: string }[] = [
    { value: null, label: "All" },
    { value: "TV", label: "TV" },
    { value: "MOVIE", label: "Movie" },
    { value: "ONA", label: "ONA" },
    { value: "OVA", label: "OVA" },
    { value: "SPECIAL", label: "Special" },
]

// Long enough that holding left/right skims past seasons without loading each one
const SEASON_FOCUS_DELAY_MS = 350

const SORTS: { value: AL_MediaSort; label: string }[] = [
    { value: "POPULARITY_DESC", label: "Most popular" },
    { value: "SCORE_DESC", label: "Highest score" },
    { value: "TRENDING_DESC", label: "Trending" },
]

const GENRE_OPTIONS: (string | null)[] = [null, ...SEARCH_MEDIA_GENRES]

const seasonKey = (item: SeasonItem) => `${item.season}-${item.year}`

export function TVSeasonsScreen() {
    const isFocused = useIsFocused()
    const seasons = React.useMemo(() => listSeasons(), [])
    const [selected, setSelected] = React.useState<SeasonItem>(() => getCurrentSeason())
    // Filters live outside the season, so they stay set while moving between seasons
    const [format, setFormat] = React.useState<AL_MediaFormat | null>("TV")
    const [sorting, setSorting] = React.useState<AL_MediaSort>("POPULARITY_DESC")
    const [genres, setGenres] = React.useState<string[]>([])
    const [activeSeasonPill, setActiveSeasonPill] = React.useState<PillRef | null>(null)

    const selectSeason = React.useCallback((item: SeasonItem) => {
        setSelected(current => (
            current.season === item.season && current.year === item.year ? current : item
        ))
    }, [])

    // Focusing a season loads it once focus settles on it; OK loads it straight away
    const focusTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const clearFocusTimer = React.useCallback(() => {
        if (focusTimer.current) clearTimeout(focusTimer.current)
        focusTimer.current = null
    }, [])
    React.useEffect(() => clearFocusTimer, [clearFocusTimer])

    const toggleGenre = React.useCallback((genre: string) => {
        setGenres(current => (
            current.includes(genre) ? current.filter(value => value !== genre) : [...current, genre]
        ))
    }, [])

    // Local params, so browsing seasons never touches the search screen's filters
    const params = React.useMemo<SearchParams>(() => ({
        ...DEFAULT_SEARCH_PARAMS,
        type: "anime",
        season: selected.season,
        year: String(selected.year),
        format,
        sorting,
        genre: genres,
    }), [format, genres, selected, sorting])

    const search = useInfiniteAnimeSearch(params, true)
    const media = React.useMemo(() => (
        search.data?.pages
            .flatMap(page => page?.Page?.media ?? [])
            .filter(Boolean) as AL_BaseAnime[] ?? []
    ), [search.data?.pages])
    const total = search.data?.pages[0]?.Page?.pageInfo?.total

    const loadMore = React.useCallback(() => {
        if (search.hasNextPage && !search.isFetchingNextPage) {
            void search.fetchNextPage()
        }
    }, [search])

    const isSelected = React.useCallback((item: SeasonItem) => (
        item.season === selected.season && item.year === selected.year
    ), [selected])

    const renderSeason = React.useCallback(({ item }: { item: SeasonItem }) => {
        const active = isSelected(item)
        return (
            <TVPillButton
                ref={active ? setActiveSeasonPill : undefined}
                label={formatSeasonLabel(item.season, item.year)}
                active={active}
                onFocus={() => {
                    clearFocusTimer()
                    focusTimer.current = setTimeout(() => selectSeason(item), SEASON_FOCUS_DELAY_MS)
                }}
                onPress={() => {
                    clearFocusTimer()
                    selectSeason(item)
                }}
            />
        )
    }, [clearFocusTimer, isSelected, selectSeason])

    const renderGenre = React.useCallback(({ item }: { item: string | null }) => (
        <TVPillButton
            label={item ?? "All genres"}
            active={item === null ? genres.length === 0 : genres.includes(item)}
            onPress={() => item === null ? setGenres([]) : toggleGenre(item)}
        />
    ), [genres, toggleGenre])

    const header = (
        <View style={{ paddingTop: TV.navInset + tvSize(14), paddingBottom: tvSize(26), gap: tvSize(18) }}>
            <View
                style={{
                    paddingHorizontal: TV.gutter,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: tvSize(20),
                }}
            >
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: tvSize(14) }}>
                    <Text className="font-bold text-white" style={{ fontSize: tvSize(34) }}>
                        {formatSeasonLabel(selected.season, selected.year)}
                    </Text>
                    {total !== undefined && !search.isLoading ? (
                        <Text className="font-medium text-white/40" style={{ fontSize: tvSize(20) }}>
                            {total} {total === 1 ? "title" : "titles"}
                        </Text>
                    ) : null}
                </View>
            </View>

            <TVFocusGuideView
                autoFocus={isFocused}
                destinations={activeSeasonPill ? [activeSeasonPill] : undefined}
                trapFocusLeft
                trapFocusRight
            >
                <FlatList
                    horizontal
                    data={seasons}
                    extraData={selected}
                    keyExtractor={seasonKey}
                    renderItem={renderSeason}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingHorizontal: TV.gutter,
                        paddingVertical: tvSize(8),
                        gap: tvSize(10),
                    }}
                />
            </TVFocusGuideView>

            <TVFocusGuideView
                autoFocus={isFocused}
                trapFocusLeft
                trapFocusRight
                style={{
                    paddingHorizontal: TV.gutter,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: tvSize(10),
                }}
            >
                {FORMATS.map(option => (
                    <TVPillButton
                        key={option.label}
                        label={option.label}
                        active={format === option.value}
                        onPress={() => setFormat(option.value)}
                    />
                ))}
                <View
                    style={{
                        width: tvSize(1),
                        height: tvSize(28),
                        marginHorizontal: tvSize(10),
                        backgroundColor: "rgba(255,255,255,0.14)",
                    }}
                />
                {SORTS.map(option => (
                    <TVPillButton
                        key={option.value}
                        label={option.label}
                        active={sorting === option.value}
                        onPress={() => setSorting(option.value)}
                    />
                ))}
            </TVFocusGuideView>

            <TVFocusGuideView autoFocus={isFocused} trapFocusLeft trapFocusRight>
                <FlatList
                    horizontal
                    data={GENRE_OPTIONS}
                    extraData={genres}
                    keyExtractor={item => item ?? "all"}
                    renderItem={renderGenre}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingHorizontal: TV.gutter,
                        paddingVertical: tvSize(8),
                        gap: tvSize(10),
                    }}
                />
            </TVFocusGuideView>
        </View>
    )

    return (
        <View className="flex-1 bg-background">
            <TVMediaGrid
                media={search.isLoading ? [] : media}
                showAudienceScore
                loadingMore={search.isFetchingNextPage}
                onEndReached={loadMore}
                header={header}
                emptyComponent={search.isLoading ? (
                    <View style={{ minHeight: tvSize(340), alignItems: "center", justifyContent: "center" }}>
                        <ActivityIndicator size="large" color="#a89fff" />
                    </View>
                ) : undefined}
                emptyTitle={genres.length > 0 || format ? "Nothing matches these filters" : "Nothing aired this season"}
                emptyText={genres.length > 1
                    ? "Shows need every selected genre. Try fewer genres or another season."
                    : "Try other filters or another season."}
            />
        </View>
    )
}
