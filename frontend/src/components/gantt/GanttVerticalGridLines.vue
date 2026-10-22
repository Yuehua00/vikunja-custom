<template>
	<div class="gantt-grid-lines">
		<svg
			class="gantt-vertical-lines"
			:width="totalWidth"
			:height="height"
			xmlns="http://www.w3.org/2000/svg"
		>
			<!-- Days of the other months are tinted, so the current month stands out. -->
			<rect
				v-for="range in dimmedRanges"
				:key="range.x"
				:x="range.x"
				y="0"
				:width="range.width"
				:height="height"
				fill="var(--grey-300)"
				opacity="0.15"
			/>
			<line
				v-for="line in lines"
				:key="line.key"
				:x1="line.x"
				:y1="0"
				:x2="line.x"
				:y2="height"
				:stroke="line.stroke"
				:stroke-width="line.width"
				:opacity="line.opacity"
			/>
		</svg>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'

import {useGlobalNow} from '@/composables/useGlobalNow'
import {useAuthStore} from '@/stores/auth'

const props = defineProps<{
	timelineData: Date[]
	totalWidth: number
	height: number
	dayWidthPixels: number
}>()

const authStore = useAuthStore()
const {now} = useGlobalNow()

const monthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`
const weekStart = computed(() => authStore.settings.week_start ?? 0)

// Only the month of today stays at full strength. When the timeline does not show it at all, nothing
// is dimmed, otherwise the whole chart would fade.
const hasCurrentMonth = computed(() => props.timelineData.some(date => monthKey(date) === monthKey(now.value)))
const isDimmed = (date: Date) => hasCurrentMonth.value && monthKey(date) !== monthKey(now.value)

// A week starts with a slightly firmer line and a month with a bit more, a plain day with a hairline.
// Kept light on purpose: the chart should stay calm, the lines only help to find the week and the month.
const lines = computed(() => props.timelineData.map((date, index) => {
	const kind = date.getDate() === 1 ? 'month' : date.getDay() === weekStart.value ? 'week' : 'day'
	const dimmed = isDimmed(date)
	return {
		key: date.toISOString(),
		x: index * props.dayWidthPixels,
		stroke: 'var(--grey-400)',
		width: kind === 'month' ? 1.5 : kind === 'week' ? 1 : 0.5,
		opacity: kind === 'day' ? (dimmed ? 0.25 : 0.5) : (dimmed ? 0.5 : 0.85),
	}
}))

// Neighbouring dimmed days become one rectangle.
const dimmedRanges = computed(() => {
	const ranges: {x: number, width: number}[] = []
	props.timelineData.forEach((date, index) => {
		if (!isDimmed(date)) {
			return
		}
		const last = ranges[ranges.length - 1]
		const x = index * props.dayWidthPixels
		if (last && last.x + last.width === x) {
			last.width += props.dayWidthPixels
		} else {
			ranges.push({x, width: props.dayWidthPixels})
		}
	})
	return ranges
})
</script>

<style scoped lang="scss">
.gantt-grid-lines {
	position: absolute;
	inset-inline-start: 0;
	z-index: 1;
	pointer-events: none;
}

.gantt-vertical-lines {
	position: absolute;
	inset: 0;
}
</style>
