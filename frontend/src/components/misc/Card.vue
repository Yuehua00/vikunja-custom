<template>
	<div
		class="card"
		:class="{'has-no-shadow': !shadow}"
	>
		<header
			v-if="title !== ''"
			class="card-header"
		>
			<p class="card-header-title">
				{{ title }}
			</p>
			<BaseButton
				v-if="showClose"
				class="card-header-icon close"
				:aria-label="$t('misc.close')"
				@click="$emit('close')"
			>	
				<span class="icon">
					<Icon icon="times" />
				</span>
			</BaseButton>
		</header>
		<div
			class="card-content loader-container"
			:class="{
				'p-0': !padding,
				'is-loading': showLoading
			}"
		>
			<div :class="{'content': hasContent}">
				<slot />
			</div>
		</div>

		<footer
			v-if="$slots.footer"
			class="card-footer"
		>
			<slot name="footer" />
		</footer>
	</div>
</template>

<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import {useDelayedLoading} from '@/composables/useDelayedLoading'

const props = withDefaults(defineProps<{
	title?: string
	padding?: boolean
	shadow?: boolean
	hasContent?: boolean
	loading?: boolean
	showClose?: boolean
}>(), {
	title: '',
	padding: true,
	shadow: true,
	hasContent: true,
	loading: false,
	showClose: false,
})

defineEmits<{
	'close': []
}>()

const showLoading = useDelayedLoading(() => props.loading)
</script>

<style lang="scss" scoped>
.card {
	background-color: var(--white);
	border-radius: $radius;
	margin-block-end: 1rem;
	// Print style: flat paper on the page, no border or drop shadow
	border: 0;
	box-shadow: none;
	color: var(--text);
	max-inline-size: 100%;
	position: relative;

	@media print {
		box-shadow: none;
		border: none;
	}
}

.card-header {
	// Print style: a solid deep green bar with a white, spaced-out title
	background-color: var(--primary);
	align-items: stretch;
	display: flex;
	box-shadow: none;
	border-radius: $radius $radius 0 0;
}

.card-header-title {
	align-items: center;
	color: #ffffff;
	display: flex;
	flex-grow: 1;
	font-family: $display-font;
	font-weight: 700;
	letter-spacing: .14em;
	padding: 0.7rem 1.25rem;

	&.is-centered {
		justify-content: center;
	}
}

.card-header-icon {
	color: #ffffff;
	align-items: center;
	cursor: pointer;
	display: flex;
	justify-content: center;
	padding: 0.75rem 1rem;
}

.card-content {
	background-color: transparent;
	padding: 1.5rem;

	&:first-child {
		border-start-start-radius: $radius;
		border-start-end-radius: $radius;
	}

	&:last-child {
		border-end-start-radius: $radius;
		border-end-end-radius: $radius;
	}

	// Utility classes like .p-0 are defined globally with lower specificity
	// than Vue-scoped selectors; restore precedence explicitly.
	&.p-0 {
		padding: 0;
	}
}

.card-footer {
	align-items: stretch;
	background-color: transparent;
	border-block-start: 1px solid var(--grey-200);
	padding: 20px;
	display: flex;
	justify-content: flex-end;
}
</style>
