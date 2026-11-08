import assert from "node:assert/strict"
import test from "node:test"
import { chapterReleaseTime, estimateMangaCadence, formatChapterDate, parseChapterDate, ulidTime } from "../src/lib/manga-cadence.ts"

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

test("WeebCentral's ULID chapter ids carry the upload date the site shows", () => {
    // real ids from WeebCentral, with the date it lists for each
    assert.equal(new Date(ulidTime("01M5BFH8YM5J7HMPV3C8KYW11X", NOW)!).toISOString().slice(0, 10), "2026-10-20")
    assert.equal(new Date(ulidTime("01KY2MGHQ0WGDVM343YSBK6NWA", NOW)!).toISOString().slice(0, 10), "2026-07-21")
    // not ULIDs: MangaDex uuids, short ids, slugs
    assert.equal(ulidTime("acdbf57f-bf54-41b4-8d92-b3f3d14c852e", NOW), null)
    assert.equal(ulidTime("12345", NOW), null)
    assert.equal(ulidTime("game-31", NOW), null)
    assert.equal(ulidTime(undefined, NOW), null)
})

test("a source's own date wins over the id, and the id fills in when there's none", () => {
    const id = "01M5BFH8YM5J7HMPV3C8KYW11X"
    assert.equal(chapterReleaseTime({ id, updatedAt: "2026-11-01T00:00:00Z" }, NOW), Date.parse("2026-11-01T00:00:00Z"))
    assert.equal(chapterReleaseTime({ id }, NOW), ulidTime(id, NOW))
    assert.equal(chapterReleaseTime({ id: "abc" }, NOW), null)
})

test("cadence works from ULID ids alone", () => {
    const ids = ["01M5BFH8YM5J7HMPV3C8KYW11X", "01M34JG2JXHAWQ5AXCRQPQZ7SD", "01KY2MGHQ0WGDVM343YSBK6NWA", "01KVS2KWXNA4HRXX01MWE3VM59", "01KRYSSY2W9ZGFX20NWTJCGYC8", "01KPF2J56Z7QX7JVV0VCWPFZJ4"]
    assert.equal(estimateMangaCadence(ids.map((id, index) => ({ id, chapter: String(index) })), NOW)?.label, "Monthly")
})
