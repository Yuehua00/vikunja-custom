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
export type PetMotionPhase = 'idle' | 'walk' | 'crouch' | 'jump' | 'land'

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
