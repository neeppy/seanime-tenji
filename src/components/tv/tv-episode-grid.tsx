import { TV, tvSize } from "./tv-scale"
import { TVPillButton } from "./tv-focus"
import { TVSectionHeader } from "./tv-section-header"
import * as React from "react"
import { FlatList, TVFocusGuideView, View } from "react-native"

export interface TVEpisodeGridProps<T> {
    title: string
    episodes: T[]
    pageSize?: number
    initialPage?: number
    after?: React.ReactNode
    action?: React.ReactNode
    renderItem: (item: T, index: number) => React.ReactNode
}

export function TVEpisodeGrid<T>({
    title,
    episodes,
    pageSize = 24,
    initialPage = 0,
    after,
    action,
    renderItem,
}: TVEpisodeGridProps<T>) {
    const [currentPage, setCurrentPage] = React.useState(initialPage)
    // The page pill highlights straight away; the 24 cards of the new page render right after
    const visiblePage = React.useDeferredValue(currentPage)

    // Only follow a new starting page (e.g. progress changed), not every refetch of the same episodes
    React.useEffect(() => {
        setCurrentPage(initialPage)
    }, [initialPage])

    const totalPages = Math.ceil(episodes.length / pageSize)
    const pagedEpisodes = React.useMemo(() => {
        const start = visiblePage * pageSize
        return episodes.slice(start, start + pageSize)
    }, [episodes, visiblePage, pageSize])

    if (episodes.length === 0) return null

    return (
        <View style={{ gap: tvSize(16), paddingHorizontal: TV.gutter }}>
            <TVSectionHeader
                title={title}
                count={episodes.length}
                after={after}
                action={action}
                padded={false}
            />

            {totalPages > 1 && (
                <View style={{ gap: tvSize(10), marginBottom: tvSize(10) }}>
                    <TVFocusGuideView trapFocusLeft trapFocusRight>
                        <FlatList
                            horizontal
                            data={Array.from({ length: totalPages })}
                            keyExtractor={(_, i) => String(i)}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: tvSize(12) }}
                            renderItem={({ index: i }) => {
                                const startEp = i * pageSize + 1
                                const endEp = Math.min((i + 1) * pageSize, episodes.length)
                                return (
                                    <TVPillButton
                                        label={`EP ${startEp} - ${endEp}`}
                                        active={currentPage === i}
                                        onPress={() => setCurrentPage(i)}
                                    />
                                )
                            }}
                        />
                    </TVFocusGuideView>
                </View>
            )}

            <TVFocusGuideView
                trapFocusLeft
                trapFocusRight
                style={{ flexDirection: "row", flexWrap: "wrap", gap: tvSize(20) }}
            >
                {pagedEpisodes.map((item, idx) => {
                    return renderItem(item, idx)
                })}
            </TVFocusGuideView>
        </View>
    )
}
