<template>
	<div
		class="importance-stars"
		role="group"
		:aria-label="$t('task.attributes.importance')"
	>
		<button
			v-for="star in STARS"
			:key="star"
			type="button"
			class="importance-star"
			:class="{'is-filled': star <= modelValue}"
			:disabled="disabled || undefined"
			:aria-label="$t('task.importance.setTo', {count: star})"
			:aria-pressed="star <= modelValue"
			@click="select(star)"
		>
			<Icon :icon="star <= modelValue ? 'star' : ['far', 'star']" />
		</button>
		<span
			v-if="modelValue > 0"
			class="importance-label"
		>
			{{ modelValue }} / {{ STARS.length }}
		</span>
	</div>
</template>

<script setup lang="ts">
const STARS = [1, 2, 3, 4, 5] as const

const props = withDefaults(defineProps<{
	disabled?: boolean
}>(), {
	disabled: false,
})

const modelValue = defineModel<number>({required: true})

// Clicking the current rating again clears it.
function select(star: number) {
	if (props.disabled) {
		return
	}
	modelValue.value = modelValue.value === star ? 0 : star
}
</script>

<style scoped lang="scss">
.importance-stars {
	display: inline-flex;
	align-items: center;
	gap: 2px;
}

.importance-star {
	padding: .15rem;
	border: 0;
	background: transparent;
	color: var(--grey-400);
	font-size: 1.1rem;
	line-height: 1;
	cursor: pointer;

	&.is-filled {
		color: var(--warning);
	}

	&:disabled {
		cursor: default;
	}

	&:not(:disabled):hover {
		color: var(--warning);
	}
}

.importance-label {
	margin-inline-start: .5rem;
	font-size: .8rem;
	color: var(--grey-500);
}
</style>
