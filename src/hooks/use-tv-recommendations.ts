import { buildSeaQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import type { AnilistListAnime_Variables } from "@/api/generated/endpoint.types"
import type { AL_AnimeCollection_MediaListCollection_Lists_Entries, AL_BaseAnime, AL_ListAnime } from "@/api/generated/types"
import { useGetAnilistAnimeDetails } from "@/api/hooks/anilist.hooks"
import { useServerAuthToken, useServerUrl } from "@/atoms/server.atoms"
import { collectUnseen, LAUNCH_SEED, pickGenreSort, pickSeeds, toBaseAnime } from "@/lib/recommendations"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"

type Entry = AL_AnimeCollection_MediaListCollection_Lists_Entries

export type RecommendationShelf = {
    seed: AL_BaseAnime
    media: AL_BaseAnime[]
}

const SHELF_COUNT = 2
// AniList gives 8 recommendations per show; after hiding what's on your lists some seeds
// have too few left, so look at a couple of extra seeds and keep the first ones that fill a shelf
const CANDIDATE_COUNT = 4
const MIN_SHELF_ITEMS = 4

/**
 * "Because you watched" shelves built from AniList recommendations for a few of your
 * favourite recent shows. `hiddenIds` are left out (shows already on your lists).
 */
export function useTVRecommendations(entries: Entry[], hiddenIds: ReadonlySet<number>) {
    const seeds = React.useMemo(() => pickSeeds(entries, LAUNCH_SEED).slice(0, CANDIDATE_COUNT), [entries])

    // A fixed number of hooks; ids past the end of the list disable their query
    const first = useGetAnilistAnimeDetails(seeds[0]?.id)
    const second = useGetAnilistAnimeDetails(seeds[1]?.id)
    const third = useGetAnilistAnimeDetails(seeds[2]?.id)
    const fourth = useGetAnilistAnimeDetails(seeds[3]?.id)
    const results = [first, second, third, fourth]
    const isLoading = results.some((result, index) => !!seeds[index] && result.isLoading)

    const shelves = React.useMemo<RecommendationShelf[]>(() => {
        // Wait for every candidate so shelves don't appear and then reshuffle
        if (isLoading) return []
        const used = new Set<number>()
        const picked: RecommendationShelf[] = []
        for (const [index, seed] of seeds.entries()) {
            if (picked.length >= SHELF_COUNT) break
            const media = toBaseAnime(results[index].data)
                .filter(item => !hiddenIds.has(item.id) && !used.has(item.id))
            if (media.length < MIN_SHELF_ITEMS) continue
            media.forEach(item => used.add(item.id))
            picked.push({ seed, media })
        }
        return picked
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, seeds, hiddenIds, first.data, second.data, third.data, fourth.data])

    return { shelves, isLoading }
}

const GENRE_SHELF_SIZE = 16
const GENRE_PAGE_SIZE = 50
// Up to 200 shows, so a genre you've watched a lot of still fills a shelf
const GENRE_MAX_PAGES = 4
const GENRE_MIN_SCORE = 65

/**
 * Well-rated shows in one genre that aren't on your lists. The sort (top rated, popular or
 * trending) is drawn per launch. Waits for `ready` (your lists loaded) so it knows what to hide.
 */
export function useTVGenreShelf(genre: string, hiddenIds: ReadonlySet<number>, ready: boolean) {
    const serverUrl = useServerUrl()
    const authToken = useServerAuthToken()
    const sort = React.useMemo(() => pickGenreSort(genre, LAUNCH_SEED), [genre])

    const query = useQuery({
        queryKey: ["tv-genre-shelf", serverUrl, genre, sort.sort, hiddenIds.size],
        queryFn: () => collectUnseen(async page => {
            const result = await buildSeaQuery<AL_ListAnime, AnilistListAnime_Variables>({
                serverUrl,
                endpoint: API_ENDPOINTS.ANILIST.AnilistListAnime.endpoint,
                method: API_ENDPOINTS.ANILIST.AnilistListAnime.methods[0],
                authToken,
                data: {
                    page,
                    perPage: GENRE_PAGE_SIZE,
                    sort: [sort.sort],
                    genres: [genre],
                    averageScore_greater: GENRE_MIN_SCORE,
                    isAdult: false,
                },
            })
            return {
                media: result?.Page?.media ?? [],
                hasNextPage: !!result?.Page?.pageInfo?.hasNextPage,
            }
        }, hiddenIds, GENRE_SHELF_SIZE, GENRE_MAX_PAGES),
        enabled: !!serverUrl && ready,
        staleTime: Infinity,
    })

    // Disabled until ready, which reads as not loading; the caller already waits for the lists
    return React.useMemo(() => ({
        media: query.data ?? [],
        sortLabel: sort.label,
        isLoading: query.isLoading,
    }), [query.data, query.isLoading, sort.label])
}
