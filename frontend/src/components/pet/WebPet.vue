<template>
	<Teleport to="body">
		<div class="web-pet-layer d-print-none">
			<button
				v-if="hidden"
				class="pet-return"
				aria-label="叫熊貓出來"
				@click="restore"
			>
				熊貓
			</button>
			<template v-else>
				<button
					ref="petButton"
					class="web-pet"
					:class="{'is-held': held, 'is-moving': moving, 'is-idle': !moving && !held && !sleeping && pose === 'idle'}"
					:style="{left: `${position.x}px`, top: `${position.y}px`, width: `${size}px`, height: `${size}px`}"
					aria-label="熊貓，點一下互動，或拖曳到卡片上"
					:aria-expanded="panel"
					@pointerdown="pickup"
					@pointermove="drag"
					@pointerup="release"
					@pointercancel="cancelDrag"
					@lostpointercapture="cancelDrag"
					@click="openPanel"
				>
					<span
						class="pet-art"
						:style="{transform: `scale(${facing * motionScale.x}, ${motionScale.y})`}"
					>
						<svg
							v-if="motionPhase === 'walk' && !held"
							:viewBox="walkViewBox.join(' ')"
							preserveAspectRatio="xMidYMax meet"
							aria-hidden="true"
						>
							<defs>
								<clipPath id="panda-walk-frame">
									<rect
										:x="walkViewBox[0]"
										:y="walkViewBox[1]"
										width="512"
										height="330"
									/>
								</clipPath>
							</defs>
							<image
								:href="`${BASE_URL}pet/panda/walk-cycle.png`"
								width="1536"
								height="1024"
								clip-path="url(#panda-walk-frame)"
							/>
						</svg>
						<img
							v-else
							:src="`${BASE_URL}pet/panda/${motionImage}.png`"
							alt=""
							draggable="false"
						>
					</span>
					<span
						v-if="bubble"
						class="pet-bubble"
					>{{ bubble }}</span>
				</button>
				<section
					v-if="panel"
					ref="panelElement"
					class="pet-panel"
					:style="panelStyle"
					aria-label="熊貓互動"
				>
					<header>
						<strong>你的熊貓</strong><button
							aria-label="關閉熊貓面板"
							@click="panel = false"
						>
							×
						</button>
					</header>
					<p>{{ status }}</p>
					<div class="pet-choices">
						<button @click="react('eat', '謝謝你的竹子！')">
							餵竹子
						</button>
						<button @click="react('wave', '再摸一下嘛。')">
							摸摸
						</button>
						<button @click="rest">
							{{ sleeping ? '起床' : '休息' }}
						</button>
						<button @click="explore">
							去探險
						</button>
						<button @click="hide">
							收起熊貓
						</button>
					</div>
					<small>可以抱起她，放到標題或卡片上。</small>
				</section>
			</template>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {useAuthStore} from '@/stores/auth'
import {clampPet, safeLanding, sampleTravel, travelMode, walkingPathClear, type PetMotionPhase, type PetPoint, type PetRect} from './petWorld'

const {BASE_URL} = import.meta.env
const auth = useAuthStore()
const storageKey = `vikunja:web-pet:${auth.info?.id ?? 'local'}`
const poses = {
	idle: 5,
	wave: 1,
	eat: 2,
	walk: 18,
	sleep: 7,
	peek: 15,
	roll: 4,
}
type Pose = keyof typeof poses
const pose = ref<Pose>('idle')
const position = ref<PetPoint>({x: 0, y: 80})
const size = ref(80)
const viewport = ref({width: 0, height: 0})
const facing = ref(1)
const held = ref(false)
const moving = ref(false)
const motionPhase = ref<PetMotionPhase>('idle')
const motionScale = ref({x: 1, y: 1})
const walkFrame = ref(0)
const walkViewBox = computed(() => {
	const feet = [446, 446, 443, 412, 412, 411][walkFrame.value]
	return [(walkFrame.value % 3) * 512, Math.floor(walkFrame.value / 3) * 512 + feet - 320, 512, 330]
})
const motionImage = computed(() => held.value || motionPhase.value === 'jump' ? 9 : motionPhase.value === 'crouch' ? 6 : motionPhase.value === 'land' ? 18 : poses[pose.value])
const panel = ref(false)
const hidden = ref(false)
const sleeping = ref(false)
const bubble = ref('')
const status = ref('想找個地方坐坐。')
const petButton = ref<HTMLButtonElement>()
const panelElement = ref<HTMLElement>()
const panelStyle = computed(() => ({
	left: `${Math.max(8, Math.min(position.value.x, viewport.value.width - 248))}px`,
	top: `${Math.max(68, Math.min(position.value.y - 224, viewport.value.height - 240))}px`,
}))
let frame = 0
let timer: ReturnType<typeof setInterval> | undefined
let reactionTimer: ReturnType<typeof setTimeout> | undefined
let geometryTimer: ReturnType<typeof setTimeout> | undefined
let reducedMotion: MediaQueryList
let dragging: {id: number; x: number; y: number; origin: PetPoint} | undefined
let dragged = false
let pausedUntil = 0
let support: Element | undefined
let supportOffset = 0
let motionDestination: PetPoint | undefined

function persist() {
	try {localStorage.setItem(storageKey, JSON.stringify({hidden: hidden.value, sleeping: sleeping.value}))} catch { /* Storage can be disabled. */ }
}
function stop() {
	cancelAnimationFrame(frame)
	if (motionDestination && ['crouch', 'jump', 'land'].includes(motionPhase.value)) position.value = {...motionDestination}
	motionDestination = undefined
	moving.value = false
	motionPhase.value = 'idle'
	motionScale.value = {x: 1, y: 1}
	if (pose.value === 'walk') pose.value = 'idle'
}
function blocked() {
	const focused = document.activeElement
	return document.hidden || !!document.querySelector('[role="dialog"], dialog[open], .task-detail-view-modal.is-active') ||
		!!focused?.matches('input, textarea, [contenteditable="true"]')
}
function obstacles(): PetRect[] {
	return Array.from(document.querySelectorAll('main input, main textarea, main button, main a, main h1, main h2, main [contenteditable="true"], main .project-progress-number, main .project-progress-count, [role="dialog"], .focus-badge'))
		.filter(element => !element.closest('.web-pet-layer'))
		.map(element => element.getBoundingClientRect())
		.filter(rect => rect.width > 0 && rect.height > 0)
}
function candidates() {
	const {width, height} = viewport.value
	const avoid = obstacles()
	const spots: {point: PetPoint; element?: Element}[] = []
	for (const element of document.querySelectorAll('main h1, main .print-bar, main .card, main .project-header-layout, main aside > section')) {
		const rect = element.getBoundingClientRect()
		if (rect.width < size.value || rect.top < 64 + size.value || rect.top > height - 32) continue
		const surfaces = element.matches('.print-bar') ? [rect.top, rect.bottom] : [rect.top]
		for (const surface of surfaces) {
			for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
				const x = rect.left + 12 + ratio * Math.max(0, rect.width - size.value - 24)
				const point = clampPet({x, y: surface - size.value + 5}, width, height, size.value)
				if (safeLanding(point, size.value, avoid)) spots.push({point, element})
			}
		}
	}
	for (const x of [12, width - size.value - 12]) {
		const point = clampPet({x, y: height - size.value - 16}, width, height, size.value)
		if (safeLanding(point, size.value, avoid)) spots.push({point})
	}
	return spots
}
function travel(destination: PetPoint, element?: Element) {
	stop()
	const start = {...position.value}
	const end = clampPet(destination, viewport.value.width, viewport.value.height, size.value)
	const mode = travelMode(start, end)
	if (mode === 'unreachable' || (mode === 'walk' && !walkingPathClear(start, end, size.value, obstacles()))) return
	support = element
	supportOffset = element ? destination.y - element.getBoundingClientRect().top : 0
	facing.value = end.x < start.x ? -1 : 1
	if (reducedMotion?.matches) {position.value = end; pose.value = 'idle'; return}
	motionDestination = end
	moving.value = true
	pose.value = 'walk'
	const began = performance.now()
	function step(now: number) {
		if (document.hidden || blocked()) {stop(); return}
		const sample = sampleTravel(start, end, mode, now - began)
		position.value = sample.point
		motionPhase.value = sample.phase
		motionScale.value = {x: sample.scaleX, y: sample.scaleY}
		walkFrame.value = sample.frame
		if (!sample.done) frame = requestAnimationFrame(step)
		else {motionDestination = undefined; moving.value = false; pose.value = 'idle'; status.value = element ? '這裡坐起來剛剛好。' : '一步一步慢慢走。'}
	}
	frame = requestAnimationFrame(step)
}
function wander() {
	if (hidden.value || sleeping.value || held.value || panel.value || blocked() || Date.now() < pausedUntil || reducedMotion?.matches) return
	if (support && !support.isConnected) updateGeometry()
	const avoid = obstacles()
	const spots = candidates()
	for (const dx of [-120, -70, 70, 120]) {
		const point = clampPet({x: position.value.x + dx, y: position.value.y}, viewport.value.width, viewport.value.height, size.value)
		if (support) {
			const rect = support.getBoundingClientRect()
			if (point.x < rect.left + 8 || point.x + size.value > rect.right - 8) continue
		}
		spots.push({point, element: support})
	}
	const reachable = spots.filter(spot => {
		const mode = travelMode(position.value, spot.point)
		return Math.hypot(spot.point.x - position.value.x, spot.point.y - position.value.y) > 40 && mode !== 'unreachable' &&
			safeLanding(spot.point, size.value, avoid) && (mode !== 'walk' || walkingPathClear(position.value, spot.point, size.value, avoid))
	})
	const walks = reachable.filter(spot => travelMode(position.value, spot.point) === 'walk')
	const choices = walks.length && Math.random() < 0.8 ? walks : reachable
	if (choices.length) {const spot = choices[Math.floor(Math.random() * choices.length)]; travel(spot.point, spot.element)}
	else pose.value = 'idle'
}
function updateGeometry() {
	stop()
	viewport.value = {width: window.innerWidth, height: window.innerHeight}
	size.value = window.innerWidth < 700 ? 68 : 80
	position.value = clampPet(position.value, window.innerWidth, window.innerHeight, size.value)
	if (support) {
		const rect = support.getBoundingClientRect()
		if (!support.isConnected || rect.top < 64 + size.value || rect.top > window.innerHeight) {
			support = undefined
			position.value = clampPet({x: window.innerWidth - size.value - 16, y: window.innerHeight - size.value - 16}, window.innerWidth, window.innerHeight, size.value)
		} else position.value = clampPet({x: position.value.x, y: rect.top + supportOffset}, window.innerWidth, window.innerHeight, size.value)
	}
}
function queueGeometry() {
	clearTimeout(geometryTimer)
	geometryTimer = setTimeout(updateGeometry, 100)
}
function pickup(event: PointerEvent) {
	if (event.button !== 0) return
	stop()
	clearTimeout(reactionTimer)
	held.value = true
	dragged = false
	dragging = {id: event.pointerId, x: event.clientX, y: event.clientY, origin: {...position.value}}
	petButton.value?.setPointerCapture(event.pointerId)
}
function drag(event: PointerEvent) {
	if (!dragging || dragging.id !== event.pointerId) return
	const dx = event.clientX - dragging.x
	const dy = event.clientY - dragging.y
	if (Math.hypot(dx, dy) < 6 && !dragged) return
	dragged = true
	panel.value = false
	support = undefined
	pose.value = 'wave'
	position.value = clampPet({x: dragging.origin.x + dx, y: dragging.origin.y + dy}, viewport.value.width, viewport.value.height, size.value)
}
function release() {
	if (!dragging) return
	held.value = false
	dragging = undefined
	pausedUntil = Date.now() + 12000
	if (!dragged) return
	const nearby = candidates().sort((a, b) => Math.hypot(a.point.x - position.value.x, a.point.y - position.value.y) - Math.hypot(b.point.x - position.value.x, b.point.y - position.value.y))[0]
	if (nearby && Math.hypot(nearby.point.x - position.value.x, nearby.point.y - position.value.y) < 140) travel(nearby.point, nearby.element)
	else if (!safeLanding(position.value, size.value, obstacles()) && nearby) travel(nearby.point, nearby.element)
	else pose.value = sleeping.value ? 'sleep' : 'idle'
}
function cancelDrag() {held.value = false; dragging = undefined}
function openPanel() {
	if (dragged) {dragged = false; return}
	stop()
	panel.value = !panel.value
}
function react(next: Pose, message: string) {
	stop()
	clearTimeout(reactionTimer)
	sleeping.value = false
	pose.value = next
	bubble.value = message
	status.value = message
	panel.value = false
	pausedUntil = Date.now() + 8000
	persist()
	reactionTimer = setTimeout(() => {bubble.value = ''; pose.value = 'idle'}, 4500)
}
function rest() {
	clearTimeout(reactionTimer)
	stop()
	sleeping.value = !sleeping.value
	pose.value = sleeping.value ? 'sleep' : 'idle'
	bubble.value = ''
	status.value = sleeping.value ? '陪你安靜休息。' : '睡飽了，去走走！'
	panel.value = false
	persist()
}
function explore() {sleeping.value = false; panel.value = false; pausedUntil = 0; persist(); wander()}
function hide() {hidden.value = true; panel.value = false; stop(); persist()}
function restore() {hidden.value = false; sleeping.value = false; pose.value = 'wave'; updateGeometry(); persist()}
function outside(event: PointerEvent) {
	if (panel.value && event.target instanceof Node && !petButton.value?.contains(event.target) && !panelElement.value?.contains(event.target)) panel.value = false
}
function keydown(event: KeyboardEvent) {if (event.key === 'Escape') panel.value = false}
function visibility() {if (document.hidden) stop()}

onMounted(() => {
	const walkAtlas = new Image()
	walkAtlas.src = `${BASE_URL}pet/panda/walk-cycle.png`
	try {
		const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
		hidden.value = saved.hidden === true
		sleeping.value = saved.sleeping === true
	} catch { /* Ignore unavailable or invalid local storage. */ }
	reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
	updateGeometry()
	position.value = clampPet({x: window.innerWidth - size.value - 24, y: window.innerHeight - size.value - 20}, window.innerWidth, window.innerHeight, size.value)
	const perch = candidates().find(spot => spot.element)
	if (perch) {
		position.value = perch.point
		support = perch.element
		supportOffset = perch.point.y - perch.element!.getBoundingClientRect().top
	}
	pose.value = sleeping.value ? 'sleep' : 'idle'
	timer = setInterval(wander, 9000)
	window.addEventListener('resize', queueGeometry)
	window.addEventListener('scroll', queueGeometry, true)
	document.addEventListener('pointerdown', outside)
	document.addEventListener('keydown', keydown)
	document.addEventListener('visibilitychange', visibility)
})
onBeforeUnmount(() => {
	stop()
	clearInterval(timer)
	clearTimeout(reactionTimer)
	clearTimeout(geometryTimer)
	window.removeEventListener('resize', queueGeometry)
	window.removeEventListener('scroll', queueGeometry, true)
	document.removeEventListener('pointerdown', outside)
	document.removeEventListener('keydown', keydown)
	document.removeEventListener('visibilitychange', visibility)
})
</script>

<style scoped lang="scss">
.web-pet-layer {
	position: fixed;
	inset: 0;
	z-index: 90;
	pointer-events: none;
	}
.web-pet {
	position: fixed;
	padding: 0;
	border: 0;
	background: transparent;
	cursor: grab;
	touch-action: none;
	pointer-events: auto;
	user-select: none;
	}
.web-pet img {
	display: block;
	inline-size: 100%;
	block-size: 100%;
	overflow: hidden;
	filter: drop-shadow(0 3px 2px #00000022);
	object-fit: contain;
	object-position: center bottom;
	}
.pet-art {
	display: block;
	inline-size: 100%;
	block-size: 100%;
	transform-origin: center bottom;
	pointer-events: none;
}
.pet-art svg {
	display: block;
	inline-size: 100%;
	block-size: 100%;
	overflow: hidden;
	filter: drop-shadow(0 2px 1px #00000022);
}
.web-pet.is-idle img {
	transform-origin: center bottom;
	animation: pet-breathe 2.8s ease-in-out infinite;
}
@keyframes pet-breathe {
	0%, 100% { scale: 1; }
	50% { scale: 1.015 0.985; }
}
.web-pet:focus-visible {
	outline: 2px solid var(--primary);
	outline-offset: 4px;
	border-radius: 12px;
	}
.web-pet.is-held {
	cursor: grabbing;
	}
.web-pet.is-held .pet-art {
	rotate: -8deg;
	}
.pet-bubble {
	position: absolute;
	inset-block-end: 100%;
	inset-inline-start: 50%;
	transform: translateX(-50%);
	padding: 6px 10px;
	border: 1px solid var(--grey-300);
	border-radius: 10px;
	background: var(--white);
	color: var(--grey-900);
	white-space: nowrap;
	font-size: 12px;
	}
.pet-panel {
	position: fixed;
	inline-size: 240px;
	padding: 14px;
	border: 1px solid var(--grey-300);
	border-block-start: 4px solid var(--primary);
	background: var(--white);
	color: var(--grey-900);
	box-shadow: 0 6px 24px #00000022;
	pointer-events: auto;
	}
.pet-panel header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	}
.pet-panel header button {
	border: 0;
	background: transparent;
	color: inherit;
	font-size: 22px;
	cursor: pointer;
	}
.pet-panel p {
	margin-block: 8px 12px;
	font-size: 13px;
	}
.pet-panel small {
	display: block;
	margin-block-start: 12px;
	font-size: 11px;
	color: var(--grey-600);
	}
.pet-choices {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	}
.pet-choices button, .pet-return {
	padding: 7px 10px;
	border: 1px solid var(--primary);
	background: var(--white);
	color: var(--primary);
	cursor: pointer;
	font: inherit;
	font-size: 12px;
	}
.pet-choices button:hover {
	background: var(--primary);
	color: white;
	}
.pet-return {
	position: fixed;
	inset-inline-end: 12px;
	inset-block-end: 16px;
	pointer-events: auto;
	border-radius: 16px;
	}
@media (prefers-reduced-motion: reduce) {
	.web-pet img, .web-pet .pet-art {
		rotate: none;
		animation: none;
	}
}
</style>



