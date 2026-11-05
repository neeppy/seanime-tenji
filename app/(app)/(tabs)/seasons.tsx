import { TVSeasonsScreen } from "@/components/tv/tv-seasons-screen"
import { Redirect } from "expo-router"
import { Platform } from "react-native"

// TV only for now: the tab is hidden on the phone
export default function SeasonsScreen() {
    if (!Platform.isTV) return <Redirect href="/(app)/(tabs)/(library)" />
    return <TVSeasonsScreen />
}
