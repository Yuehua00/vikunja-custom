<template>
	<div
		class="gantt-timeline"
		role="columnheader"
		:aria-label="$t('project.gantt.timelineHeader')"
	>
		<!-- Calendar weeks follow the user's first-day-of-week setting. -->
		<div
			class="gantt-timeline-months"
			role="row"
			aria-label="每週區間"
		>
			<div
				v-for="monthGroup in weekGroups"
				:key="monthGroup.key"
				class="timeunit-month"
				:class="{'is-current-week': monthGroup.current}"
				:style="{ width: `${monthGroup.width}px` }"
				role="columnheader"
				:aria-label="monthGroup.label"
			>
				{{ monthGroup.label }}
			</div>
		</div>
        
		<!-- Lower timeunit for days -->
		<div
			class="gantt-timeline-days"
			role="row"
			:aria-label="$t('project.gantt.daysRow')"
		>
			<div
				v-for="date in timelineData"
				:key="date.toISOString()"
				class="timeunit"
				:class="{
					'is-week-start': date.getDay() === weekStart,
					'is-month-start': date.getDate() === 1,
					'is-weekend': [0, 6].includes(date.getDay()),
					'is-other-month': hasCurrentMonth && monthKeyOf(date) !== currentMonthKey,
				}"
				:style="{ width: `${dayWidthPixels}px` }"
				role="columnheader"
				:aria-label="dateIsToday(date) 
					? $t('project.gantt.dayLabelToday', {
						date: date.toLocaleDateString(),
						weekday: weekDayFromDate(date)
					})
					: $t('project.gantt.dayLabel', {
						date: date.toLocaleDateString(),
						weekday: weekDayFromDate(date)
					})"
			>
				<div
					class="timeunit-wrapper"
					:class="{'today': dateIsToday(date)}"
				>
					<span>{{ date.getDate() }}</span>
					<span class="weekday">
						{{ weekDayFromDate(date) }}
					</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useGlobalNow} from '@/composables/useGlobalNow'
import {useWeekDayFromDate} from '@/helpers/time/formatDate'
import {useAuthStore} from '@/stores/auth'
import dayjs from 'dayjs'

const props = defineProps<{
    timelineData: Date[]
    dayWidthPixels: number
}>()

const weekDayFromDate = useWeekDayFromDate()
const { now: today } = useGlobalNow()
const authStore = useAuthStore()

const weekStart = computed(() => authStore.settings.week_start ?? 0)
const monthKeyOf = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`
const currentMonthKey = computed(() => monthKeyOf(today.value))
// Only the month of today is shown at full strength; without it on screen nothing is dimmed.
const hasCurrentMonth = computed(() => props.timelineData.some(date => monthKeyOf(date) === currentMonthKey.value))

const dateIsToday = computed(() => {
	const todayStr = today.value.toDateString()
	return (date: Date) => date.toDateString() === todayStr
})


const weekGroups = computed(() => {
	const groups: {key: string; label: string; width: number; current: boolean}[] = []
	const currentWeek = dayjs(today.value).subtract((today.value.getDay() - weekStart.value + 7) % 7, 'day').startOf('day')
	props.timelineData.forEach(date => {
		const start = dayjs(date).subtract((date.getDay() - weekStart.value + 7) % 7, 'day').startOf('day')
		const key = start.format('YYYY-MM-DD')
		const last = groups[groups.length - 1]
		if (last?.key === key) {
			last.width += props.dayWidthPixels
		} else {
			const current = start.isSame(currentWeek, 'day')
			groups.push({key, label: `${current ? '本週・' : ''}${start.format('M/D')} – ${start.add(6, 'day').format('M/D')}`, width: props.dayWidthPixels, current})
		}
	})
	return groups
})
</script>

<style scoped lang="scss">
.gantt-timeline {
	background: var(--white);
	border-block-end: 1px solid var(--grey-200);
	position: sticky;
	inset-block-start: 0;
	z-index: 10;
}

.gantt-timeline-months {
	display: flex;

	.timeunit-month {
		background: var(--white);
		font-family: $vikunja-font;
		font-weight: bold;
		border-inline-end: 1px solid var(--grey-300);
		padding: 0.5rem 0;
		text-align: center;
		font-size: 1.2rem;
		color: var(--grey-800);
		transition: opacity .2s ease;

		// Months other than the current one fade back.
		&.is-other-month {
			opacity: .6;
		}
	}
}

.gantt-timeline-days {
	display: flex;

	.timeunit {
		transition: opacity .2s ease;

		&.is-other-month {
			opacity: .6;
		}

		// The first day of a week gets a thin line and a semi-bold label, the first day of a month a bit more.
		&.is-week-start {
			box-shadow: inset 1px 0 0 var(--grey-400);
			font-weight: 600;
		}

		&.is-month-start {
			box-shadow: inset 1.5px 0 0 var(--grey-500);
		}

		.timeunit-wrapper {
			padding: 0.5rem 0;
			font-size: 1.15rem;
			display: flex;
			flex-direction: column;
			align-items: center;
			inline-size: 100%;
			font-family: $vikunja-font;

			&.today {
				background: var(--primary);
				color: var(--white);
				border-radius: 5px 5px 0 0;
				font-weight: bold;
			}

			.weekday {
				font-size: 0.9rem;
			}
		}
	}
}
</style>
