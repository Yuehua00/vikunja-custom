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
			<Icon
				v-if="done"
				icon="check"
			/>
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
import type {Habit} from '@/helpers/habits'

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
</script>

<style lang="scss" scoped>
.habit-row {
	display: flex;
	align-items: center;
	gap: .75rem;
	padding: .55rem .75rem;
	background: var(--grey-100);
	border-radius: $radius;

	&.is-done {
		background: color-mix(in srgb, var(--success) 14%, var(--white));
	}
}

.habit-check {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: none;
	inline-size: 1.5rem;
	block-size: 1.5rem;
	border: 2px solid var(--grey-400);
	border-radius: 50%;
	background: var(--white);
	color: var(--white);
	cursor: pointer;
	font-size: .75rem;

	.is-done & {
		background: var(--success);
		border-color: var(--success);
	}
}

.habit-main {
	display: flex;
	flex: 1;
	flex-wrap: wrap;
	align-items: baseline;
	gap: .2rem .75rem;
	min-inline-size: 0;
}

.habit-name {
	font-weight: 600;
}

.habit-project {
	font-size: .8rem;
}

.habit-week {
	color: var(--grey-600);
	font-size: .85rem;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.habit-streak {
	color: var(--primary);
	font-size: .8rem;
	white-space: nowrap;
}
</style>
