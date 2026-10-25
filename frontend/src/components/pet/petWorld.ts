export interface PetPoint {x: number; y: number}
export interface PetRect {left: number; top: number; right: number; bottom: number}

export function clampPet(point: PetPoint, width: number, height: number, size: number): PetPoint {
	return {
		x: Math.max(0, Math.min(point.x, Math.max(0, width - size))),
		y: Math.max(64, Math.min(point.y, Math.max(64, height - size - 12))),
	}
}

export function safeLanding(point: PetPoint, size: number, obstacles: PetRect[]): boolean {
	return !obstacles.some(rect => point.x < rect.right + 8 && point.x + size > rect.left - 8 &&
		point.y < rect.bottom + 6 && point.y + size > rect.top - 6)
}

export type PetTravelMode = 'walk' | 'jump' | 'unreachable'
export type PetMotionPhase = 'idle' | 'walk' | 'crouch' | 'jump' | 'land' | 'climb' | 'crest'

export function travelMode(start: PetPoint, end: PetPoint): PetTravelMode {
	const dx = Math.abs(end.x - start.x)
	const dy = Math.abs(end.y - start.y)
	if (dy <= 6) return 'walk'
	return dx <= 170 && dy <= 140 ? 'jump' : 'unreachable'
}

export function walkingPathClear(start: PetPoint, end: PetPoint, size: number, obstacles: PetRect[]): boolean {
	const count = Math.max(1, Math.ceil(Math.abs(end.x - start.x) / 12))
	for (let i = 0; i <= count; i++) {
		if (!safeLanding({x: start.x + (end.x - start.x) * i / count, y: start.y}, size, obstacles)) return false
	}
	return true
}

export function sampleTravel(start: PetPoint, end: PetPoint, mode: 'walk' | 'jump', elapsed: number) {
	const duration = mode === 'walk' ? Math.max(500, Math.abs(end.x - start.x) / 75 * 1000) : 760
	const t = Math.min(1, Math.max(0, elapsed / duration))
	let phase: PetMotionPhase = 'walk'
	let point = {x: start.x + (end.x - start.x) * t, y: start.y}
	let scaleY = 1
	let scaleX = 1
	if (mode === 'jump') {
		if (t < 0.18) {
			phase = 'crouch'
			point = {...start}
			scaleY = 1 - t / 0.18 * 0.24
			scaleX = 1 + t / 0.18 * 0.1
		} else if (t < 0.78) {
			phase = 'jump'
			const air = (t - 0.18) / 0.6
			const height = Math.min(80, 28 + Math.abs(end.y - start.y) * 0.35)
			point = {x: start.x + (end.x - start.x) * air, y: start.y + (end.y - start.y) * air - 4 * height * air * (1 - air)}
		} else {
			phase = 'land'
			point = {...end}
			const settle = (t - 0.78) / 0.22
			scaleY = 0.76 + settle * 0.24
			scaleX = 1.12 - settle * 0.12
		}
	} else {
		point.y -= Math.abs(Math.sin(elapsed / 100 * Math.PI / 3)) * 1.2
	}
	return {point: t === 1 ? {...end} : point, phase: t === 1 ? 'idle' as const : phase, scaleX, scaleY, frame: Math.floor(elapsed / 110) % 6, done: t === 1}
}

export interface PetClimbRoute {
	start: PetPoint;
	approach: PetPoint;
	hang: PetPoint;
	lip: PetPoint;
	crestEnd: PetPoint;
	end: PetPoint;
	side: 'left' | 'right';
	endOnWall: boolean;
	approachDuration: number;
	climbDuration: number;
	crestDuration: number;
	exitDuration: number;
}

function segmentClear(start: PetPoint, end: PetPoint, size: number, obstacles: PetRect[]) {
	const count = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 10))
	for (let i = 0; i <= count; i++) {
		if (!safeLanding({x: start.x + (end.x - start.x) * i / count, y: start.y + (end.y - start.y) * i / count}, size, obstacles)) return false
	}
	return true
}

export function planClimb(start: PetPoint, destination: PetPoint, wall: PetRect, side: 'left' | 'right', size: number,
	width: number, height: number, obstacles: PetRect[], endOnWall = false): PetClimbRoute | undefined {
	const wallX = side === 'left' ? wall.left - size * 0.95 : wall.right - size * 0.05
	const end = {x: endOnWall ? wallX : destination.x, y: destination.y}
	if (Math.abs(end.y - start.y) < 24 || Math.abs(end.y - start.y) > 560) return
	const approach = {x: wallX, y: start.y}
	const hang = {x: wallX, y: end.y + (endOnWall ? 0 : size * 0.4)}
	const lip = {x: wallX, y: end.y}
	const crestEnd = {x: endOnWall ? wallX : side === 'left' ? wall.left + 8 : wall.right - size - 8, y: end.y}
	for (const point of [start, approach, hang, lip, crestEnd, end]) {
		if (point.x < 0 || point.x + size > width || point.y < 64 || point.y + size > height - 8) return
	}
	if (Math.min(start.y, hang.y) + size < wall.top || Math.max(start.y, hang.y) > wall.bottom) return
	if (!segmentClear(start, approach, size, obstacles) || !segmentClear(approach, hang, size, obstacles) ||
		!segmentClear(hang, lip, size, obstacles) || !segmentClear(lip, crestEnd, size, obstacles) ||
		!segmentClear(crestEnd, end, size, obstacles)) return
	return {
		start: {...start}, approach, hang, lip, crestEnd, end, side, endOnWall,
		approachDuration: Math.abs(start.x - wallX) < 2 ? 0 : Math.max(500, Math.abs(start.x - wallX) / 75 * 1000),
		climbDuration: Math.max(400, Math.abs(hang.y - start.y) / 45 * 1000),
		crestDuration: endOnWall ? 0 : 600,
		exitDuration: endOnWall || Math.abs(end.x - crestEnd.x) < 2 ? 0 : Math.max(500, Math.abs(end.x - crestEnd.x) / 75 * 1000),
	}
}

export function sampleClimb(route: PetClimbRoute, elapsed: number) {
	if (elapsed < route.approachDuration) {
		return {...sampleTravel(route.start, route.approach, 'walk', elapsed), tilt: 0}
	}
	const climbing = elapsed - route.approachDuration
	if (climbing < route.climbDuration) {
		const progress = Math.max(0, climbing / route.climbDuration)
		const steps = Math.max(1, Math.ceil(Math.abs(route.hang.y - route.approach.y) / 12))
		const step = progress * steps
		const part = step - Math.floor(step)
		const eased = (Math.floor(step) + part * part * (3 - 2 * part)) / steps
		return {
			point: {x: route.approach.x, y: route.approach.y + (route.hang.y - route.approach.y) * eased},
			phase: 'climb' as PetMotionPhase, frame: Math.floor(climbing / 180) % 2,
			scaleX: 1, scaleY: 1 + Math.sin(climbing / 180 * Math.PI) * 0.02,
			tilt: Math.sin(climbing / 180 * Math.PI) * 3, done: false,
		}
	}
	const afterClimb = climbing - route.climbDuration
	if (afterClimb >= route.crestDuration && route.exitDuration) {
		return {...sampleTravel(route.crestEnd, route.end, 'walk', afterClimb - route.crestDuration), tilt: 0}
	}
	const crest = Math.min(1, route.crestDuration ? afterClimb / route.crestDuration : 1)
	const lift = Math.min(1, crest / 0.55)
	const roll = Math.max(0, (crest - 0.55) / 0.45)
	const liftEase = lift * lift * (3 - 2 * lift)
	const rollEase = roll * roll * (3 - 2 * roll)
	return {
		point: crest === 1 ? {...route.end} : {x: route.lip.x + (route.crestEnd.x - route.lip.x) * rollEase, y: route.hang.y + (route.lip.y - route.hang.y) * liftEase},
		phase: crest === 1 ? 'idle' as PetMotionPhase : 'crest' as PetMotionPhase, frame: crest < 0.55 ? 0 : 1,
		scaleX: 1, scaleY: 1 - Math.sin(crest * Math.PI) * 0.08,
		tilt: (route.side === 'left' ? 1 : -1) * Math.sin(roll * Math.PI) * 14, done: crest === 1,
	}
}
