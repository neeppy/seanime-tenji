# libmpv JNI Libraries

This directory must contain the prebuilt libmpv `.so` binaries for each ABI.

## Required Structure

```
jniLibs/
  arm64-v8a/
    libmpv.so
  armeabi-v7a/
    libmpv.so
  x86_64/
    libmpv.so
  x86/
    libmpv.so
```

## How to Obtain

Run `node tools/fetch-mpv-libs.mjs` to download the pinned release and verify its checksums.
Set `ANDROID_ARCHITECTURES` (e.g. `arm64-v8a`) to limit which ABIs are fetched.

The recommended source is the [mpv-android](https://github.com/mpv-android/mpv-android) project.

### Option A: Download from mpv-android releases

1. Go to https://github.com/mpv-android/mpv-android/releases
2. Download the universal debug APK
3. Extract the `.so` files from `lib/{abi}/` inside the APK (it's a zip)
4. Place them in the above structure
5. Keep `libc++_shared.so`: `plugins/withLibcppPickFirst.js` packages mpv's newer copy over React Native's

### Option B: Build from source

1. Clone https://github.com/mpv-android/mpv-android
2. Follow their buildscripts README to compile libmpv for Android
3. Copy the resulting `.so` files here

## Pinned Version

- **mpv-android version:** 2026-03-22 release
- **Source:** https://github.com/mpv-android/mpv-android/releases/tag/2026-03-22
- **Date obtained:** 2025-07-03
