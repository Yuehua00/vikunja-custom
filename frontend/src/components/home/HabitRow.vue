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
			<Icon icon="check" /><span>{{ done ? '今天完成' : '完成' }}</span>
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

<style scoped lang="scss">
.habit-row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: .3rem .65rem;
	padding: .85rem 0;
	border-block-start: 1px solid var(--grey-200);
}
.habit-main {
	grid-column: 1;
	grid-row: 1;
	display: flex;
	flex-direction: column;
	gap: .1rem;
}
.habit-name {
	font-weight: 700;
	font-size: .9rem;
}
.habit-project, .habit-week, .habit-streak {
	font-size: .75rem;
	color: var(--text-muted);
}
.habit-week {
	grid-column: 1;
	grid-row: 2;
}
.habit-streak {
	grid-column: 1 / -1;
}
.habit-check {
	grid-column: 2;
	grid-row: 1 / 3;
	align-self: center;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: .35rem;
	min-block-size: 36px;
	padding: .35rem .75rem;
	border: 2px solid var(--primary);
	border-radius: 2px;
	background: transparent;
	color: var(--link);
	font-size: .8rem;
	font-weight: 700;
	white-space: nowrap;
	cursor: pointer;
}
.is-done .habit-check {
	background: var(--primary);
	color: #ffffff;
}
.habit-check:hover {
	background: var(--print-green-soft);
	color: var(--text-strong);
}
.habit-squares {
	grid-column: 1 / -1;
	display: flex;
	gap: 3px;
	margin-block-start: .2rem;
}
.habit-squares span {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 22px;
	block-size: 22px;
	background: var(--grey-100);
	color: var(--text-muted);
	font-size: .66rem;
	font-weight: 700;
}
.habit-squares .is-on {
	background: var(--primary);
	color: #ffffff;
}
.habit-squares .is-today {
	outline: 2px solid var(--print-orange);
	outline-offset: -2px;
}
</style>
