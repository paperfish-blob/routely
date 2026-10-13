<script lang="ts">
	let {
		width = '100%',
		height = '12px',
		radius,
		circle = false
	}: { width?: string; height?: string; radius?: string; circle?: boolean } = $props();
</script>

<span
	class="sk"
	style="width: {width}; height: {height}; {circle ? 'border-radius: 50%' : radius ? `border-radius: ${radius}` : ''}"
></span>
