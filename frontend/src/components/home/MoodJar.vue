<template>
	<section
		v-cy="'moodJar'"
		class="mood-jar"
	>
		<div class="mood-jar-info">
			<h2 class="mood-jar-title">
				<span class="print-label">MOOD JAR</span> {{ $t('diary.jar.title') }}
			</h2>

			<div class="mood-jar-count">
				<span class="mood-jar-number">{{ balls.length }}</span>
				<span class="mood-jar-unit">{{ $t('diary.jar.unit') }}</span>
			</div>
			<p class="mood-jar-summary">
				{{ $t('diary.jar.summary', {month: monthTitle, count: balls.length}) }}
			</p>

			<ul class="mood-jar-legend">
				<li
					v-for="mood in MOODS"
					:key="mood"
					:style="{'--mood-color': MOOD_COLORS[mood]}"
				>
					<span class="mood-jar-legend-dot" />
					{{ $t(`diary.moods.${mood}`) }}
					<strong>{{ moodCounts[mood] }}</strong>
				</li>
			</ul>

			<div class="mood-jar-nav">
				<XButton
					variant="tertiary"
					:aria-label="$t('diary.jar.previousMonth')"
					@click="shiftMonth(-1)"
				>
					&lsaquo;
				</XButton>
				<span class="mood-jar-month">{{ monthTitle }}</span>
				<XButton
					variant="tertiary"
					:disabled="isCurrentMonth"
					:aria-label="$t('diary.jar.nextMonth')"
					@click="shiftMonth(1)"
				>
					&rsaquo;
				</XButton>
			</div>

			<RouterLink
				v-if="isCurrentMonth"
				:to="{name: 'diary'}"
				class="mood-jar-write"
			>
				{{ $t('diary.jar.write') }}
			</RouterLink>
		</div>

		<svg
			class="mood-jar-glass"
			viewBox="0 90 320 250"
			role="group"
			:aria-label="$t('diary.jar.title')"
		>
			<path
				class="mood-jar-body"
				d="M12 326 H308"
			/>

			<g
				v-for="ball in balls"
				:key="ball.date"
				:transform="`translate(${ball.x} ${ball.y})`"
			>
				<g
					class="mood-ball"
					:style="{animationDelay: `${ball.index * 30}ms`}"
					role="link"
					tabindex="0"
					:aria-label="$t('diary.openDay', {date: ball.date})"
					@click="open(ball.date)"
					@keydown.enter="open(ball.date)"
				>
					<title>{{ $t('diary.openDay', {date: ball.date}) }}</title>
					<circle
						:r="RADIUS"
						:style="{fill: ball.mood ? MOOD_COLORS[ball.mood] : 'var(--grey-300)'}"
						class="mood-ball-body"
					/>
					<ellipse
						cx="-8"
						cy="-12"
						rx="7"
						ry="3.6"
						transform="rotate(-30 -8 -12)"
						class="mood-ball-shine"
					/>

					<g
						class="mood-face"
						fill="none"
						stroke-linecap="round"
					>
						<template v-if="ball.mood === 'good'">
							<circle
								cx="-7"
								cy="-2"
								r="2.3"
								class="mood-eye"
							/>
							<circle
								cx="7"
								cy="-2"
								r="2.3"
								class="mood-eye"
							/>
							<path
								d="M-6 6 Q0 12 6 6"
								class="mood-mouth"
							/>
							<ellipse
								cx="-13"
								cy="5"
								rx="3.4"
								ry="2.2"
								class="mood-cheek"
							/>
							<ellipse
								cx="13"
								cy="5"
								rx="3.4"
								ry="2.2"
								class="mood-cheek"
							/>
						</template>
						<template v-else-if="ball.mood === 'ok'">
							<circle
								cx="-7"
								cy="-2"
								r="2.3"
								class="mood-eye"
							/>
							<circle
								cx="7"
								cy="-2"
								r="2.3"
								class="mood-eye"
							/>
							<path
								d="M-5 8 L5 8"
								class="mood-mouth"
							/>
							<ellipse
								cx="-13"
								cy="5"
								rx="3.4"
								ry="2.2"
								class="mood-cheek"
							/>
							<ellipse
								cx="13"
								cy="5"
								rx="3.4"
								ry="2.2"
								class="mood-cheek"
							/>
						</template>
						<template v-else-if="ball.mood === 'low'">
							<path
								d="M-10 -4 L-4 -2"
								class="mood-mouth"
							/>
							<path
								d="M10 -4 L4 -2"
								class="mood-mouth"
							/>
							<path
								d="M-6 10 Q0 4 6 10"
								class="mood-mouth"
							/>
							<path
								d="M-12 2 Q-14 6 -12 7 Q-10 6 -12 2 Z"
								class="mood-tear"
							/>
						</template>
						<template v-else>
							<path
								d="M-10 -2 Q-7 1 -4 -2"
								class="mood-mouth"
							/>
							<path
								d="M4 -2 Q7 1 10 -2"
								class="mood-mouth"
							/>
							<path
								d="M-3 7 L3 7"
								class="mood-mouth"
							/>
						</template>
					</g>
				</g>
			</g>

			<rect
				class="mood-jar-lid"
				x="36"
				y="14"
				width="248"
				height="30"
				rx="9"
			/>
			<path
				class="mood-jar-reflection"
				d="M28 110 L28 270"
			/>
		</svg>
	</section>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import dayjs from 'dayjs'

import XButton from '@/components/input/Button.vue'

import {useDiary} from '@/client/queries/diary'
import {MOODS, MOOD_COLORS, moodOf, type Mood} from '@/helpers/diary'

// The balls are drawn on a fixed grid, rows from the bottom of the jar up, every second row shifted by a radius.
const RADIUS = 22
const FIRST_ROW_SIZE = 6
const FLOOR = 316
const LEFT = 28
const ROW_HEIGHT = RADIUS * Math.sqrt(3)

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

function position(index: number) {
	let row = 0
	let rest = index
	while (rest >= (row % 2 === 0 ? FIRST_ROW_SIZE : FIRST_ROW_SIZE - 1)) {
		rest -= row % 2 === 0 ? FIRST_ROW_SIZE : FIRST_ROW_SIZE - 1
		row++
	}
	return {
		x: LEFT + RADIUS + rest * 2 * RADIUS + (row % 2 === 1 ? RADIUS : 0),
		y: FLOOR - RADIUS - row * ROW_HEIGHT,
	}
}

const balls = computed(() => {
	const prefix = month.value.format('YYYY-MM')
	return [...entryByDate.value.keys()]
		.filter(date => date.startsWith(prefix))
		.sort()
		.map((date, index) => ({
			date,
			index,
			mood: moodOf(entryByDate.value.get(date)?.labels),
			...position(index),
		}))
})

const moodCounts = computed(() => {
	const counts: Record<Mood, number> = {good: 0, ok: 0, low: 0}
	for (const ball of balls.value) {
		if (ball.mood) counts[ball.mood]++
	}
	return counts
})

function open(date: string) {
	void router.push({name: 'diary', query: {date}})
}
</script>

<style lang="scss" scoped>
.mood-jar-lid, .mood-jar-reflection {
	display: none;
}
.mood-jar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: .75rem;
	padding: 1.25rem;
	background: var(--white);
	border: 1px solid var(--grey-200);
	border-radius: 2px;
}

.mood-jar-info {
	flex: 1 1 100%;
	display: flex;
	flex-direction: column;
	gap: .6rem;
}

.mood-jar-title {
	font-size: 1rem;
	color: var(--grey-500);
}

.mood-jar-count {
	display: none;
	align-items: baseline;
	gap: .6rem;
}

.mood-jar-number {
	font-size: 4.5rem;
	font-weight: 700;
	line-height: 1;
	font-variant-numeric: tabular-nums;
}

.mood-jar-unit {
	font-size: 1rem;
	color: var(--grey-600);
}

.mood-jar-summary {
	color: var(--grey-600);
}

.mood-jar-legend {
	display: flex;
	flex-wrap: wrap;
	gap: .4rem 1rem;
	margin: 0;
	padding: 0;
	list-style: none;
	font-size: .75rem;
}

.mood-jar-legend li {
	display: inline-flex;
	align-items: center;
	gap: .35rem;
}

.mood-jar-legend-dot {
	inline-size: .75rem;
	block-size: .75rem;
	background: var(--mood-color);
	border-radius: 50%;
}

.mood-jar-nav {
	display: flex;
	align-items: center;
	gap: .5rem;
}

.mood-jar-month {
	min-inline-size: 7rem;
	text-align: center;
	font-weight: 600;
}

.mood-jar-write {
	align-self: flex-start;
	color: var(--primary);
	font-weight: 600;
}

.mood-jar-glass {
	margin-inline: auto;
	flex: 0 1 100%;
	inline-size: 100%;
	max-inline-size: 14rem;
	block-size: auto;
	overflow: visible;
}

.mood-jar-body {
	fill: none;
	stroke: var(--primary);
	stroke-width: 6;
}

.mood-jar-lid {
	fill: var(--grey-300);
	stroke: var(--grey-400);
	stroke-width: 3;
}

.mood-jar-reflection {
	fill: none;
	stroke: #ffffff;
	stroke-opacity: .55;
	stroke-width: 5;
	stroke-linecap: round;
}

.mood-ball {
	cursor: pointer;
	outline: none;
	animation: mood-drop .6s cubic-bezier(.3, 1.4, .5, 1) backwards;
	transition: transform .2s ease;

	&:hover,
	&:focus-visible {
		transform: translateY(-4px) scale(1.08);
	}

	&:focus-visible .mood-ball-body {
		stroke: var(--text);
		stroke-width: 2;
	}
}

@keyframes mood-drop {
	from {
		transform: translateY(-240px);
		opacity: 0;
	}

	to {
		transform: translateY(0);
		opacity: 1;
	}
}

@media (prefers-reduced-motion: reduce) {
	.mood-ball {
		animation: none;
	}
}

.mood-ball-body {
	stroke: rgba(0, 0, 0, .14);
	stroke-width: 1;
}

.mood-ball-shine {
	fill: #ffffff;
	fill-opacity: .4;
}

.mood-eye {
	fill: #26332e;
	fill-opacity: .85;
	stroke: none;
}

.mood-mouth {
	stroke: #26332e;
	stroke-opacity: .85;
	stroke-width: 2;
}

.mood-cheek {
	fill: #f08fa0;
	fill-opacity: .5;
	stroke: none;
}

.mood-tear {
	fill: #cfe8ff;
	stroke: none;
}
</style>
