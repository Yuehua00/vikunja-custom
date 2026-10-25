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
