import {describe, expect, it} from 'vitest'
import {chooseRoamTarget, clampPet, planWalkPath, roamPoints, safeLanding, sampleSomersault, sampleWalk, walkingPathClear} from './petWorld'

describe('free roaming panda routes', () => {
	it('walks diagonally with both coordinates changing, and lands exactly at the destination', () => {
		const path = [{x: 20, y: 100}, {x: 164, y: 244}]
		const middle = sampleWalk(path, 1000)
		expect(middle.point.x).toBeGreaterThan(20)
		expect(middle.point.y).toBeGreaterThan(100)
		expect(middle.done).toBe(false)
		expect(sampleWalk(path, 10000)).toMatchObject({point: path[1], done: true})
	})
	it('can walk vertically without forcing a jump or a horizontal move', () => {
		const sample = sampleWalk([{x: 100, y: 100}, {x: 100, y: 300}], 1000)
		expect(sample.point).toEqual({x: 100, y: 172})
	})
	it('checks diagonal motion across the whole footprint', () => {
		const obstacles = [{left: 180, top: 180, right: 220, bottom: 220}]
		expect(walkingPathClear({x: 80, y: 80}, {x: 300, y: 300}, 40, obstacles)).toBe(false)
	})
	it('finds a multi-segment detour around an input area', () => {
		const obstacles = [{left: 220, top: 110, right: 280, bottom: 310}]
		const path = planWalkPath({x: 80, y: 180}, {x: 400, y: 180}, 600, 520, 40, obstacles)!
		expect(path).toBeDefined()
		expect(path.length).toBeGreaterThan(2)
		expect(path.some(point => point.y > 310)).toBe(true)
		for (let i = 1; i < path.length; i++) expect(walkingPathClear(path[i - 1], path[i], 40, obstacles)).toBe(true)
	})
	it('refuses unreachable destinations rather than crossing a full-height barrier', () => {
		expect(planWalkPath({x: 30, y: 160}, {x: 330, y: 160}, 500, 400, 40,
			[{left: 180, top: 0, right: 220, bottom: 400}])).toBeUndefined()
	})
	it('prefers an unexplored vertical destination over a repeated bottom-right corner', () => {
		const target = chooseRoamTarget({x: 800, y: 500}, [{x: 900, y: 600}, {x: 100, y: 100}, {x: 500, y: 200}],
			1000, 700, [20, 0, 0, 0, 0, 0, 0, 0, 0], [{x: 100, y: 100}], () => 0)
		expect(target).toEqual({x: 500, y: 200})
	})
	it('does not choose the current point as a new destination', () => {
		expect(chooseRoamTarget({x: 100, y: 100}, [{x: 100, y: 100}], 800, 600, [], [], () => 0)).toBeUndefined()
	})
	it.each([[1152, 668, 80], [390, 668, 68], [75, 90, 68]])('keeps safe candidates inside a %ix%i viewport', (width, height, size) => {
		const avoid = [{left: width / 2, top: 180, right: width, bottom: 300}]
		for (const point of roamPoints(width, height, size, avoid)) {
			expect(point.x).toBeGreaterThanOrEqual(0)
			expect(point.y).toBeGreaterThanOrEqual(0)
			expect(point.x + size).toBeLessThanOrEqual(width)
			expect(point.y + size).toBeLessThanOrEqual(height)
			expect(safeLanding(point, size, avoid)).toBe(true)
		}
		const edge = clampPet({x: 9999, y: 9999}, width, height, size)
		expect(edge.x + size).toBeLessThanOrEqual(width)
		expect(edge.y + size).toBeLessThanOrEqual(height)
	})
})

describe('generated somersault animation', () => {
	it('plays all sixteen drawn frames while remaining grounded', () => {
		const frames = new Set<number>()
		for (let elapsed = 0; elapsed < 1600; elapsed += 100) {
			const sample = sampleSomersault({x: 100, y: 200}, {x: 172, y: 200}, elapsed)
			frames.add(sample.frame)
			expect(sample.point.y).toBe(200)
			expect(sample.point.x).toBeGreaterThanOrEqual(100)
			expect(sample.point.x).toBeLessThanOrEqual(172)
		}
		expect(frames.size).toBe(16)
		expect(sampleSomersault({x: 100, y: 200}, {x: 172, y: 200}, 1600)).toMatchObject({point: {x: 172, y: 200}, frame: 15, done: true})
	})
})
