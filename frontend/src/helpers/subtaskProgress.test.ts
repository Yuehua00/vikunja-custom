import {describe, expect, it} from 'vitest'
import {computeParentProgress, subtaskProgress} from './subtaskProgress'

describe('subtask progress', () => {
	it('counts completed subtasks as fully done despite a stale percentage', () => {
		expect(subtaskProgress({done: true, percent_done: 0.2})).toBe(1)
	})

	it('treats missing progress as zero for an unfinished subtask', () => {
		expect(subtaskProgress({done: false})).toBe(0)
	})

	it.each([
		[-0.2, 0],
		[0, 0],
		[0.6, 0.6],
		[1, 1],
		[1.2, 1],
	])('normalizes progress %s to %s', (input, expected) => {
		expect(subtaskProgress({done: false, percent_done: input})).toBe(expected)
	})
})

describe('parent progress', () => {
	it('leaves the parent unchanged when it has no subtasks', () => {
		expect(computeParentProgress([])).toBeNull()
	})

	it('averages partial progress instead of counting only completed tasks', () => {
		expect(computeParentProgress([
			{done: false, percent_done: 0.2},
			{done: false, percent_done: 0.6},
		])).toEqual({percent: 0.4, allDone: false})
	})

	it('combines a completed task with an unfinished task that has no progress', () => {
		expect(computeParentProgress([
			{done: true, percent_done: 0.2},
			{done: false},
		])).toEqual({percent: 0.5, allDone: false})
	})

	it('marks allDone only when every subtask is explicitly completed', () => {
		expect(computeParentProgress([
			{done: true, percent_done: 0},
			{done: true},
		])).toEqual({percent: 1, allDone: true})
	})

	it('does not treat one hundred percent as an explicit completion', () => {
		expect(computeParentProgress([
			{done: true},
			{done: false, percent_done: 1},
		])).toEqual({percent: 1, allDone: false})
	})

	it('rounds the average to two decimal places', () => {
		expect(computeParentProgress([
			{done: true},
			{done: false},
			{done: false},
		])).toEqual({percent: 0.33, allDone: false})
	})

	it('reopens the completion result when a subtask becomes unfinished', () => {
		const tasks = [{done: true, percent_done: 1}, {done: true, percent_done: 1}]
		expect(computeParentProgress(tasks)).toEqual({percent: 1, allDone: true})
		expect(computeParentProgress([tasks[0], {done: false, percent_done: 0.4}])).toEqual({percent: 0.7, allDone: false})
	})

	it('does not mutate the subtasks while calculating their progress', () => {
		const tasks = Object.freeze([
			Object.freeze({done: true, percent_done: 0}),
			Object.freeze({done: false, percent_done: 1.2}),
		])
		expect(computeParentProgress(tasks)).toEqual({percent: 1, allDone: false})
		expect(tasks[0].percent_done).toBe(0)
		expect(tasks[1].percent_done).toBe(1.2)
	})
})
