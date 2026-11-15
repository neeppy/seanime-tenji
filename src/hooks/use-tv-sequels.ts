// Fork: "Sequels to your shows" from AniList directly (see src/lib/sequels.ts for why).
// AniList rate-limits per IP, which the TV shares with the server, so requests are kept few:
// sequel links are cached on the device and only looked up for new or month-old shows, and
// each launch makes one request for the current details of the sequels found.
import type { AL_AnimeCollection_MediaListCollection_Lists_Entries, AL_BaseAnime, AL_MediaFormat } from "@/api/generated/types"
import {
    pickSequelCandidates,
    preferredTitleKey,
    selectSequels,
    type SequelLinkCache,
    showsToCheck,
    sideStoriesToFollow,
    withPreferredTitle,
} from "@/lib/sequels"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { createMMKV } from "react-native-mmkv"

type Entry = AL_AnimeCollection_MediaListCollection_Lists_Entries

const ANILIST_URL = "https://graphql.anilist.co"
const PAGE_SIZE = 50
// Sequels whose details are fetched each launch, newest first: one request
const MAX_CANDIDATES = 50
const SEED_STATUSES = new Set(["COMPLETED", "REPEATING", "PAUSED"])

const storage = createMMKV({ id: "tv-sequel-links" })
const LINKS_KEY = "links"

function loadLinks(): SequelLinkCache {
    try {
        return JSON.parse(storage.getString(LINKS_KEY) ?? "{}") as SequelLinkCache
    }
    catch {
        return {}
    }
}

function saveLinks(links: SequelLinkCache) {
    try {
        storage.set(LINKS_KEY, JSON.stringify(links))
    }
    catch {
    }
}

async function anilist<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(ANILIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ query, variables }),
    })
    if (!response.ok) throw new Error(`AniList ${response.status}`)
    const json = await response.json()
    if (json.errors?.length) throw new Error(`AniList: ${json.errors[0]?.message ?? "error"}`)
    return json.data as T
}

const LINKS_QUERY = `query ($ids: [Int]) {
  Page(perPage: ${PAGE_SIZE}) {
    media(id_in: $ids, type: ANIME) {
      id
      relations { edges { relationType node { id type format startDate { year } } } }
    }
  }
}`

type LinksResponse = {
    Page: {
        media: {
            id: number
            relations?: {
                edges?: {
                    relationType?: string
                    node?: { id: number, type?: string, format?: AL_MediaFormat, startDate?: { year?: number } }
                }[]
            }
        }[]
    }
}

/** Looks up sequel links for `ids` (50 per request, one at a time) and caches them */
async function fetchLinks(ids: number[], links: SequelLinkCache, now: number) {
    for (let index = 0; index < ids.length; index += PAGE_SIZE) {
        const batch = ids.slice(index, index + PAGE_SIZE)
        const data = await anilist<LinksResponse>(LINKS_QUERY, { ids: batch })
        // Shows AniList no longer returns are cached as having no sequels
        for (const id of batch) links[id] = { sequels: [], checkedAt: now }
        for (const media of data.Page.media ?? []) {
            links[media.id] = {
                checkedAt: now,
                sequels: (media.relations?.edges ?? [])
                    .filter(edge => edge.relationType === "SEQUEL" && edge.node?.type === "ANIME")
                    .map(edge => ({ id: edge.node!.id, format: edge.node!.format, year: edge.node!.startDate?.year })),
            }
        }
        saveLinks(links)
    }
}

const DETAILS_QUERY = `query ($ids: [Int]) {
  Page(perPage: ${MAX_CANDIDATES}) {
    media(id_in: $ids, type: ANIME) {
      id idMal siteUrl status season type format seasonYear bannerImage episodes synonyms isAdult
      countryOfOrigin meanScore description genres duration
      trailer { id site thumbnail }
      title { userPreferred romaji english native }
      coverImage { extraLarge large medium color }
      startDate { year month day }
      endDate { year month day }
      nextAiringEpisode { airingAt timeUntilAiring episode }
    }
  }
}`

async function loadSequels(seedIds: number[], listedIds: ReadonlySet<number>) {
    const now = Date.now()
    const links = loadLinks()

    // Link lookups that fail (e.g. rate limited) are skipped; the cache fills in on a later launch
    try {
        await fetchLinks(showsToCheck(seedIds, links, now), links, now)
        await fetchLinks(showsToCheck(sideStoriesToFollow(seedIds, links, listedIds), links, now), links, now)
    }
    catch {
    }

    const candidates = pickSequelCandidates(seedIds, links, listedIds).slice(0, MAX_CANDIDATES)
    if (candidates.length === 0) return []

    const data = await anilist<{ Page: { media: AL_BaseAnime[] } }>(DETAILS_QUERY, { ids: candidates.map(link => link.id) })
    return selectSequels(data.Page.media ?? [], listedIds)
}

/**
 * Sequels to the shows you've finished that aren't on your lists: TV seasons and films only.
 * Waits for `ready` (your lists loaded). `isError` means AniList couldn't be reached.
 */
export function useTVSequels(entries: Entry[], listedIds: ReadonlySet<number>, ready: boolean) {
    const seedIds = React.useMemo(
        () => entries.filter(entry => SEED_STATUSES.has(entry.status ?? "") && entry.media).map(entry => entry.media!.id),
        [entries],
    )
    // AniList without your login gives romaji titles; match your title language from your own list
    const titleKey = React.useMemo(() => preferredTitleKey(entries.map(entry => entry.media)), [entries])

    const query = useQuery({
        queryKey: ["tv-sequels", seedIds.length, listedIds.size],
        queryFn: () => loadSequels(seedIds, listedIds),
        enabled: ready && seedIds.length > 0,
        staleTime: Infinity,
        retry: false,
    })

    return React.useMemo(() => ({
        media: (query.data ?? []).map(media => withPreferredTitle(media, titleKey)),
        isLoading: query.isLoading,
        isError: query.isError,
    }), [query.data, query.isError, query.isLoading, titleKey])
}
