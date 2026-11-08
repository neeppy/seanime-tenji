// Fork: chapter release dates and a rough release cadence, from the `updatedAt` that manga
// source extensions may fill in on each chapter. Pure so it can be unit tested.

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_DATE = Date.UTC(1990, 0, 1)
// Releases looked at for the cadence; recent ones say more about the current schedule
const CADENCE_WINDOW = 12
const MIN_GAPS = 3

type ChapterLike = { id?: string, chapter: string, updatedAt?: string }

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/

/**
 * Parses a chapter's `updatedAt` into a timestamp. Extensions differ: ISO dates, plain dates
 * or unix timestamps (seconds or milliseconds). Anything unparseable or implausible is null.
 */
export function parseChapterDate(value: string | undefined | null, now = Date.now()): number | null {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null

    let time: number
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
        const number = Number(trimmed)
        time = number < 1e11 ? number * 1000 : number
    } else {
        time = Date.parse(trimmed)
    }

    if (!Number.isFinite(time) || time < MIN_DATE || time > now + 2 * DAY_MS) return null
    return time
}

/**
 * Some sites (WeebCentral) use ULIDs as chapter ids, which start with the creation time in
 * milliseconds. That's the upload date the site itself shows, so it stands in for `updatedAt`.
 */
export function ulidTime(id: string | undefined | null, now = Date.now()): number | null {
    if (!id || !ULID_PATTERN.test(id.toUpperCase())) return null
    let time = 0
    for (const char of id.slice(0, 10).toUpperCase()) {
        time = time * 32 + ULID_ALPHABET.indexOf(char)
    }
    return time < MIN_DATE || time > now + 2 * DAY_MS ? null : time
}

/** When a chapter came out: the source's `updatedAt`, or the time in a ULID chapter id. */
export function chapterReleaseTime(chapter: Pick<ChapterLike, "id" | "updatedAt">, now = Date.now()): number | null {
    return parseChapterDate(chapter.updatedAt, now) ?? ulidTime(chapter.id, now)
}

/** "Today", "3d ago" within a week, otherwise "Nov 2" (with the year when it isn't this year). */
export function formatChapterDate(time: number, now = Date.now()): string {
    const date = new Date(time)
    const today = new Date(now)
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const days = Math.round((startOfToday - startOfDay) / DAY_MS)

    if (days <= 0) return "Today"
    if (days === 1) return "Yesterday"
    if (days < 7) return `${days}d ago`

    const month = date.toLocaleString("en-US", { month: "short" })
    return date.getFullYear() === today.getFullYear()
        ? `${month} ${date.getDate()}`
        : `${month} ${date.getDate()}, ${date.getFullYear()}`
}

function median(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export type MangaCadence = {
    label: string
    /** Typical days between releases */
    days: number
}

function cadenceLabel(days: number) {
    if (days < 5) return "Every few days"
    if (days < 10) return "Weekly"
    if (days < 18) return "Every 2 weeks"
    if (days < 25) return "Every 3 weeks"
    if (days < 45) return "Monthly"
    if (days < 75) return "Every 2 months"
    return "Every few months"
}

/**
 * A rough release cadence from chapter dates. Several scanlators or a backlog dumped on one day
 * would skew a plain average, so chapters are collapsed into distinct release days and the
 * median gap between the most recent ones is used. Null without enough dated chapters.
 */
export function estimateMangaCadence(chapters: ChapterLike[], now = Date.now()): MangaCadence | null {
    const days = new Set<number>()
    for (const chapter of chapters) {
        const time = chapterReleaseTime(chapter, now)
        if (time !== null) days.add(Math.floor(time / DAY_MS))
    }

    const recent = [...days].sort((a, b) => a - b).slice(-(CADENCE_WINDOW + 1))
    const gaps = recent.slice(1).map((day, index) => day - recent[index])
    if (gaps.length < MIN_GAPS) return null

    const typical = median(gaps)
    return { label: cadenceLabel(typical), days: typical }
}
