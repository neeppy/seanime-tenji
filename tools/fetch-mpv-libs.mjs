import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readdir, rm, writeFile, copyFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import path from "node:path"

// Downloads the prebuilt libmpv binaries from a pinned mpv-android release into the
// expo-mpv-player module (see modules/expo-mpv-player/android/src/main/jniLibs/README.md).
// libc++_shared.so is kept on purpose: plugins/withLibcppPickFirst.js packages mpv's copy.

const release = "2026-03-22"
const checksums = {
    "arm64-v8a": "3a379e2344b0d90be9814fa14e825661f3b4887d8ceb62a4bc946ee03d384a59",
    "armeabi-v7a": "50fdfe6381b5b0986b7619c6ae90729bd2a91d610985c4c1e284c9faa3ec3cc2",
}

const abis = (process.env.ANDROID_ARCHITECTURES || "arm64-v8a,armeabi-v7a").split(",").map(abi => abi.trim()).filter(Boolean)
const jniLibsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../modules/expo-mpv-player/android/src/main/jniLibs")
const workDir = await mkdtemp(path.join(tmpdir(), "mpv-libs-"))

try {
    for (const abi of abis) {
        const expected = checksums[abi]
        if (!expected) {
            throw new Error(`no pinned mpv-android checksum for ABI ${abi}`)
        }

        const url = `https://github.com/mpv-android/mpv-android/releases/download/${release}/app-default-${abi}-release.apk`
        console.log(`Downloading ${url}`)
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`download failed with ${response.status}: ${url}`)
        }

        const apk = Buffer.from(await response.arrayBuffer())
        const actual = createHash("sha256").update(apk).digest("hex")
        if (actual !== expected) {
            throw new Error(`checksum mismatch for ${abi}: expected ${expected}, got ${actual}`)
        }

        const apkPath = path.join(workDir, `${abi}.apk`)
        const extractDir = path.join(workDir, abi)
        await writeFile(apkPath, apk)
        execFileSync("unzip", ["-q", "-o", apkPath, `lib/${abi}/*.so`, "-d", extractDir])

        const sourceDir = path.join(extractDir, "lib", abi)
        const targetDir = path.join(jniLibsDir, abi)
        await rm(targetDir, { recursive: true, force: true })
        await mkdir(targetDir, { recursive: true })

        const libs = await readdir(sourceDir)
        for (const lib of libs) {
            await copyFile(path.join(sourceDir, lib), path.join(targetDir, lib))
        }
        console.log(`${abi}: ${libs.sort().join(", ")}`)
    }
}
finally {
    await rm(workDir, { recursive: true, force: true })
}
