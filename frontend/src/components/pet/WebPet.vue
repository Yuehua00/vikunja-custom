<template>
	<Teleport to="body">
		<div class="web-pet-layer d-print-none">
			<span
				v-if="completionStamp"
				class="pet-completion-stamp"
				role="status"
			>已完成</span>
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
					:class="{'is-held': held, 'is-moving': moving}"
					:data-motion="motionPhase"
					:style="{left: `${position.x}px`, top: `${position.y}px`, width: `${size}px`, height: `${size}px`, visibility: hasSpace ? 'visible' : 'hidden'}"
					aria-label="熊貓，點一下互動，或拖曳到空白處"
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
						:style="{transform: `scaleX(${facing})`}"
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
						<svg
							v-else-if="motionPhase === 'roll' && rollReady"
							:viewBox="rollViewBox.join(' ')"
							preserveAspectRatio="xMidYMax meet"
							aria-hidden="true"
						>
							<defs>
								<clipPath
									id="panda-roll-frame"
									clipPathUnits="userSpaceOnUse"
								>
									<rect
										:x="rollCrop.x"
										:y="rollCrop.y"
										:width="rollCrop.width"
										:height="rollCrop.height"
									/>
								</clipPath>
							</defs>
							<image
								clip-path="url(#panda-roll-frame)"
								:href="`${BASE_URL}pet/panda/somersault-cycle.png`"
								:width="rollAtlas.width"
								:height="rollAtlas.height"
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
						<button
							:disabled="!rollReady || reduceAnimations"
							@click="somersault"
						>
							翻跟斗
						</button>
						<button @click="react('stretch', '伸個懶腰，再繼續！')">
							伸懶腰
						</button>
						<button @click="react('play', '一起玩一下。')">
							陪她玩
						</button>
						<button @click="hide">
							收起熊貓
						</button>
					</div>
					<small>可以抱起她，放到空白處；她會自己找路散步。雙擊空白處可以叫她過來，專注時會安靜陪伴。</small>
				</section>
			</template>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {createEffectGate, isPetBlankArea, PET_COMPLETION_EVENT} from './petEffects'
import {useAuthStore} from '@/stores/auth'
import {chooseRoamTarget, clampPet, petRegion, planWalkPath, roamPoints, safeLanding, sampleSomersault, sampleWalk, somersaultCrop, walkingPathClear, type PetMotionPhase, type PetPoint, type PetRect} from './petWorld'

const {BASE_URL} = import.meta.env
const auth = useAuthStore()
const route = useRoute()
const focusing = computed(() => !!auth.settings?.frontend_settings?.focus_active)
const completionStamp = ref(false)
const allowCompletion = createEffectGate(4500)
const allowProximity = createEffectGate(10000)
let stampTimer: ReturnType<typeof setTimeout> | undefined
const storageKey = `vikunja:web-pet:${auth.info?.id ?? 'local'}`
// These are individual poses, never cycled as fake animation frames.
const poses = {
	idle: [5, 19, 20], wave: [1, 8, 17], eat: [2, 10], stretch: [6, 13],
	look: [11, 15], rest: [16, 18, 21, 22], sleep: [7, 22], play: [3, 4, 9, 12, 14],
}
type Pose = keyof typeof poses
const poseSelections: Record<Pose, number> = {idle: 0, wave: 0, eat: 0, stretch: 0, look: 0, rest: 0, sleep: 0, play: 0}
const selectedImage = ref(5)
const position = ref<PetPoint>({x: 8, y: 80})
const size = ref(80)
const viewport = ref({width: 0, height: 0})
const facing = ref(1)
const held = ref(false)
const moving = ref(false)
const hasSpace = ref(false)
const motionPhase = ref<PetMotionPhase>('idle')
const walkFrame = ref(0)
const rollFrame = ref(0)
const walkReady = ref(false)
const rollReady = ref(false)
const rollAtlas = ref({width: 0, height: 0})
const walkViewBox = computed(() => {
	const feet = [446, 446, 443, 412, 412, 411][walkFrame.value]
	return [(walkFrame.value % 3) * 512, Math.floor(walkFrame.value / 3) * 512 + feet - 320, 512, 330]
})
const rollCrop = computed(() => somersaultCrop(rollFrame.value))
const rollViewBox = computed(() => {
	const crop = rollCrop.value
	return [crop.x + crop.width / 2 - 175, crop.y + crop.height - 350, 350, 350]
})
const motionImage = computed(() => held.value ? 9 : selectedImage.value)
const panel = ref(false)
const hidden = ref(false)
const sleeping = ref(false)
const reduceAnimations = ref(false)
const bubble = ref('')
const status = ref('今天想去不同地方走走。')
const petButton = ref<HTMLButtonElement>()
const panelElement = ref<HTMLElement>()
const panelStyle = computed(() => ({
	left: `${Math.max(8, Math.min(position.value.x, viewport.value.width - 248))}px`,
	top: `${Math.max(68, Math.min(position.value.y - 250, viewport.value.height - 280))}px`,
}))
const visits = Array<number>(9).fill(0)
const recent: PetPoint[] = []
let frame = 0
let timer: ReturnType<typeof setInterval> | undefined
let reactionTimer: ReturnType<typeof setTimeout> | undefined
let geometryTimer: ReturnType<typeof setTimeout> | undefined
let motionPreference: MediaQueryList | undefined
let walkImage: HTMLImageElement | undefined
let rollImage: HTMLImageElement | undefined
let dragging: {id: number; x: number; y: number; origin: PetPoint} | undefined
let dragged = false
let pausedUntil = 0

function choosePose(next: Pose) {
	const choices = poses[next]
	selectedImage.value = choices[poseSelections[next]++ % choices.length]
}
function persist() {
	try {localStorage.setItem(storageKey, JSON.stringify({hidden: hidden.value, sleeping: sleeping.value}))} catch { /* Storage may be unavailable. */ }
}
function stop() {
	cancelAnimationFrame(frame)
	moving.value = false
	motionPhase.value = 'idle'
}
function blocked(ignoreInput = false) {
	const focused = document.activeElement
	return document.hidden || (!ignoreInput && !!focused?.closest('input, textarea, [contenteditable="true"]')) ||
		Array.from(document.querySelectorAll('[role="dialog"], dialog[open], .modal-container')).some(element => element.getBoundingClientRect().width > 0)
}
function obstacles(): PetRect[] {
	return Array.from(document.querySelectorAll('input, textarea, button, a, h1, h2, [contenteditable="true"], [role="dialog"], .focus-badge'))
		.filter(element => !element.closest('.web-pet-layer'))
		.map(element => element.getBoundingClientRect())
		.filter(rect => rect.width > 0 && rect.height > 0 && rect.bottom > 64 && rect.top < viewport.value.height)
}
function remember(point: PetPoint) {
	visits[petRegion(point, viewport.value.width, viewport.value.height)]++
	recent.push({...point})
	if (recent.length > 6) recent.shift()
}
function finishMotion() {
	moving.value = false
	motionPhase.value = 'idle'
	choosePose('idle')
	remember(position.value)
	pausedUntil = Date.now() + 1800 + Math.random() * 2200
}
function travel(path: PetPoint[], summoned = false) {
	if (reduceAnimations.value || !walkReady.value || path.length < 2) return false
	stop()
	const avoid = obstacles()
	moving.value = true
	motionPhase.value = 'walk'
	const began = performance.now()
	function step(now: number) {
		if (blocked(summoned) || held.value) {stop(); return}
		const sample = sampleWalk(path, now - began)
		if (!safeLanding(sample.point, size.value, avoid)) {stop(); return}
		position.value = sample.point
		walkFrame.value = sample.frame
		if (sample.facing) facing.value = sample.facing
		if (sample.done) {finishMotion(); status.value = '這裡也很舒服。'; return}
		frame = requestAnimationFrame(step)
	}
	frame = requestAnimationFrame(step)
	return true
}
function wander() {
	if (focusing.value || hidden.value || sleeping.value || held.value || moving.value || panel.value || blocked() || Date.now() < pausedUntil || reduceAnimations.value) return
	if (!hasSpace.value) {updateGeometry(); return}
	if (Math.random() < .18 && rollReady.value && somersault()) return
	if (Math.random() < .2) {
		const choices: Pose[] = ['wave', 'stretch', 'look', 'rest', 'play']
		choosePose(choices[Math.floor(Math.random() * choices.length)])
		pausedUntil = Date.now() + 3200
		return
	}
	const avoid = obstacles()
	if (!safeLanding(position.value, size.value, avoid)) {updateGeometry(); return}
	const points = roamPoints(viewport.value.width, viewport.value.height, size.value, avoid)
	const nearby = points.filter(point => Math.hypot(point.x - position.value.x, point.y - position.value.y) <= 340)
	const choices = nearby.length ? nearby : points
	for (let attempt = 0; attempt < 6 && choices.length; attempt++) {
		const point = chooseRoamTarget(position.value, choices, viewport.value.width, viewport.value.height, visits, recent)
		if (!point) return
		const path = planWalkPath(position.value, point, viewport.value.width, viewport.value.height, size.value, avoid)
		if (path && travel(path)) {status.value = '換個方向，去別處看看。'; return}
		choices.splice(choices.indexOf(point), 1)
	}
	choosePose('look')
}
function somersault() {
	if (focusing.value || reduceAnimations.value || !rollReady.value || blocked() || held.value || !hasSpace.value) return false
	const avoid = obstacles()
	const start = {...position.value}
	const destinations = [facing.value, -facing.value].map(direction => clampPet({x: start.x + direction * size.value * .9, y: start.y}, viewport.value.width, viewport.value.height, size.value))
	const end = destinations.find(point => Math.abs(point.x - start.x) >= size.value * .65 && walkingPathClear(start, point, size.value, avoid))
	if (!end) {status.value = '這裡有點擠，找到空位再翻跟斗。'; return false}
	stop()
	clearTimeout(reactionTimer)
	panel.value = false
	sleeping.value = false
	persist()
	bubble.value = ''
	facing.value = end.x < start.x ? -1 : 1
	moving.value = true
	motionPhase.value = 'roll'
	rollFrame.value = 0
	status.value = '看我翻一個跟斗！'
	const began = performance.now()
	function step(now: number) {
		if (blocked() || held.value) {stop(); return}
		const sample = sampleSomersault(start, end!, now - began)
		if (!safeLanding(sample.point, size.value, avoid)) {stop(); return}
		position.value = sample.point
		rollFrame.value = sample.frame
		if (sample.done) {finishMotion(); return}
		frame = requestAnimationFrame(step)
	}
	frame = requestAnimationFrame(step)
	return true
}
function updateGeometry() {
	stop()
	const firstPlacement = viewport.value.width === 0
	viewport.value = {width: window.innerWidth, height: window.innerHeight}
	size.value = window.innerWidth < 700 ? 68 : 80
	position.value = clampPet(position.value, viewport.value.width, viewport.value.height, size.value)
	if (held.value || blocked()) return
	const avoid = obstacles()
	if (!firstPlacement && safeLanding(position.value, size.value, avoid)) {hasSpace.value = true; return}
	const points = roamPoints(viewport.value.width, viewport.value.height, size.value, avoid)
	const center = {x: viewport.value.width * .45, y: viewport.value.height * .35}
	points.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
	hasSpace.value = points.length > 0
	if (points.length) {position.value = points[0]; remember(position.value)}
}
function queueGeometry() {clearTimeout(geometryTimer); geometryTimer = setTimeout(updateGeometry, 100)}
function pickup(event: PointerEvent) {
	if (event.button !== 0) return
	stop(); clearTimeout(reactionTimer)
	held.value = true; dragged = false
	dragging = {id: event.pointerId, x: event.clientX, y: event.clientY, origin: {...position.value}}
	petButton.value?.setPointerCapture(event.pointerId)
}
function drag(event: PointerEvent) {
	if (!dragging || dragging.id !== event.pointerId) return
	const dx = event.clientX - dragging.x; const dy = event.clientY - dragging.y
	if (Math.hypot(dx, dy) < 6 && !dragged) return
	dragged = true; panel.value = false
	position.value = clampPet({x: dragging.origin.x + dx, y: dragging.origin.y + dy}, viewport.value.width, viewport.value.height, size.value)
}
function release() {
	if (!dragging) return
	held.value = false; dragging = undefined
	pausedUntil = Date.now() + 4500
	if (dragged) {choosePose(sleeping.value ? 'sleep' : 'idle'); updateGeometry()}
}
function cancelDrag() {held.value = false; dragging = undefined; updateGeometry()}
function openPanel() {if (dragged) {dragged = false; return}; stop(); panel.value = !panel.value}
function react(next: Pose, message: string) {
	stop(); clearTimeout(reactionTimer)
	sleeping.value = false; choosePose(next)
	bubble.value = message; status.value = message; panel.value = false
	pausedUntil = Date.now() + 4500
	persist()
	reactionTimer = setTimeout(() => {bubble.value = ''; choosePose('idle')}, 4000)
}
function rest() {
	stop(); clearTimeout(reactionTimer)
	sleeping.value = !sleeping.value
	choosePose(sleeping.value ? 'sleep' : 'stretch')
	bubble.value = ''; status.value = sleeping.value ? '陪你安靜休息。' : '睡飽了，去走走！'
	panel.value = false; persist()
}
function explore() {stop(); sleeping.value = false; panel.value = false; pausedUntil = 0; persist(); wander()}
function hide() {hidden.value = true; panel.value = false; stop(); persist()}
function restore() {hidden.value = false; sleeping.value = false; choosePose('wave'); updateGeometry(); pausedUntil = Date.now() + 1500; persist()}
function outside(event: PointerEvent) {
	if (panel.value && event.target instanceof Node && !petButton.value?.contains(event.target) && !panelElement.value?.contains(event.target)) panel.value = false
}
function completedTask() {
	if (document.hidden || !allowCompletion()) return
	completionStamp.value = true
	clearTimeout(stampTimer)
	stampTimer = setTimeout(() => {completionStamp.value = false}, 1800)
	if (!hidden.value && !held.value && !sleeping.value && !focusing.value && !blocked(true)) react('wave', '又完成一件事了！')
}
function cursorNearby(event: PointerEvent) {
	if (event.pointerType !== 'mouse' || hidden.value || sleeping.value || focusing.value || held.value || moving.value || panel.value || blocked()) return
	const dx = event.clientX - position.value.x - size.value / 2
	const dy = event.clientY - position.value.y - size.value / 2
	if (Math.hypot(dx, dy) > 130 || !allowProximity()) return
	facing.value = dx < 0 ? -1 : 1
	react('look', '我在這裡陪你。')
}
function summon(event: MouseEvent) {
	if (event.button !== 0 || hidden.value || sleeping.value || focusing.value || held.value || reduceAnimations.value || blocked(true) || !isPetBlankArea(event.target)) return
	const avoid = obstacles()
	const points = roamPoints(viewport.value.width, viewport.value.height, size.value, avoid)
	points.sort((a, b) => Math.hypot(a.x - event.clientX, a.y - event.clientY) - Math.hypot(b.x - event.clientX, b.y - event.clientY))
	const target = points[0]
	if (!target || Math.hypot(target.x - event.clientX, target.y - event.clientY) > 180) return
	const path = planWalkPath(position.value, target, viewport.value.width, viewport.value.height, size.value, avoid)
	if (path) {panel.value = false; travel(path, true); status.value = '我過來陪你。'}
	else {react('look', '這裡過不去，換個空位叫我吧。')}
}
watch(focusing, (active, previous) => {
	stop(); clearTimeout(reactionTimer); bubble.value = ''
	if (active) {choosePose('rest'); status.value = '專注中，安靜陪你。'}
	else if (previous && !hidden.value && !sleeping.value) react('stretch', '計時結束，休息一下吧。')
})
function keydown(event: KeyboardEvent) {if (event.key === 'Escape') panel.value = false}
function visibility() {if (document.hidden) stop()}
function motionChanged() {reduceAnimations.value = motionPreference?.matches ?? false; if (reduceAnimations.value) stop()}
watch(() => route.fullPath, () => {if (viewport.value.width) void nextTick(queueGeometry)})

onMounted(() => {
	walkImage = new Image()
	walkImage.onload = () => {walkReady.value = true}
	walkImage.src = `${BASE_URL}pet/panda/walk-cycle.png`
	rollImage = new Image()
	rollImage.onload = () => {
		rollAtlas.value = {width: rollImage!.naturalWidth, height: rollImage!.naturalHeight}
		rollReady.value = rollAtlas.value.width > 0 && rollAtlas.value.height > 0
	}
	rollImage.onerror = () => {rollReady.value = false; status.value = '翻跟斗素材還沒載入好，先陪你坐坐。'}
	rollImage.src = `${BASE_URL}pet/panda/somersault-cycle.png`
	try {
		const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
		hidden.value = saved.hidden === true; sleeping.value = saved.sleeping === true
	} catch { /* Ignore unavailable or invalid storage. */ }
	motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
	motionChanged(); motionPreference.addEventListener('change', motionChanged)
	updateGeometry(); choosePose(sleeping.value ? 'sleep' : focusing.value ? 'rest' : 'idle')
	pausedUntil = Date.now() + 1800
	timer = setInterval(wander, 2200)
	window.addEventListener(PET_COMPLETION_EVENT, completedTask)
	document.addEventListener('pointermove', cursorNearby)
	document.addEventListener('dblclick', summon)
	window.addEventListener('resize', queueGeometry)
	window.addEventListener('scroll', queueGeometry, true)
	document.addEventListener('pointerdown', outside)
	document.addEventListener('keydown', keydown)
	document.addEventListener('visibilitychange', visibility)
})
onBeforeUnmount(() => {
	stop(); clearInterval(timer); clearTimeout(reactionTimer); clearTimeout(geometryTimer)
	motionPreference?.removeEventListener('change', motionChanged)
	if (walkImage) walkImage.onload = null
	if (rollImage) {rollImage.onload = null; rollImage.onerror = null}
	clearTimeout(stampTimer)
	window.removeEventListener(PET_COMPLETION_EVENT, completedTask)
	document.removeEventListener('pointermove', cursorNearby)
	document.removeEventListener('dblclick', summon)
	window.removeEventListener('resize', queueGeometry)
	window.removeEventListener('scroll', queueGeometry, true)
	document.removeEventListener('pointerdown', outside)
	document.removeEventListener('keydown', keydown)
	document.removeEventListener('visibilitychange', visibility)
})
</script>

<style scoped lang="scss">
.pet-completion-stamp {
	position: fixed;
	inset-block-start: 85px;
	inset-inline-end: 28px;
	padding: 8px 18px;
	border: 2px solid #205843;
	background: #f3faf5;
	color: #205843;
	font-weight: 700;
	box-shadow: 0 3px 12px #00000016;
}

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



