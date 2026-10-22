import {computed} from 'vue'

import {useUpdateFrontendSettingsMutation} from '@/client/queries/account'
import {useAuthStore} from '@/stores/auth'
import {DEFAULT_HABITS, toggleLog, type Habit} from '@/helpers/habits'
import type {FrontendSettings} from '@/helpers/userSettings'

// Only one save may touch the account settings at a time, so ticking quickly cannot overlap two writes.
let saving: Promise<void> = Promise.resolve()

export function useHabits() {
	const authStore = useAuthStore()
	const updateFrontendSettings = useUpdateFrontendSettingsMutation()

	const settings = computed(() => authStore.settings.frontend_settings)
	const habits = computed<Habit[]>(() => settings.value.habits ?? DEFAULT_HABITS)
	const logs = computed(() => settings.value.habit_logs ?? {})

	// The patch is built when its turn comes, from the settings the previous save left behind.
	function save(buildPatch: () => Partial<FrontendSettings>) {
		const session = authStore.session
		if (!session) {
			return Promise.resolve()
		}
		saving = saving
			.catch(() => undefined)
			.then(() => updateFrontendSettings.mutateAsync({id: session.id, type: session.type, frontendSettings: buildPatch()}))
			.then(() => undefined)
		return saving
	}

	function toggle(habitId: string, date: Date) {
		return save(() => ({habit_logs: toggleLog(logs.value, habitId, date)}))
	}

	function saveHabits(next: Habit[]) {
		return save(() => ({habits: next}))
	}

	return {habits, logs, toggle, saveHabits}
}
