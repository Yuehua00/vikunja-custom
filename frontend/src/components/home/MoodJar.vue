<template>
	<section
		v-cy="'moodJar'"
		class="mood-jar"
	>
		<header class="mood-jar-head">
			<h2 class="mood-jar-title">
				{{ $t('diary.jar.title') }}
			</h2>
			<span class="mood-jar-nav">
				<button
					type="button"
					class="mood-jar-step"
					:aria-label="$t('diary.jar.previousMonth')"
					@click="shiftMonth(-1)"
				>
					&lsaquo;
				</button>
				<span class="mood-jar-month">{{ monthTitle }} · {{ balls.length }}</span>
				<button
					type="button"
					class="mood-jar-step"
					:disabled="isCurrentMonth"
					:aria-label="$t('diary.jar.nextMonth')"
					@click="shiftMonth(1)"
				>
					&rsaquo;
				</button>
			</span>
		</header>

		<p class="mood-jar-question">
			{{ $t('diary.placeholder') }}
		</p>

		<!-- The month's diary days as balls dropped in a heap on a line, each in its mood's color. -->
		<svg
			class="mood-jar-pile"
			:viewBox="`0 ${FLOOR - pileHeight} ${WIDTH} ${pileHeight + 6}`"
			role="group"
			:aria-label="$t('diary.jar.summary', {month: monthTitle, count: balls.length})"
		>
			<circle
				v-for="ball in balls"
				:key="ball.date"
				class="mood-ball"
				:cx="ball.x"
				:cy="ball.y"
				:r="ball.r"
				:style="{fill: ball.mood ? MOOD_COLORS[ball.mood] : 'var(--grey-300)'}"
				role="link"
				tabindex="0"
				:aria-label="$t('diary.openDay', {date: ball.date})"
				@click="open(ball.date)"
				@keydown.enter="open(ball.date)"
			>
				<title>{{ $t('diary.openDay', {date: ball.date}) }}</title>
			</circle>
			<line
				class="mood-jar-ground"
				x1="4"
				:y1="FLOOR + 2"
				:x2="WIDTH - 4"
				:y2="FLOOR + 2"
			/>
		</svg>

		<RouterLink
			:to="{name: 'diary'}"
			class="mood-jar-write"
		>
			{{ $t('diary.jar.write') }} →
		</RouterLink>
	</section>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import dayjs from 'dayjs'

import {useDiary} from '@/client/queries/diary'
import {MOOD_COLORS, moodOf} from '@/helpers/diary'

// The balls are dropped one by one at a spot picked from the date, and roll down until they rest on the
// line or on balls already there, so the heap looks tossed in rather than stacked in rows.
const WIDTH = 300
const FLOOR = 200
const MIN_RADIUS = 15
const MAX_RADIUS = 18

function hash(text: string) {
	let h = 2166136261
	for (let i = 0; i < text.length; i++) {
		h = Math.imul(h ^ text.charCodeAt(i), 16777619)
	}
	return (h >>> 0) / 4294967295
}

type Placed = {x: number, y: number, r: number}

function drop(placed: Placed[], date: string): Placed {
	const r = MIN_RADIUS + hash(date + 'r') * (MAX_RADIUS - MIN_RADIUS)
	let best: Placed | null = null
	// Try a few spots around the chosen one and keep the lowest, like a ball settling into a gap.
	for (let attempt = 0; attempt < 12; attempt++) {
		const x = r + hash(`${date}#${attempt}`) * (WIDTH - 2 * r)
		let y = FLOOR - r
		for (const other of placed) {
			const dx = Math.abs(x - other.x)
			if (dx < r + other.r) {
				y = Math.min(y, other.y - Math.sqrt((r + other.r) ** 2 - dx ** 2))
			}
		}
		if (best === null || y > best.y) {
			best = {x, y, r}
		}
	}
	return best as Placed
}

const {locale} = useI18n({useScope: 'global'})
const router = useRouter()
const {entryByDate} = useDiary()

const month = ref(dayjs().startOf('month'))
const isCurrentMonth = computed(() => !month.value.isBefore(dayjs().startOf('month'), 'month'))

const monthTitle = computed(() => new Intl.DateTimeFormat(locale.value, {year: 'numeric', month: 'long'}).format(month.value.toDate()))

function shiftMonth(by: number) {
	const next = month.value.add(by, 'month')
	if (!next.isAfter(dayjs(), 'month')) month.value = next
}

const balls = computed(() => {
	const prefix = month.value.format('YYYY-MM')
	const placed: Placed[] = []
	return [...entryByDate.value.keys()]
		.filter(date => date.startsWith(prefix))
		.sort()
		.map(date => {
			const spot = drop(placed, date)
			placed.push(spot)
			return {date, mood: moodOf(entryByDate.value.get(date)?.labels), ...spot}
		})
})

// Tall enough for the heap, never shorter than a few rows, so the panel keeps its size through the month.
const pileHeight = computed(() => Math.max(110, ...balls.value.map(ball => FLOOR - ball.y + ball.r + 4)))

function open(date: string) {
	void router.push({name: 'diary', query: {date}})
}
</script>

<style lang="scss" scoped>
// Print style mood jar: no jar, just this month's balls in a heap on a line.
.mood-jar {
	padding: 1rem 1.25rem;
	background: var(--white);
	border-radius: $radius;
}

.mood-jar-head {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	gap: .5rem;
}

.mood-jar-title {
	margin: 0;
}

.mood-jar-nav {
	display: inline-flex;
	align-items: center;
	gap: .2rem;
	font-size: .8rem;
	color: var(--text-muted);
	white-space: nowrap;
}

.mood-jar-step {
	border: 0;
	background: transparent;
	color: var(--text-muted);
	font-size: 1rem;
	padding: 0 .3rem;
	cursor: pointer;

	&:hover:not(:disabled) {
		color: var(--print-orange-text);
	}

	&:disabled {
		opacity: .35;
		cursor: default;
	}
}

.mood-jar-question {
	margin: .9rem 0 .4rem;
	text-align: center;
	font-weight: 700;
	font-size: 1.05rem;
	color: var(--text-strong);
}

.mood-jar-pile {
	display: block;
	inline-size: 100%;
	max-inline-size: 240px;
	block-size: auto;
	margin-inline: auto;
}

.mood-ball {
	cursor: pointer;
	transition: transform $transition;
	transform-box: fill-box;
	transform-origin: center;

	&:hover,
	&:focus-visible {
		transform: scale(1.1);
	}
}

.mood-jar-ground {
	stroke: var(--primary);
	stroke-width: 4;
}

.mood-jar-write {
	display: block;
	margin-block-start: .9rem;
	padding-block-start: .75rem;
	border-block-start: 1px solid var(--grey-200);
	text-align: center;
	font-weight: 800;
	font-size: .88rem;
	color: var(--primary);

	&:hover {
		color: var(--print-orange-text);
	}
}
</style>
