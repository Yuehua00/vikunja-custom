import {useAuthStore} from '@/stores/auth'

// Three rounds of a bright two-note chime, about three seconds in all: loud and long enough to be noticed
// while working on something else, which the short pop of a finished task is not. Made with the Web Audio
// API, so there is no sound file; it follows the same sound setting as the pop.
const ROUNDS = 3
const ROUND_LENGTH = 1
const NOTES = [987.77, 1318.51]
const NOTE_LENGTH = 0.22
const VOLUME = 0.6

export function playFocusAlarm() {
	if (!useAuthStore().settings.frontend_settings.play_sound_when_done) {
		return
	}

	try {
		const context = new AudioContext()
		void context.resume()
		const start = context.currentTime + 0.05

		for (let round = 0; round < ROUNDS; round++) {
			NOTES.forEach((frequency, index) => {
				const begin = start + round * ROUND_LENGTH + index * NOTE_LENGTH
				const oscillator = context.createOscillator()
				const gain = context.createGain()
				oscillator.type = 'triangle'
				oscillator.frequency.value = frequency
				// A quick rise and a fade, so each note is clear without clicking.
				gain.gain.setValueAtTime(0.0001, begin)
				gain.gain.exponentialRampToValueAtTime(VOLUME, begin + 0.02)
				gain.gain.exponentialRampToValueAtTime(0.0001, begin + NOTE_LENGTH * 1.8)
				oscillator.connect(gain).connect(context.destination)
				oscillator.start(begin)
				oscillator.stop(begin + NOTE_LENGTH * 1.9)
			})
		}

		setTimeout(() => void context.close(), (ROUNDS * ROUND_LENGTH + 1) * 1000)
	} catch (cause) {
		console.error('Could not play the focus alarm:', cause)
	}
}
