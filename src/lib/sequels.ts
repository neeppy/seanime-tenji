// Fork: "Sequels to your shows", worked out on the device instead of by the server, which keeps
// only the first sequel link per show and a random 10. Pure so it can be unit tested.
import type { AL_BaseAnime, AL_MediaFormat } from "@/api/generated/types"

/** A show's sequel link, as cached: the sequel's id, format and start year */
export type SequelLink = { id: number, format?: AL_MediaFormat, year?: number }

/** Sequel links per show id, with when they were last looked up */
export type SequelLinkCache = Record<number, { sequels: SequelLink[], checkedAt: number }>

const DAY_MS = 24 * 60 * 60 * 1000
// Links between shows rarely change, so they're looked up again only after a month
export const LINK_MAX_AGE_MS = 30 * DAY_MS
// Full seasons and films. OVAs, ONAs and specials are mostly side stories.
const MAINLINE_FORMATS = new Set<AL_MediaFormat>(["TV", "TV_SHORT", "MOVIE"])

export function isMainline(format: AL_MediaFormat | undefined) {
    // A show with no format on AniList is kept rather than guessed at
    return !format || MAINLINE_FORMATS.has(format)
}

/** Shows whose sequel links aren't cached, or were looked up too long ago */
export function showsToCheck(ids: Iterable<number>, cache: SequelLinkCache, now: number) {
    const result: number[] = []
    for (const id of ids) {
        const cached = cache[id]
        if (!cached || now - cached.checkedAt > LINK_MAX_AGE_MS) result.push(id)
    }
    return result
}

/**
 * Sequels you haven't added, from the shows you've finished (`seedIds`). Full seasons and films
 * count directly. When the sequel is an OVA or special you skipped, its own mainline sequels
 * count instead (Season 1 → OVA → Season 2), one step deep. Newest first.
 */
export function pickSequelCandidates(seedIds: Iterable<number>, cache: SequelLinkCache, listedIds: ReadonlySet<number>) {
    const found = new Map<number, SequelLink>()
    const add = (link: SequelLink) => {
        if (!listedIds.has(link.id) && !found.has(link.id)) found.set(link.id, link)
    }

    for (const seed of seedIds) {
        for (const link of cache[seed]?.sequels ?? []) {
            if (listedIds.has(link.id)) continue
            if (isMainline(link.format)) {
                add(link)
                continue
            }
            for (const next of cache[link.id]?.sequels ?? []) {
                if (isMainline(next.format)) add(next)
            }
        }
    }

    return [...found.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
}

/** Side-story sequels (OVAs, specials) you skipped, whose own links are needed for the extra step */
export function sideStoriesToFollow(seedIds: Iterable<number>, cache: SequelLinkCache, listedIds: ReadonlySet<number>) {
    const result = new Set<number>()
    for (const seed of seedIds) {
        for (const link of cache[seed]?.sequels ?? []) {
            if (!listedIds.has(link.id) && !isMainline(link.format)) result.add(link.id)
        }
    }
    return [...result]
}

/** The shelf: sequels that are out (airing or finished), not adult and not on your lists, newest first */
export function selectSequels(media: AL_BaseAnime[], listedIds: ReadonlySet<number>) {
    const startKey = (item: AL_BaseAnime) => {
        const date = item.startDate
        return (date?.year ?? item.seasonYear ?? 0) * 10000 + (date?.month ?? 0) * 100 + (date?.day ?? 0)
    }
    return media
        .filter(item => !item.isAdult
            && !listedIds.has(item.id)
            && isMainline(item.format)
            && (item.status === "FINISHED" || item.status === "RELEASING"))
        .sort((a, b) => startKey(b) - startKey(a))
}

type TitleKey = "english" | "romaji" | "native"

/**
 * Which title language your AniList account shows, read off your own list (the server fetches it
 * with your login, so `userPreferred` there follows your setting). Requests made without your
 * login get romaji as `userPreferred`, so this lets those titles match the rest of the app.
 */
export function preferredTitleKey(media: (AL_BaseAnime | null | undefined)[]): TitleKey {
    const votes: Record<TitleKey, number> = { english: 0, romaji: 0, native: 0 }
    for (const item of media) {
        const title = item?.title
        if (!title?.userPreferred) continue
        // Only titles where the languages differ say anything
        const keys = (["english", "romaji", "native"] as const).filter(key => title[key] === title.userPreferred)
        if (keys.length === 1) votes[keys[0]]++
    }
    return (Object.keys(votes) as TitleKey[]).reduce((best, key) => votes[key] > votes[best] ? key : best, "romaji")
}

export function withPreferredTitle(media: AL_BaseAnime, key: TitleKey): AL_BaseAnime {
    const preferred = media.title?.[key]
    if (!media.title || !preferred || preferred === media.title.userPreferred) return media
    return { ...media, title: { ...media.title, userPreferred: preferred } }
}
