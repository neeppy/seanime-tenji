import { TVEntryRouteProvider } from "@/components/tv/tv-focus"
import { Stack } from "expo-router"

export default function EntryLayout() {
    return (
        <TVEntryRouteProvider>
            <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }} />
        </TVEntryRouteProvider>
    )
}
