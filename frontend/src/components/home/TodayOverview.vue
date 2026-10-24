<template>
	<section
		v-cy="'todayOverview'"
		class="today-overview"
	>
		<header class="today-head">
			<h2><span class="print-label">HABITS</span> {{ $t('habits.title') }}</h2>
			<BaseButton
				class="today-edit"
				@click="editing = !editing"
			>
				{{ editing ? $t('habits.finishEditing') : $t('habits.edit') }}
			</BaseButton>
		</header>

		<template v-if="!editing">
			<p
				v-if="scheduled.length === 0"
				class="today-empty"
			>
				{{ $t('habits.nothingToday') }}
			</p>
			<ul class="habit-list">
				<HabitRow
					v-for="habit in scheduled"
					:key="habit.id"
					:habit="habit"
					:today="today"
					:done="isDone(logs, habit.id, today)"
					:count="weekCount(habit, logs, today)"
					:streak="streakWeeks(habit, logs, today)"
					:project-title="projectTitle(habit)"
					@toggle="toggle(habit.id, today)"
				/>
			</ul>

			<details
				v-if="others.length > 0"
				class="other-habits"
			>
				<summary class="today-sub">
					{{ $t('habits.otherHabits') }}
				</summary>
				<ul class="habit-list is-muted">
					<HabitRow
						v-for="habit in others"
						:key="habit.id"
						:habit="habit"
						:today="today"
						:done="isDone(logs, habit.id, today)"
						:count="weekCount(habit, logs, today)"
						:streak="streakWeeks(habit, logs, today)"
						:project-title="projectTitle(habit)"
						@toggle="toggle(habit.id, today)"
					/>
				</ul>
			</details>
		</template>

		<div
			v-else
			class="habit-editor"
		>
			<div
				v-for="(habit, index) in draft"
				:key="habit.id"
				class="habit-edit-row"
			>
				<input
					v-model="habit.name"
					class="input"
					type="text"
					:aria-label="$t('habits.name')"
				>
				<div class="habit-days">
					<button
						v-for="day in weekdayOrder"
						:key="day"
						type="button"
						class="habit-day"
						:class="{'is-on': habit.days.includes(day)}"
						@click="toggleDay(habit, day)"
					>
						{{ weekdayLabel(day) }}
					</button>
				</div>
				<label class="habit-field">
					{{ $t('habits.weeklyTarget') }}
					<input
						v-model.number="habit.weekly_target"
						class="input is-small"
						type="number"
						min="1"
						max="7"
					>
				</label>
				<label class="habit-field">
					{{ $t('habits.project') }}
					<select
						v-model="habit.project_id"
						class="input is-small"
					>
						<option :value="null">
							{{ $t('habits.noProject') }}
						</option>
						<option
							v-for="project in projectOptions"
							:key="project.id"
							:value="project.id"
						>
							{{ project.title }}
						</option>
					</select>
				</label>
				<BaseButton
					class="habit-remove"
					@click="draft.splice(index, 1)"
				>
					{{ $t('habits.remove') }}
				</BaseButton>
			</div>
			<div class="habit-editor-actions">
				<BaseButton
					class="habit-add"
					@click="addHabit"
				>
					{{ $t('habits.add') }}
				</BaseButton>
				<BaseButton
					class="habit-save"
					@click="saveDraft"
				>
					{{ $t('habits.save') }}
				</BaseButton>
			</div>
		</div>
	</section>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'

import BaseButton from '@/components/base/BaseButton.vue'
import HabitRow from '@/components/home/HabitRow.vue'
import {useHabits} from '@/composables/useHabits'
import {useProjects} from '@/composables/useProjects'
import {isDone, isScheduled, streakWeeks, weekCount, type Habit} from '@/helpers/habits'

const {t, locale} = useI18n()
const {habits, logs, toggle, saveHabits} = useHabits()
const projectList = useProjects()

// The overview is built once a day is open, so it moves on to the next day without a reload only when
// the page is visited again, which is fine for a daily list.
const today = new Date()

const scheduled = computed(() => habits.value.filter(habit => isScheduled(habit, today)))
const others = computed(() => habits.value.filter(habit => !isScheduled(habit, today)))

function projectTitle(habit: Habit) {
	return habit.project_id ? projectList.projects[habit.project_id]?.title : undefined
}

const projectOptions = computed(() => Object.values(projectList.projects)
	.filter(project => !project.is_archived)
	.sort((a, b) => a.title.localeCompare(b.title)))

// Editing works on a copy, so nothing is saved before the user presses save.
const editing = ref(false)
const draft = ref<Habit[]>([])

watch(editing, isEditing => {
	if (isEditing) {
		draft.value = habits.value.map(habit => ({...habit, days: [...habit.days], project_id: habit.project_id ?? null}))
	}
})

// Monday first, like the weekly schedule.
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]

function weekdayLabel(day: number) {
	// 2024-01-07 is a Sunday.
	return new Date(2024, 0, 7 + day).toLocaleDateString(locale.value, {weekday: 'narrow'})
}

function toggleDay(habit: Habit, day: number) {
	habit.days = habit.days.includes(day) ? habit.days.filter(d => d !== day) : [...habit.days, day]
}

function addHabit() {
	draft.value.push({
		id: `habit-${Date.now().toString(36)}`,
		name: t('habits.newName'),
		days: [1, 2, 3, 4, 5],
		weekly_target: 3,
		project_id: null,
	})
}

async function saveDraft() {
	const cleaned = draft.value
		.filter(habit => habit.name.trim() !== '')
		.map(habit => ({
			...habit,
			name: habit.name.trim(),
			weekly_target: Math.min(7, Math.max(1, Math.round(Number(habit.weekly_target) || 1))),
		}))
	await saveHabits(cleaned)
	editing.value = false
}
</script>

<style lang="scss" scoped>
.today-overview {
	padding: 1rem 1.25rem;
	background: var(--white);
	border: 0;
	border-radius: $radius;
	box-shadow: none;
}

.today-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-block-end: .5rem;

	h2 {
		margin: 0;
	}
}

.today-edit,
.habit-add,
.habit-save,
.habit-remove {
	padding: .3rem .85rem;
	border-radius: 2px;
	background: var(--grey-100);
	color: var(--text);
	font-size: .85rem;

	&:hover {
		background: var(--grey-200);
	}
}

.habit-save {
	background: var(--primary);
	color: var(--white);

	&:hover {
		background: color-mix(in srgb, var(--primary) 85%, black);
	}
}

.today-empty {
	color: var(--grey-500);
}

.today-sub {
	margin: 1rem 0 .4rem;
	font-size: .85rem;
	font-weight: 600;
	color: var(--grey-500);
}

.habit-list {
	display: flex;
	flex-direction: column;
	gap: .4rem;
	margin: 0;
	padding: 0;
	list-style: none;

	&.is-muted {
		opacity: .75;
	}
}

.habit-editor {
	display: flex;
	flex-direction: column;
	gap: .8rem;
}

.habit-edit-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: .6rem;
	padding-block-end: .8rem;
	border-block-end: 1px solid var(--grey-200);

	> .input {
		flex: 1 1 10rem;
		max-inline-size: 14rem;
	}
}

.habit-days {
	display: flex;
	gap: .25rem;
}

.habit-day {
	inline-size: 1.9rem;
	block-size: 1.9rem;
	border-radius: 2px;
	border: 1px solid var(--grey-300);
	background: var(--white);
	color: var(--text);
	font-size: .8rem;
	cursor: pointer;

	&.is-on {
		background: var(--primary);
		border-color: var(--primary);
		color: var(--white);
	}
}

.habit-field {
	display: flex;
	align-items: center;
	gap: .35rem;
	font-size: .85rem;
	color: var(--grey-600);

	.input {
		inline-size: auto;
	}
}

.habit-editor-actions {
	display: flex;
	gap: .6rem;
}
</style>
