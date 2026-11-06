import type {
    AL_AnimeCollection_MediaListCollection_Lists_Entries,
    AL_AnimeDetailsById_Media,
    AL_BaseAnime,
} from "@/api/generated/types"

// Pure helpers for the TV home recommendations (no React, so tests can import them)

type Entry = AL_AnimeCollection_MediaListCollection_Lists_Entries

const MIN_SCORE = 80
const RECENT_MS = 183 * 24 * 60 * 60 * 1000
// Drawn once per app launch, so the picks change between launches but not while browsing
export const LAUNCH_SEED = Math.floor(Math.random() * 2 ** 31)

export function seededRandom(seed: number) {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6D2B79F5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** Shuffles by weight: heavier items tend to come first, but any item can. */
export function weightedShuffle<T>(items: T[], weight: (item: T) => number, random: () => number): T[] {
    return items
        .map(item => ({ item, key: Math.pow(random(), 1 / Math.max(weight(item), 0.001)) }))
        .sort((a, b) => b.key - a.key)
        .map(({ item }) => item)
}

function finishedAt(entry: Entry): number | undefined {
    const date = entry.completedAt
    if (date?.year) return new Date(date.year, (date.month ?? 1) - 1, date.day ?? 1).getTime()
    // Newer servers also send when the entry last changed (unix seconds)
    const updatedAt = (entry as { updatedAt?: number }).updatedAt
    return typeof updatedAt === "number" && updatedAt > 0 ? updatedAt * 1000 : undefined
}

/**
 * Completed shows scored 80+, in a random order that leans toward recent and high scores.
 * Shows finished in the last six months come first; older ones only fill in when there
 * aren't enough recent ones.
 */
export function pickSeeds(entries: Entry[], seed: number, now: number = Date.now()): AL_BaseAnime[] {
    const random = seededRandom(seed)
    const rated = entries.filter(entry => (
        entry.status === "COMPLETED" && (entry.score ?? 0) >= MIN_SCORE && !!entry.media && !entry.media.isAdult
    ))
    const isRecent = (entry: Entry) => {
        const time = finishedAt(entry)
        return time !== undefined && now - time <= RECENT_MS
    }
    const weight = (entry: Entry) => (entry.score ?? MIN_SCORE) - MIN_SCORE + 5
    const recent = weightedShuffle(rated.filter(isRecent), weight, random)
    const older = weightedShuffle(rated.filter(entry => !isRecent(entry)), weight, random)
    return [...recent, ...older].map(entry => entry.media!)
}

export function toBaseAnime(details: AL_AnimeDetailsById_Media | undefined): AL_BaseAnime[] {
    return (details?.recommendations?.edges ?? []).flatMap(edge => {
        const media = edge?.node?.mediaRecommendation
        if (!media || media.isAdult) return []
        return [{
            id: media.id,
            idMal: media.idMal,
            siteUrl: media.siteUrl,
            status: media.status,
            season: media.season,
            type: media.type,
            format: media.format,
            seasonYear: media.startDate?.year,
            bannerImage: media.bannerImage,
            episodes: media.episodes,
            isAdult: media.isAdult,
            meanScore: media.meanScore,
            description: media.description,
            title: media.title,
            coverImage: media.coverImage,
            startDate: media.startDate,
        }]
    })
}

type Page = { media: (AL_BaseAnime | null | undefined)[]; hasNextPage: boolean }

/**
 * Fetches pages until `want` shows not in `hidden` have turned up, there are no more pages,
 * or `maxPages` have been read. For genres you watch a lot of, the first page can be mostly
 * shows you've already seen.
 */
export async function collectUnseen(
    fetchPage: (page: number) => Promise<Page>,
    hidden: ReadonlySet<number>,
    want: number,
    maxPages: number,
): Promise<AL_BaseAnime[]> {
    const result: AL_BaseAnime[] = []
    const seen = new Set<number>()
    for (let page = 1; page <= maxPages && result.length < want; page++) {
        const { media, hasNextPage } = await fetchPage(page)
        for (const item of media) {
            if (!item || item.isAdult || hidden.has(item.id) || seen.has(item.id)) continue
            seen.add(item.id)
            result.push(item)
        }
        if (!hasNextPage) break
    }
    return result
}

export const GENRE_SORTS = [
    { sort: "SCORE_DESC", label: "Top rated" },
    { sort: "POPULARITY_DESC", label: "Popular" },
    { sort: "TRENDING_DESC", label: "Trending" },
] as const

/** A sort for each genre shelf, drawn per launch; each genre gets its own draw. */
export function pickGenreSort(genre: string, seed: number) {
    let hash = seed
    for (const char of genre) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
    const random = seededRandom(hash)
    return GENRE_SORTS[Math.floor(random() * GENRE_SORTS.length)]
}
