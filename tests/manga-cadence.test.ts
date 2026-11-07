import assert from "node:assert/strict"
import test from "node:test"
import { estimateMangaCadence, formatChapterDate, parseChapterDate } from "../src/lib/manga-cadence.ts"

const NOW = new Date(2026, 10, 8, 12).getTime()
const DAY = 24 * 60 * 60 * 1000

function chapters(...daysAgo: number[]) {
    return daysAgo.map((ago, index) => ({
        chapter: String(index + 1),
        updatedAt: new Date(NOW - ago * DAY).toISOString(),
    }))
}

test("chapter dates parse ISO dates and unix timestamps, and reject junk", () => {
    const iso = "2026-11-01T10:00:00Z"
    assert.equal(parseChapterDate(iso, NOW), Date.parse(iso))
    assert.equal(parseChapterDate("1762000000", NOW), 1762000000 * 1000)
    assert.equal(parseChapterDate("1762000000000", NOW), 1762000000000)
    assert.equal(parseChapterDate("", NOW), null)
    assert.equal(parseChapterDate(undefined, NOW), null)
    assert.equal(parseChapterDate("3 days ago", NOW), null)
    assert.equal(parseChapterDate("0001-01-01T00:00:00Z", NOW), null)
    assert.equal(parseChapterDate(new Date(NOW + 30 * DAY).toISOString(), NOW), null)
})

test("chapter dates read as relative within a week, then as a date", () => {
    assert.equal(formatChapterDate(NOW - 2 * 60 * 60 * 1000, NOW), "Today")
    assert.equal(formatChapterDate(NOW - DAY, NOW), "Yesterday")
    assert.equal(formatChapterDate(NOW - 3 * DAY, NOW), "3d ago")
    assert.equal(formatChapterDate(new Date(2026, 9, 2).getTime(), NOW), "Oct 2")
    assert.equal(formatChapterDate(new Date(2024, 0, 15).getTime(), NOW), "Jan 15, 2024")
})

test("weekly and monthly series are recognised", () => {
    assert.equal(estimateMangaCadence(chapters(35, 28, 21, 14, 7, 0), NOW)?.label, "Weekly")
    assert.equal(estimateMangaCadence(chapters(120, 90, 61, 30, 1), NOW)?.label, "Monthly")
    assert.equal(estimateMangaCadence(chapters(56, 42, 28, 14, 0), NOW)?.label, "Every 2 weeks")
})

test("a one-off break or a backlog dumped on one day doesn't throw the estimate off", () => {
    // weekly, with a 5 week break in the middle
    assert.equal(estimateMangaCadence(chapters(98, 91, 84, 49, 42, 35, 28, 21, 14, 7), NOW)?.label, "Weekly")
    // 20 old chapters uploaded on the same day, then weekly
    const backlog = Array.from({ length: 20 }, () => 60)
    assert.equal(estimateMangaCadence(chapters(...backlog, 28, 21, 14, 7, 0), NOW)?.label, "Weekly")
})

test("several scanlators uploading the same chapter count as one release", () => {
    const list = [...chapters(21, 14, 7, 0), ...chapters(21, 14, 7, 0)]
    assert.equal(estimateMangaCadence(list, NOW)?.days, 7)
})

test("no cadence without enough dated chapters", () => {
    assert.equal(estimateMangaCadence(chapters(14, 7, 0), NOW), null)
    assert.equal(estimateMangaCadence([{ chapter: "1" }, { chapter: "2", updatedAt: "" }], NOW), null)
})
