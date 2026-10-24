<template>
	<section
		v-if="section === 'focus'"
		class="home-insight focus-insight"
	>
		<header>
			<h2><span class="print-label">FOCUS</span> 專注</h2><RouterLink :to="{name: 'focus'}">
				查看紀錄
			</RouterLink>
		</header>
		<div class="insight-number">
			{{ minutes }}<small> 分鐘</small>
		</div>
		<p class="insight-note">
			今天已完成 {{ stats.todayPomos }} 顆番茄
		</p>
		<RouterLink
			:to="{name: 'focus'}"
			class="insight-action"
		>
			{{ active ? '繼續專注' : '開始專注' }}
		</RouterLink>
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
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'
import {allTasksQuery} from '@/client/queries/tasks'
import {useFocusTimer} from '@/composables/useFocusTimer'
import {computeStats} from '@/helpers/focus'
import {isSetDate} from '@/components/calendar/calendarHelpers'

defineProps<{section: 'focus' | 'next'}>()
const route = useRoute()
const {records, active} = useFocusTimer()
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
	padding: 1.25rem;
	background: var(--print-paper);
	border-radius: 2px;

	header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: .5rem;
}
	h2 {
	margin: 0;
	font-size: .9rem;
	font-weight: 500;
}
	header a {
	font-size: .75rem;
	white-space: nowrap;
}
}
.insight-number {
	margin-block: .75rem .25rem;
	font-family: $display-font;
	font-size: 3.5rem;
	font-weight: 700;
	line-height: 1;
	color: var(--link);
}
.insight-number small {
	font-family: $family-sans-serif;
	font-size: .85rem;
	color: var(--text);
}
.insight-note {
	margin-block: .75rem;
	font-size: .8rem;
	color: var(--text-muted);
}
.insight-action {
	display: block;
	padding: .6rem;
	border: 2px solid var(--primary);
	text-align: center;
	font-size: .85rem;
	font-weight: 700;
}
.next-insight {
	background: var(--print-blue-soft);
}
.insight-upcoming {
	margin: .75rem 0 0;
	padding: 0;
	list-style: none;
}
.insight-upcoming li {
	display: grid;
	grid-template-columns: 3rem minmax(0, 1fr);
	gap: .75rem;
	margin-block: .6rem;
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
