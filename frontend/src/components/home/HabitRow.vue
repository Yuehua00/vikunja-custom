<template>
	<li
		class="habit-row"
		:class="{'is-done': done}"
	>
		<div class="habit-main">
			<span class="habit-name">{{ habit.name }}</span>
			<span class="habit-meta">
				<span class="habit-week">{{ $t('habits.thisWeek', {done: count, target: habit.weekly_target}) }}</span>
				<span
					v-if="streak > 0"
					class="habit-streak"
				>{{ $t('habits.streak', {n: streak}) }}</span>
				<RouterLink
					v-if="habit.project_id"
					:to="{name: 'project.index', params: {projectId: habit.project_id}}"
					class="habit-project"
				>
					{{ projectTitle ?? $t('habits.openProject') }}
				</RouterLink>
			</span>
		</div>
		<button
			type="button"
			class="habit-check"
			:aria-pressed="done"
			:aria-label="habit.name"
			@click="emit('toggle')"
		>
			<Icon icon="check" />
			{{ $t('focus.endedDone') }}
		</button>
		<span
			v-if="week"
			class="habit-days"
			aria-hidden="true"
		>
			<span
				v-for="(day, index) in week"
				:key="index"
				class="habit-day"
				:class="{'is-on': day.done, 'is-today': day.isToday, 'is-future': day.isFuture}"
			>{{ day.label }}</span>
		</span>
	</li>
</template>

<script setup lang="ts">
import type {Habit} from '@/helpers/habits'

defineProps<{
	habit: Habit
	today: Date
	done: boolean
	count: number
	streak: number
	projectTitle?: string
	week?: {label: string, done: boolean, isToday: boolean, isFuture: boolean}[]
}>()

const emit = defineEmits<{
	toggle: []
}>()
</script>

<style lang="scss" scoped>
// Print style habit row: name and this week's count, a "done" button, and one small square per day.
.habit-row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: .5rem .75rem;
	padding: .8rem 0;
	border-block-start: 1px solid var(--grey-200);

	&:first-child {
		border-block-start: 0;
	}
}

.habit-main {
	display: flex;
	flex-direction: column;
	gap: .15rem;
	min-inline-size: 0;
}

.habit-name {
	font-weight: 700;
	color: var(--text-strong);
}

.habit-meta {
	display: flex;
	flex-wrap: wrap;
	gap: .1rem .6rem;
	font-size: .8rem;
	color: var(--text-muted);
}

.habit-week {
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.habit-streak {
	color: var(--primary);
	white-space: nowrap;
}

.habit-check {
	display: inline-flex;
	align-items: center;
	gap: .35rem;
	min-block-size: 34px;
	padding: 0 .8rem;
	border: 2px solid var(--primary);
	border-radius: $radius;
	background: var(--white);
	color: var(--primary);
	font: inherit;
	font-size: .82rem;
	font-weight: 800;
	cursor: pointer;

	&:hover {
		background: var(--print-orange-tint);
	}

	.is-done & {
		background: var(--primary);
		color: #ffffff;
	}
}

.habit-days {
	grid-column: 1 / -1;
	display: flex;
	gap: 3px;
}

.habit-day {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 20px;
	block-size: 20px;
	border-radius: $radius;
	background: var(--grey-100);
	color: var(--text-muted);
	font-size: .65rem;
	font-weight: 700;

	&.is-on {
		background: var(--primary);
		color: #ffffff;
	}

	&.is-today:not(.is-on) {
		box-shadow: inset 0 0 0 2px var(--print-orange);
		color: var(--print-orange-text);
	}

	&.is-future {
		opacity: .5;
	}
}
</style>
