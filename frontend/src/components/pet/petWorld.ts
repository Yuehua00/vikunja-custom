export interface PetPoint {x: number; y: number}
export interface PetRect {left: number; top: number; right: number; bottom: number}
export type PetMotionPhase = 'idle' | 'walk' | 'roll'

export function clampPet(point: PetPoint, width: number, height: number, size: number): PetPoint {
	const maxX = Math.max(0, width - size - 8)
	const maxY = Math.max(0, height - size - 12)
	return {x: Math.max(Math.min(8, maxX), Math.min(point.x, maxX)), y: Math.max(Math.min(72, maxY), Math.min(point.y, maxY))}
}

export function safeLanding(point: PetPoint, size: number, obstacles: PetRect[]): boolean {
	return !obstacles.some(rect => point.x < rect.right + 8 && point.x + size > rect.left - 8 &&
		point.y < rect.bottom + 6 && point.y + size > rect.top - 6)
}

export function walkingPathClear(start: PetPoint, end: PetPoint, size: number, obstacles: PetRect[]): boolean {
	const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 10))
	for (let i = 0; i <= steps; i++) {
		if (!safeLanding({x: start.x + (end.x - start.x) * i / steps, y: start.y + (end.y - start.y) * i / steps}, size, obstacles)) return false
	}
	return true
}

export function roamPoints(width: number, height: number, size: number, obstacles: PetRect[]): PetPoint[] {
	const first = clampPet({x: 8, y: 72}, width, height, size)
	const last = clampPet({x: width, y: height}, width, height, size)
	const points: PetPoint[] = []
	const step = Math.max(48, size)
	for (let y = first.y; y <= last.y; y += step) {
		for (let x = first.x; x <= last.x; x += step) {
			if (safeLanding({x, y}, size, obstacles)) points.push({x, y})
		}
	}
	return points
}

export function petRegion(point: PetPoint, width: number, height: number): number {
	return Math.min(2, Math.floor(point.y / Math.max(1, height) * 3)) * 3 + Math.min(2, Math.floor(point.x / Math.max(1, width) * 3))
}

// Score safe destinations by exploration history, rather than favoring a fixed screen corner.
export function chooseRoamTarget(current: PetPoint, candidates: PetPoint[], width: number, height: number,
	visits: number[], recent: PetPoint[], random: () => number = Math.random): PetPoint | undefined {
	let best: PetPoint | undefined
	let bestScore = -Infinity
	for (const point of candidates) {
		const distance = Math.hypot(point.x - current.x, point.y - current.y)
		if (distance < 48) continue
		const region = petRegion(point, width, height)
		const score = Math.min(distance / 160, 2) + (Math.abs(point.y - current.y) > 40 ? 2 : 0) -
			(visits[region] ?? 0) * .75 - (region === 8 ? 6 : 0) -
			(region === petRegion(current, width, height) ? 2 : 0) -
			(recent.some(old => Math.hypot(old.x - point.x, old.y - point.y) < 90) ? 5 : 0) + random() * .6
		if (score > bestScore) {best = point; bestScore = score}
	}
	return best
}

// A* over a viewport grid. Every edge checks the entire pet footprint, including diagonal turns.
export function planWalkPath(start: PetPoint, end: PetPoint, width: number, height: number, size: number, obstacles: PetRect[]): PetPoint[] | undefined {
	if (!safeLanding(start, size, obstacles) || !safeLanding(end, size, obstacles)) return
	if (walkingPathClear(start, end, size, obstacles)) return [{...start}, {...end}]
	const step = Math.max(24, size / 2)
	const first = clampPet({x: 8, y: 72}, width, height, size)
	const last = clampPet({x: width, y: height}, width, height, size)
	const columns = Math.max(1, Math.floor((last.x - first.x) / step) + 1)
	const rows = Math.max(1, Math.floor((last.y - first.y) / step) + 1)
	const nodes = new Map<number, PetPoint>()
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < columns; col++) {
			const point = {x: first.x + col * step, y: first.y + row * step}
			if (safeLanding(point, size, obstacles)) nodes.set(row * columns + col, point)
		}
	}
	const open = new Set<number>()
	const cost = new Map<number, number>()
	const previous = new Map<number, number>()
	for (const [id, point] of nodes) {
		const distance = Math.hypot(point.x - start.x, point.y - start.y)
		if (distance <= step * 1.8 && walkingPathClear(start, point, size, obstacles)) {
			open.add(id); cost.set(id, distance); previous.set(id, -1)
		}
	}
	const closed = new Set<number>()
	while (open.size) {
		let id = -1
		let smallest = Infinity
		for (const item of open) {
			const point = nodes.get(item)!
			const score = cost.get(item)! + Math.hypot(point.x - end.x, point.y - end.y)
			if (score < smallest) {id = item; smallest = score}
		}
		const point = nodes.get(id)!
		if (Math.hypot(point.x - end.x, point.y - end.y) <= step * 1.8 && walkingPathClear(point, end, size, obstacles)) {
			const path = [{...end}, point]
			let parent = previous.get(id) ?? -1
			while (parent !== -1) {path.push(nodes.get(parent)!); parent = previous.get(parent) ?? -1}
			path.push({...start})
			return path.reverse()
		}
		open.delete(id); closed.add(id)
		const row = Math.floor(id / columns)
		const col = id % columns
		for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
			if (col + dx < 0 || col + dx >= columns || row + dy < 0 || row + dy >= rows) continue
			const next = (row + dy) * columns + col + dx
			const target = nodes.get(next)
			if (!target || closed.has(next) || !walkingPathClear(point, target, size, obstacles)) continue
			const nextCost = cost.get(id)! + Math.hypot(target.x - point.x, target.y - point.y)
			if (nextCost < (cost.get(next) ?? Infinity)) {cost.set(next, nextCost); previous.set(next, id); open.add(next)}
		}
	}
}

export function sampleWalk(path: PetPoint[], elapsed: number) {
	const lengths = path.slice(1).map((point, i) => Math.hypot(point.x - path[i].x, point.y - path[i].y))
	const total = lengths.reduce((sum, length) => sum + length, 0)
	let distance = Math.max(0, elapsed) * .072
	const done = distance >= total
	let segment = 0
	while (segment < lengths.length - 1 && distance > lengths[segment]) {distance -= lengths[segment]; segment++}
	const start = path[segment] ?? path[0]
	const end = path[segment + 1] ?? start
	const ratio = done ? 1 : Math.min(1, distance / Math.max(1, lengths[segment] ?? 0))
	return {point: done ? {...path[path.length - 1]} : {x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio},
		frame: Math.floor(Math.max(0, elapsed) / 110) % 6, facing: end.x < start.x ? -1 : end.x > start.x ? 1 : 0, done}
}

// The generated atlas supplies the anatomical roll; runtime adds only a short grounded translation.
export function sampleSomersault(start: PetPoint, end: PetPoint, elapsed: number) {
	const t = Math.min(1, Math.max(0, elapsed / 1600))
	const travel = t < .15 ? 0 : t > .8 ? 1 : (t - .15) / .65
	return {point: {x: start.x + (end.x - start.x) * travel, y: start.y + (end.y - start.y) * travel},
		frame: Math.min(15, Math.floor(t * 16)), done: t === 1}
}

// Measured atlas gutters, not an assumed equal 4x4 grid. Coordinates use the 1254px source.
export function somersaultCrop(frame: number) {
	const index = Math.min(15, Math.max(0, Math.floor(frame)))
	const columns = [0, 320, 640, 950, 1254]
	const rows = [0, 345, 650, 930, 1254]
	const col = index % 4
	const row = Math.floor(index / 4)
	return {x: columns[col], y: rows[row], width: columns[col + 1] - columns[col], height: rows[row + 1] - rows[row]}
}
