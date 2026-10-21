import { mkdtemp, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import path from "node:path"

// Renders the launcher icons, splash logo and Android TV banner from src/assets/images/icon-source.webp.
// sharp is not a project dependency; it is installed into a temporary directory for the run.
// The adaptive icon background colour lives in app.config.ts (android.adaptiveIcon.backgroundColor).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const images = path.join(root, "src/assets/images")
const source = path.join(images, "icon-source.webp")
const bannerText = process.argv[2] || "Anime"

const sharpDir = await mkdtemp(path.join(tmpdir(), "render-icons-"))

try {
    execFileSync("npm", ["install", "--silent", "--prefix", sharpDir, "sharp@0.34.3"], { stdio: "inherit" })
    const sharp = createRequire(path.join(sharpDir, "package.json"))("sharp")

    // Trim transparent margins and pad to a square so the sticker stays centered
    const trimmed = await sharp(source).ensureAlpha().trim({ threshold: 10 }).png().toBuffer()
    const { width, height } = await sharp(trimmed).metadata()
    const side = Math.max(width, height)
    const master = await sharp(trimmed)
        .extend({
            top: Math.floor((side - height) / 2), bottom: Math.ceil((side - height) / 2),
            left: Math.floor((side - width) / 2), right: Math.ceil((side - width) / 2),
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer()

    const centered = async (canvas, size, file) => {
        const inner = await sharp(master).resize(size, size).png().toBuffer()
        await sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite([{ input: inner, gravity: "center" }])
            .png()
            .toFile(path.join(images, file))
    }

    await centered(512, 496, "icon.png")
    // Launchers show only the middle 72/108 of an adaptive icon; 290/512 keeps the sticker clear of the mask
    await centered(512, 290, "adaptive-icon.png")
    await centered(512, 512, "splash-logo.png")

    const sticker = await sharp(master).resize(132, 132).png().toBuffer()
    const text = Buffer.from(`<svg width="320" height="180"><text x="178" y="104" font-family="Ubuntu" font-weight="700" font-size="42" fill="#ffffff">${bannerText}</text></svg>`)
    await sharp({ create: { width: 320, height: 180, channels: 4, background: "#141414" } })
        .composite([{ input: sticker, left: 34, top: 24 }, { input: text, left: 0, top: 0 }])
        .png()
        .toFile(path.join(images, "tv/android-tv-banner.png"))

    console.log(`Rendered icons from ${path.relative(root, source)} (banner text "${bannerText}")`)
}
finally {
    await rm(sharpDir, { recursive: true, force: true })
}
