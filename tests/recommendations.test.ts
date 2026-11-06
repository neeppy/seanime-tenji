import assert from "node:assert/strict"
import test from "node:test"
import { collectUnseen, GENRE_SORTS, pickGenreSort, pickSeeds, toBaseAnime } from "../src/lib/recommendations.ts"

const NOW = new Date(2026, 10, 6).getTime()

function entry(id: number, score: number, completed?: [number, number], extra: Record<string, unknown> = {}) {
    return {
        id,
        score,
        status: "COMPLETED",
        completedAt: completed ? { year: completed[0], month: completed[1], day: 1 } : undefined,
        media: { id },
        ...extra,
    } as any
}

test("only completed shows scored 80 or more become seeds", () => {
    const seeds = pickSeeds([
        entry(1, 80, [2026, 9]),
        entry(2, 79, [2026, 9]),
        entry(3, 95, [2026, 9], { status: "CURRENT" }),
        entry(4, 0, [2026, 9]),
        entry(5, 90, [2026, 9], { media: { id: 5, isAdult: true } }),
    ], 1, NOW)
    assert.deepEqual(seeds.map(media => media.id), [1])
})

test("recently finished shows come before older ones", () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
        const seeds = pickSeeds([
            entry(1, 100, [2024, 1]),
            entry(2, 81, [2026, 8]),
            entry(3, 99, [2023, 5]),
            entry(4, 85, [2026, 10]),
        ], seed, NOW)
        assert.deepEqual(new Set(seeds.slice(0, 2).map(media => media.id)), new Set([2, 4]))
        assert.deepEqual(new Set(seeds.slice(2).map(media => media.id)), new Set([1, 3]))
    }
})

test("the same launch seed gives the same picks, different seeds can differ", () => {
    const entries = Array.from({ length: 12 }, (_, index) => entry(index + 1, 85 + (index % 10), [2026, 9]))
    const ids = (seed: number) => pickSeeds(entries, seed, NOW).map(media => media.id).join(",")
    assert.equal(ids(7), ids(7))
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(ids))
    assert.ok(orders.size > 1)
})

test("recommendations drop adult titles and take the year from the start date", () => {
    const media = toBaseAnime({
        id: 1,
        recommendations: {
            edges: [
                { node: { mediaRecommendation: { id: 10, startDate: { year: 2020 } } } },
                { node: { mediaRecommendation: { id: 11, isAdult: true } } },
                { node: {} },
            ],
        },
    } as any)
    assert.deepEqual(media.map(item => [item.id, item.seasonYear]), [[10, 2020]])
})

function pages(...ids: number[][]) {
    const calls: number[] = []
    const fetchPage = async (page: number) => {
        calls.push(page)
        return {
            media: (ids[page - 1] ?? []).map(id => ({ id }) as any),
            hasNextPage: page < ids.length,
        }
    }
    return { calls, fetchPage }
}

test("genre shelves keep reading pages until enough unseen shows turn up", async () => {
    const { calls, fetchPage } = pages([1, 2, 3], [4, 5, 6], [7, 8, 9])
    const media = await collectUnseen(fetchPage, new Set([1, 2, 3, 4]), 3, 4)
    assert.deepEqual(media.map(item => item.id), [5, 6, 7, 8, 9])
    assert.deepEqual(calls, [1, 2, 3])
})

test("genre shelves stop at the page limit or the last page", async () => {
    const limited = pages([1], [2], [3], [4], [5])
    assert.deepEqual((await collectUnseen(limited.fetchPage, new Set([1, 2, 3, 4, 5]), 10, 4)).length, 0)
    assert.deepEqual(limited.calls, [1, 2, 3, 4])

    const short = pages([1, 2])
    assert.deepEqual((await collectUnseen(short.fetchPage, new Set(), 10, 4)).map(item => item.id), [1, 2])
    assert.deepEqual(short.calls, [1])
})

test("each genre gets a sort per launch, and it stays the same within a launch", () => {
    assert.equal(pickGenreSort("Romance", 5), pickGenreSort("Romance", 5))
    const sorts = new Set(Array.from({ length: 30 }, (_, seed) => pickGenreSort("Romance", seed).sort))
    assert.equal(sorts.size, GENRE_SORTS.length)
})
