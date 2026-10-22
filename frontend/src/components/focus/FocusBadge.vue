<template>
	<Teleport to="body">
		<div
			v-if="active && !onFocusPage"
			ref="windowEl"
			v-cy="'focusFloat'"
			class="focus-float"
			:class="{'is-dragging': dragging}"
			:style="positionStyle"
			role="region"
			:aria-label="$t('focus.title')"
			@pointerdown="onPointerDown"
			@pointermove="onPointerMove"
			@pointerup="onPointerUp"
			@pointercancel="onPointerUp"
		>
			<div class="focus-float-task">
				<ColorBubble
					v-if="color"
					:color="color"
				/>
				<span class="focus-float-title">
					{{ active.task_title || $t('focus.noTask') }}
				</span>
			</div>
			<RouterLink
				:to="{name: 'focus'}"
				class="focus-float-time"
				:title="$t('focus.openFocusPage')"
			>
				{{ display }}
			</RouterLink>
			<BaseButton
				v-tooltip="active.mode === 'pomo' ? $t('focus.abandon') : $t('focus.stopAndRecord')"
				class="focus-float-stop"
				:aria-label="active.mode === 'pomo' ? $t('focus.abandon') : $t('focus.stopAndRecord')"
				@click="stop"
			>
				<Icon icon="stop" />
			</BaseButton>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useRoute} from 'vue-router'
import {useIntervalFn} from '@vueuse/core'

import BaseButton from '@/components/base/BaseButton.vue'
import ColorBubble from '@/components/misc/ColorBubble.vue'
import {useFocusCompletion, useFocusTimer} from '@/composables/useFocusTimer'
import {useProjects} from '@/composables/useProjects'
import {formatClock, projectColorOf} from '@/helpers/focus'

// The timer as a small window that floats above every page and can be dragged. It is always mounted,
// so it is also the one place that notices a pomodoro running out.
const {active, elapsed, remaining, abandon, finish} = useFocusTimer()
useFocusCompletion()

const route = useRoute()
const projectList = useProjects()

// The focus page shows the same timer in full, so the window would only be in the way there.
const onFocusPage = computed(() => route.name === 'focus')

const color = computed(() => active.value?.project_id
	? projectColorOf(projectList.projects[active.value.project_id]?.hex_color)
	: undefined)

const display = computed(() => formatClock(active.value?.mode === 'pomo' ? remaining.value : elapsed.value))

function stop() {
	return active.value?.mode === 'pomo' ? abandon() : finish(false)
}

// A new key, so positions dragged while the default was somewhere else do not stick.
const POSITION_KEY = 'focusFloatPosition.v2'

interface Position {
	x: number
	y: number
}

const windowEl = ref<HTMLElement | null>(null)
const position = ref<Position | null>(null)
const dragging = ref(false)
let grabOffset: Position = {x: 0, y: 0}

function keepOnScreen({x, y}: Position): Position {
	const width = windowEl.value?.offsetWidth ?? 0
	const height = windowEl.value?.offsetHeight ?? 0
	return {
		x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - width)),
		y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - height)),
	}
}

onMounted(() => {
	try {
		const saved = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null')
		if (typeof saved?.x === 'number' && typeof saved?.y === 'number') {
			position.value = keepOnScreen(saved)
		}
	} catch {
		// Without a saved position the window stays at its default place.
	}
})

// Without a dragged position the window sits at the top, in the middle of the page content, which is
// the page without the sidebar. The sidebar can be shown, hidden and resized, so the middle is measured.
const contentCenter = ref<number | null>(null)

function measureContentCenter() {
	const content = document.querySelector('.app-content')
	if (!content) {
		contentCenter.value = null
		return
	}
	const rect = content.getBoundingClientRect()
	contentCenter.value = rect.left + rect.width / 2
}

useIntervalFn(measureContentCenter, 400, {immediateCallback: true})

const positionStyle = computed(() => {
	if (position.value) {
		return {
			insetInlineStart: `${position.value.x}px`,
			insetBlockStart: `${position.value.y}px`,
			transform: 'none',
		}
	}
	return contentCenter.value === null ? undefined : {insetInlineStart: `${contentCenter.value}px`}
})

function onPointerDown(event: PointerEvent) {
	if ((event.target as HTMLElement).closest('button, a') || !windowEl.value) {
		return
	}
	const rect = windowEl.value.getBoundingClientRect()
	grabOffset = {x: event.clientX - rect.left, y: event.clientY - rect.top}
	dragging.value = true
	windowEl.value.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
	if (!dragging.value) {
		return
	}
	position.value = keepOnScreen({x: event.clientX - grabOffset.x, y: event.clientY - grabOffset.y})
}

function onPointerUp(event: PointerEvent) {
	if (!dragging.value) {
		return
	}
	dragging.value = false
	windowEl.value?.releasePointerCapture(event.pointerId)
	try {
		localStorage.setItem(POSITION_KEY, JSON.stringify(position.value))
	} catch {
		// The position is a convenience, losing it is fine.
	}
}
</script>

<style lang="scss" scoped>
.focus-float {
	position: fixed;
	// In the top bar, whose middle is empty, so it never covers a page title.
	inset-block-start: .6rem;
	inset-inline-start: 50%;
	z-index: 90;
	display: flex;
	align-items: center;
	gap: .9rem;
	max-inline-size: calc(100vw - 1rem);
	padding: .6rem .6rem .6rem 1rem;
	background: var(--white);
	color: var(--text);
	border: 1px solid var(--grey-200);
	border-radius: 999px;
	box-shadow: 0 10px 30px rgba(0, 0, 0, .18);
	cursor: grab;
	touch-action: none;
	user-select: none;
	transform: translateX(-50%);
	transition: inset-inline-start .2s ease;

	&.is-dragging {
		transition: none;
		cursor: grabbing;
	}
}

.focus-float-task {
	display: flex;
	align-items: center;
	gap: .5rem;
	min-inline-size: 0;
}

.focus-float-title {
	max-inline-size: 14rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: .9rem;
}

.focus-float-time {
	color: var(--primary);
	font-size: 1.15rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.focus-float-stop {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 2rem;
	block-size: 2rem;
	border-radius: 50%;
	background: var(--grey-100);
	color: var(--grey-600);
	transition: color $transition, background $transition;

	&:hover {
		background: color-mix(in srgb, var(--danger) 15%, var(--white));
		color: var(--danger);
	}
}
</style>
