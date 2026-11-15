import assert from "node:assert/strict"
import test from "node:test"
import { LINK_MAX_AGE_MS, pickSequelCandidates, preferredTitleKey, withPreferredTitle, selectSequels, showsToCheck, sideStoriesToFollow, type SequelLinkCache } from "../src/lib/sequels.ts"

const NOW = Date.UTC(2026, 10, 15)

function cache(links: Record<number, [number, string, number?][]>, checkedAt = NOW): SequelLinkCache {
    return Object.fromEntries(Object.entries(links).map(([id, sequels]) => [id, {
        checkedAt,
        sequels: sequels.map(([sequelId, format, year]) => ({ id: sequelId, format: format as any, year })),
    }]))
}

test("only shows that aren't cached, or were checked over a month ago, get looked up", () => {
    const links = { ...cache({ 1: [] }), ...cache({ 2: [] }, NOW - LINK_MAX_AGE_MS - 1) }
    assert.deepEqual(showsToCheck([1, 2, 3], links, NOW), [2, 3])
})

test("every TV or movie sequel counts, not just the first link", () => {
    // show 1 lists an OVA first, then season 2 and a movie
    const links = cache({ 1: [[10, "OVA"], [11, "TV", 2024], [12, "MOVIE", 2025]] })
    assert.deepEqual(pickSequelCandidates([1], links, new Set([1])).map(link => link.id), [12, 11])
})

test("sequels already on your lists are left out", () => {
    const links = cache({ 1: [[11, "TV"]], 2: [[12, "TV"]] })
    assert.deepEqual(pickSequelCandidates([1, 2], links, new Set([1, 2, 11])).map(link => link.id), [12])
})

test("a skipped OVA between seasons is stepped through to the next season", () => {
    const links = cache({
        1: [[10, "OVA"]],
        10: [[11, "TV", 2023], [13, "SPECIAL"]],
    })
    const listed = new Set([1])
    assert.deepEqual(sideStoriesToFollow([1], links, listed), [10])
    assert.deepEqual(pickSequelCandidates([1], links, listed).map(link => link.id), [11])
})

test("an OVA you've added isn't stepped through (it's a finished show of its own)", () => {
    const links = cache({ 1: [[10, "OVA"]], 10: [[11, "TV"]] })
    assert.deepEqual(sideStoriesToFollow([1], links, new Set([1, 10])), [])
    assert.deepEqual(pickSequelCandidates([1], links, new Set([1, 10])), [])
})

test("the same sequel reached from two shows appears once", () => {
    const links = cache({ 1: [[11, "TV"]], 2: [[11, "TV"]] })
    assert.equal(pickSequelCandidates([1, 2], links, new Set([1, 2])).length, 1)
})

test("the shelf keeps sequels that are out, newest first", () => {
    const media = [
        { id: 1, status: "FINISHED", format: "TV", startDate: { year: 2020, month: 4 } },
        { id: 2, status: "RELEASING", format: "TV", startDate: { year: 2026, month: 10 } },
        { id: 3, status: "NOT_YET_RELEASED", format: "TV", startDate: { year: 2027 } },
        { id: 4, status: "FINISHED", format: "OVA", startDate: { year: 2022 } },
        { id: 5, status: "FINISHED", format: "MOVIE", isAdult: true },
        { id: 6, status: "FINISHED", format: "MOVIE", startDate: { year: 2020, month: 9 } },
        { id: 7, status: "FINISHED", format: "TV" },
    ] as any
    assert.deepEqual(selectSequels(media, new Set([7])).map(item => item.id), [2, 6, 1])
})

test("titles follow the language your own list shows", () => {
    const list = [
        { title: { userPreferred: "Attack on Titan", english: "Attack on Titan", romaji: "Shingeki no Kyojin" } },
        { title: { userPreferred: "Frieren", english: "Frieren", romaji: "Sousou no Frieren" } },
        { title: { userPreferred: "Bocchi", english: "Bocchi", romaji: "Bocchi" } }, // same in both, no vote
    ] as any
    assert.equal(preferredTitleKey(list), "english")
    assert.equal(preferredTitleKey([]), "romaji")

    const sequel = { id: 1, title: { userPreferred: "Kaguya-sama wa Kokurasetai?", romaji: "Kaguya-sama wa Kokurasetai?", english: "Kaguya-sama: Love is War Season 2" } } as any
    assert.equal(withPreferredTitle(sequel, "english").title?.userPreferred, "Kaguya-sama: Love is War Season 2")
    // no English title: left as it is
    assert.equal(withPreferredTitle({ id: 2, title: { userPreferred: "X", romaji: "X" } } as any, "english").title?.userPreferred, "X")
})
