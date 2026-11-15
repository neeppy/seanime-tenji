// Fork: pick a 1–10 score with one press, instead of stepping through 0.5 increments.
// Scores go to the server as 0–100 (score × 10), as the list form always sent them.
import { TVPillButton } from "@/components/tv/tv-focus"
import { tvSize } from "@/components/tv/tv-scale"
import * as React from "react"
import { Pressable, TVFocusGuideView, View } from "react-native"

type PressableRef = React.ElementRef<typeof Pressable>

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
// Where focus starts when there's no score yet: most shows land around here
const DEFAULT_FOCUS = 7

type Props = {
    /** Current score, 0–10 (0 is none) */
    value: number
    onSelect: (score: number) => void
    /** Attached to the pill focus should start on: the current score, or 7 */
    focusRef?: React.Ref<PressableRef>
    /** Adds a "None" pill that clears the score */
    allowClear?: boolean
    disabled?: boolean
}

export function TVScoreRow({ value, onSelect, focusRef, allowClear, disabled }: Props) {
    const focusOn = value >= 1 && value <= 10 ? value : DEFAULT_FOCUS
    return (
        <TVFocusGuideView trapFocusLeft trapFocusRight>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tvSize(10), padding: tvSize(4) }}>
                {allowClear ? (
                    <TVPillButton label="None" active={!value} disabled={disabled} onPress={() => onSelect(0)} />
                ) : null}
                {SCORES.map(score => (
                    <TVPillButton
                        key={score}
                        ref={score === focusOn ? focusRef : undefined}
                        label={String(score)}
                        active={value === score}
                        disabled={disabled}
                        onPress={() => onSelect(score)}
                    />
                ))}
            </View>
        </TVFocusGuideView>
    )
}
