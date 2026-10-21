/**
 * Release signing from environment variables
 *
 * Expo's generated build.gradle signs release builds with the debug keystore.
 * When SIGNING_KEYSTORE_PATH is set at Gradle time, sign release builds with that keystore instead.
 * Secrets are read by Gradle when it runs, so they never end up in the generated android/ project.
 */
const { withAppBuildGradle } = require("expo/config-plugins")

const GRADLE_SNIPPET = `
// withAndroidReleaseSigning: sign release builds with the keystore from the environment
if (System.getenv("SIGNING_KEYSTORE_PATH")) {
    android {
        signingConfigs {
            release {
                storeFile file(System.getenv("SIGNING_KEYSTORE_PATH"))
                storePassword System.getenv("SIGNING_KEYSTORE_PASSWORD")
                keyAlias System.getenv("SIGNING_KEY_ALIAS")
                keyPassword System.getenv("SIGNING_KEY_PASSWORD")
            }
        }
        buildTypes.release.signingConfig = signingConfigs.release
    }
}
`

module.exports = function withAndroidReleaseSigning(config) {
    return withAppBuildGradle(config, (config) => {
        const contents = config.modResults.contents

        if (!contents.includes("withAndroidReleaseSigning: sign release builds")) {
            config.modResults.contents = contents + "\n" + GRADLE_SNIPPET
        }

        return config
    })
}
