<template>
	<section
		v-cy="'moodJar'"
		class="mood-jar"
	>
		<header class="mood-jar-head">
			<h2><span class="print-label">MOOD JAR</span> 心情罐</h2>
			<span class="mood-jar-summary">{{ month.month() + 1 }} 月・{{ balls.length }} 顆</span>
		</header>
		<p class="mood-jar-prompt">
			今天過得怎麼樣？
		</p>
		<svg
			class="mood-jar-glass"
			viewBox="0 0 220 160"
			role="group"
			:aria-label="`這個月有 ${balls.length} 篇日記`"
		>
			<path
				d="M16 151 H204"
				class="mood-jar-floor"
			/>
			<g
				v-for="ball in balls"
				:key="ball.date"
				class="mood-ball"
				role="link"
				tabindex="0"
				:aria-label="$t('diary.openDay', {date: ball.date})"
				@click="open(ball.date)"
				@keydown.enter="open(ball.date)"
				@keydown.space.prevent="open(ball.date)"
			>
				<title>{{ ball.date }} · {{ ball.mood ? $t(`diary.moods.${ball.mood}`) : '未設定心情' }}</title>
				<circle
					:cx="ball.x"
					:cy="ball.y"
					r="13"
					:fill="ball.mood ? MOOD_COLORS[ball.mood] : 'var(--grey-300)'"
				/>
			</g>
		</svg>
		<p
			v-if="balls.length === 0"
			class="mood-jar-empty"
		>
			寫下今天，放進第一顆心情。
		</p>
		<div class="mood-jar-nav">
			<button
				type="button"
				:aria-label="$t('diary.jar.previousMonth')"
				@click="shiftMonth(-1)"
			>
				‹
			</button>
			<span>{{ monthTitle }}</span>
			<button
				type="button"
				:disabled="isCurrentMonth"
				:aria-label="$t('diary.jar.nextMonth')"
				@click="shiftMonth(1)"
			>
				›
			</button>
		</div>
		<RouterLink
			:to="{name: 'diary'}"
			class="mood-jar-write"
		>
			寫今天的日記 →
		</RouterLink>
	</section>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useRouter} from 'vue-router'
import dayjs from 'dayjs'
import {useDiary} from '@/client/queries/diary'
import {MOOD_COLORS, moodOf} from '@/helpers/diary'

const router = useRouter()
const {entryByDate} = useDiary()
const month = ref(dayjs().startOf('month'))
const isCurrentMonth = computed(() => !month.value.isBefore(dayjs().startOf('month'), 'month'))
const monthTitle = computed(() => month.value.format('YYYY · MM'))
function shiftMonth(by: number) {
	const next = month.value.add(by, 'month')
	if (!next.isAfter(dayjs(), 'month')) month.value = next
}
// The six-column staggered pile fits all 31 days. Positions depend only on the entry order.
function position(index: number) {
	let row = 0
	while (index >= (row % 2 === 0 ? 6 : 5)) {
		index -= row % 2 === 0 ? 6 : 5
		row++
	}
	return {x: 43 + index * 26 + (row % 2 ? 13 : 0), y: 136 - row * 22.6}
}
const balls = computed(() => [...entryByDate.value.keys()]
	.filter(date => date.startsWith(month.value.format('YYYY-MM')))
	.sort()
	.map((date, index) => ({date, mood: moodOf(entryByDate.value.get(date)?.labels ?? undefined), ...position(index)})))
function open(date: string) {
	void router.push({name: 'diary', query: {date}})
}
</script>

<style scoped lang="scss">
.mood-jar {
	padding: 1rem 1.25rem 1.1rem;
	background: var(--print-paper);
	border-radius: 2px;
}
.mood-jar-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: .5rem;
}
.mood-jar-head h2 {
	margin: 0;
	white-space: nowrap;
}
.mood-jar-summary {
	font-size: .75rem;
	color: var(--text-muted);
	white-space: nowrap;
}
.mood-jar-prompt {
	margin: .9rem 0 0;
	text-align: center;
	font-size: 1.05rem;
	font-weight: 700;
}
.mood-jar-glass {
	display: block;
	inline-size: 100%;
	max-inline-size: 220px;
	margin: .6rem auto 0;
	overflow: visible;
}
.mood-jar-floor {
	stroke: var(--primary);
	stroke-width: 4;
}
.mood-ball {
	cursor: pointer;
	outline: none;
}
.mood-ball:hover circle, .mood-ball:focus-visible circle {
	stroke: var(--text-strong);
	stroke-width: 2;
}
.mood-jar-empty {
	text-align: center;
	font-size: .75rem;
	color: var(--text-muted);
}
.mood-jar-nav {
	display: flex;
	justify-content: center;
	align-items: center;
	gap: .75rem;
	font-family: $display-font;
	font-size: .8rem;
	color: var(--text-muted);
}
.mood-jar-nav button {
	border: 0;
	background: transparent;
	color: var(--link);
	cursor: pointer;
	padding: .2rem .5rem;
}
.mood-jar-nav button:disabled {
	opacity: .3;
	cursor: default;
}
.mood-jar-write {
	display: block;
	margin-block-start: .6rem;
	padding-block-start: .75rem;
	border-block-start: 1px solid var(--grey-200);
	text-align: center;
	font-size: .85rem;
	font-weight: 700;
}
</style>
