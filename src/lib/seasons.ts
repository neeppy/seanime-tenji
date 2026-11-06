import type { AL_MediaSeason } from "@/api/generated/types"

// Kept out of discover-queries.ts so that file stays identical to upstream

export type SeasonItem = { season: AL_MediaSeason; year: number }

const SEASON_ORDER: AL_MediaSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"]

/**
 * Returns the current AniList season and year based on the current month.
 */
export function getCurrentSeason(): SeasonItem {
    const month = new Date().getMonth() + 1
    const year = new Date().getFullYear()
    let season: AL_MediaSeason = "WINTER"
    if (month >= 4 && month <= 6) season = "SPRING"
    else if (month >= 7 && month <= 9) season = "SUMMER"
    else if (month >= 10 && month <= 12) season = "FALL"
    return { season, year }
}

/**
 * Returns the season before the current one.
 */
export function getPreviousSeason(): SeasonItem {
    const { season, year } = getCurrentSeason()
    const index = SEASON_ORDER.indexOf(season)
    return index === 0
        ? { season: "FALL", year: year - 1 }
        : { season: SEASON_ORDER[index - 1], year }
}

export function formatSeasonLabel(season: AL_MediaSeason, year: number): string {
    return `${season.charAt(0)}${season.slice(1).toLowerCase()} ${year}`
}

/**
 * Every season from next season back to Winter of `oldestYear`, newest first.
 */
export function listSeasons(oldestYear: number = 1980): SeasonItem[] {
    const { season, year } = getCurrentSeason()
    const items: SeasonItem[] = []
    let index = SEASON_ORDER.indexOf(season) + 1
    let currentYear = year
    if (index === SEASON_ORDER.length) {
        index = 0
        currentYear++
    }
    while (currentYear >= oldestYear) {
        items.push({ season: SEASON_ORDER[index], year: currentYear })
        index--
        if (index < 0) {
            index = SEASON_ORDER.length - 1
            currentYear--
        }
    }
    return items
}
