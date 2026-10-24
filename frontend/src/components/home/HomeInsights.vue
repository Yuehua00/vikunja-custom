<template>
	<section
		v-if="section === 'focus'"
		class="home-insight focus-insight"
	>
		<header>
			<h2><span class="print-label">FOCUS</span> 專注</h2>
			<label class="focus-goal-label">目標 <input
				v-model.number="goalMinutes"
				type="number"
				min="1"
				max="1440"
				aria-label="每日專注目標分鐘"
			> 分</label>
		</header>
		<div class="insight-number">
			{{ minutes }}<sup>′</sup><small>/ {{ goal }}′</small>
		</div>
		<div
			class="focus-goal-track"
			role="progressbar"
			:aria-valuenow="Math.min(minutes, goal)"
			:aria-valuemax="goal"
			:aria-valuemin="0"
			aria-label="今日專注進度"
		>
			<span :style="{width: `${Math.min(100, minutes / goal * 100)}%`}" />
		</div>
		<RouterLink
			v-if="active"
			:to="{name: 'focus'}"
			class="insight-action"
		>
			繼續專注
		</RouterLink>
		<button
			v-else
			type="button"
			class="insight-action"
			:disabled="starting"
			@click="startFocus"
		>
			{{ starting ? '啟動中…' : '開始 25 分鐘' }}
		</button>
		<p
			v-if="startError"
			class="insight-note"
			role="alert"
		>
			無法啟動計時，請再試一次。
		</p>
	</section>
	<section
		v-else
		class="home-insight next-insight"
	>
		<header>
			<h2><span class="print-label">NEXT</span> 即將開始</h2><RouterLink :to="{name: 'tasks.range'}">
				全部
			</RouterLink>
		</header>
		<p
			v-if="isPending"
			class="insight-note"
		>
			載入中…
		</p>
		<p
			v-else-if="isError"
			class="insight-note"
		>
			暫時無法載入任務
		</p>
		<p
			v-else-if="upcoming.length === 0"
			class="insight-note"
		>
			接下來七天沒有排定任務
		</p>
		<ul
			v-else
			class="insight-upcoming"
		>
			<li
				v-for="item in upcoming"
				:key="item.task.id"
			>
				<time :datetime="item.date.toISOString()">{{ item.date.toLocaleDateString('en-US', {weekday: 'short'}).toUpperCase() }}</time>
				<RouterLink :to="{name: 'task.detail', params: {id: item.task.id}, state: {backdropView: route.fullPath}}">
					{{ item.task.title }}
				</RouterLink>
			</li>
		</ul>
	</section>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useStorage} from '@vueuse/core'
import {useRoute} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'
import {allTasksQuery} from '@/client/queries/tasks'
import {useFocusTimer} from '@/composables/useFocusTimer'
import {computeStats} from '@/helpers/focus'
import {isSetDate} from '@/components/calendar/calendarHelpers'

defineProps<{section: 'focus' | 'next'}>()
const route = useRoute()
const {records, active, start} = useFocusTimer()
const goalMinutes = useStorage('focusDailyGoalMinutes', 120)
const goal = computed(() => Math.max(1, Math.min(1440, Number(goalMinutes.value) || 120)))
const starting = ref(false)
const startError = ref(false)
async function startFocus() {
	starting.value = true
	startError.value = false
	try {
		await start({taskId: null, taskTitle: '自由專注', mode: 'pomo', minutes: 25})
	} catch {
		startError.value = true
	} finally {
		starting.value = false
	}
}
const stats = computed(() => computeStats(records.value, new Date()))
const minutes = computed(() => Math.round(stats.value.todaySeconds / 60))
const {data, isPending, isError} = useQuery(allTasksQuery({project: null, params: {filter: 'done = false'}}))
const upcoming = computed(() => {
	const now = new Date()
	const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
	const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8)
	return (data.value ?? []).filter(task => !task.done).flatMap(task => {
		const dates = [task.start_date, task.due_date].filter(isSetDate).map(date => new Date(date!)).filter(date => date >= tomorrow && date < limit)
		if (!dates.length) return []
		return [{task, date: new Date(Math.min(...dates.map(date => date.getTime())))}]
	}).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 4)
})
</script>

<style scoped lang="scss">
.home-insight {
	padding: 1rem 1.25rem;
	background: var(--print-paper);
	border-radius: 2px;
}
.home-insight header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: .5rem;
}
.home-insight h2 {
	margin: 0;
	white-space: nowrap;
}
.home-insight header a {
	font-size: .8rem;
	font-weight: 700;
}
.focus-goal-label {
	font-size: .75rem;
	color: var(--text-muted);
	white-space: nowrap;
}
.focus-goal-label input {
	inline-size: 2.2rem;
	padding: 0;
	border: 0;
	border-block-end: 1px solid transparent;
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: center;
	appearance: textfield;
}
.focus-goal-label input:focus {
	border-block-end-color: var(--primary);
}
.focus-goal-label input::-webkit-inner-spin-button, .focus-goal-label input::-webkit-outer-spin-button {
	appearance: none;
	margin: 0;
}
.insight-number {
	margin-block: .4rem .6rem;
	font-family: $display-font;
	font-size: 3.2rem;
	font-weight: 700;
	line-height: 1;
	color: var(--link);
}
.insight-number sup {
	font-size: .45em;
	vertical-align: .9em;
}
.insight-number small {
	font-family: $display-font;
	font-size: 1.3rem;
	font-weight: 700;
	color: var(--text-muted);
}
.focus-goal-track {
	block-size: 5px;
	background: var(--print-green-soft);
	margin-block-end: 1rem;
}
.focus-goal-track span {
	display: block;
	position: relative;
	block-size: 100%;
	background: var(--success);
}
.focus-goal-track span::after {
	content: '';
	position: absolute;
	inset-inline-end: -4px;
	inset-block-start: -3px;
	inline-size: 8px;
	block-size: 12px;
	background: var(--print-orange);
}
.insight-action {
	display: block;
	inline-size: 100%;
	padding: .5rem;
	border: 1.5px solid var(--primary);
	border-radius: 2px;
	background: transparent;
	color: var(--link);
	text-align: center;
	font: inherit;
	font-size: .85rem;
	font-weight: 700;
	cursor: pointer;
}
.insight-action:hover {
	background: var(--print-green-soft);
}
.insight-note {
	margin-block: .75rem 0;
	font-size: .8rem;
	color: var(--text-muted);
}
.next-insight {
	background: var(--print-blue-soft);
}
.insight-upcoming {
	margin: .5rem 0 0;
	padding: 0;
	list-style: none;
}
.insight-upcoming li {
	display: grid;
	grid-template-columns: 3.2rem minmax(0, 1fr);
	gap: .45rem .75rem;
	margin-block: .45rem;
	font-size: .85rem;
}
.insight-upcoming time {
	font-family: $display-font;
	font-weight: 700;
	color: var(--print-blue);
}
.insight-upcoming a {
	overflow-wrap: anywhere;
	color: var(--text);
}
</style>
