<template>
	<li
		class="habit-row"
		:class="{'is-done': done}"
	>
		<button
			type="button"
			class="habit-check"
			:aria-pressed="done"
			:aria-label="habit.name"
			@click="emit('toggle')"
		>
			<span>{{ done ? '今天完成' : '完成' }}</span>
		</button>
		<div class="habit-main">
			<span class="habit-name">{{ habit.name }}</span>
			<RouterLink
				v-if="habit.project_id"
				:to="{name: 'project.index', params: {projectId: habit.project_id}}"
				class="habit-project"
			>
				{{ projectTitle ?? $t('habits.openProject') }}
			</RouterLink>
		</div>
		<div
			class="habit-squares"
			aria-label="本週習慣紀錄"
		>
			<span
				v-for="(day, index) in weekDates(today)"
				:key="index"
				:class="{'is-on': logs[dateKey(day)]?.includes(habit.id), 'is-today': day.toDateString() === today.toDateString()}"
			>{{ ['一', '二', '三', '四', '五', '六', '日'][index] }}</span>
		</div>
		<span class="habit-week">
			{{ $t('habits.thisWeek', {done: count, target: habit.weekly_target}) }}
		</span>
		<span
			v-if="streak > 0"
			class="habit-streak"
		>
			{{ $t('habits.streak', {n: streak}) }}
		</span>
	</li>
</template>

<script setup lang="ts">
import {type Habit, weekDates, dateKey} from '@/helpers/habits'
import {useHabits} from '@/composables/useHabits'

defineProps<{
	habit: Habit
	today: Date
	done: boolean
	count: number
	streak: number
	projectTitle?: string
}>()

const emit = defineEmits<{
	toggle: []
}>()

const {logs} = useHabits()

</script>

<style lang="scss" scoped>

.habit-row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: .4rem .75rem;
	padding: 1rem 0;
	border-block-start: 1px solid var(--grey-200);
	background: transparent;
	&.is-done {
	background: transparent;
}
}
.habit-main {
	grid-column: 1;
	grid-row: 1;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
}
.habit-check {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	grid-column: 2; grid-row: 1 / 4;
	inline-size: auto; block-size: auto; min-block-size: 2.25rem;
	padding: .35rem .65rem; border: 2px solid var(--primary); border-radius: 2px;
	color: var(--link); background: transparent; font-size: .8rem; font-weight: 700;
	.is-done & {
	background: var(--primary);
	border-color: var(--primary);
	color: #ffffff;
}
}
.habit-week {
	grid-column: 1;
	grid-row: 2;
	font-size: .75rem;
	white-space: normal;
}
.habit-streak {
	grid-column: 1;
	font-size: .75rem;
}
.habit-squares {
	grid-column: 1;
	display: flex;
	gap: 3px;
}
.habit-squares span {
	display: inline-flex; align-items: center; justify-content: center;
	inline-size: 1.3rem; block-size: 1.3rem; background: var(--grey-100); color: var(--text-muted); font-size: .65rem;
	&.is-on {
	background: var(--primary);
	color: #ffffff;
}
	&.is-today {
	outline: 2px solid var(--print-orange);
	outline-offset: -2px;
}
}
.habit-name {
	font-weight: 700;
}
.habit-project {
	font-size: .75rem;
}

</style>
