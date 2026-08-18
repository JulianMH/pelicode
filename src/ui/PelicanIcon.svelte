<svg
	class="pelican"
	width="48"
	height="48"
	viewBox="0 0 120 120"
	xmlns="http://www.w3.org/2000/svg"
	role="img"
	aria-label="Dancing pelican mascot"
>
	<ellipse cx="60" cy="100" rx="30" ry="6" fill="#00000022"/>
	<g>
		<animateTransform attributeName="transform" type="rotate" values="-8 60 90;8 60 90;-8 60 90" dur="0.6s" repeatCount="indefinite"/>
		<ellipse cx="60" cy="70" rx="22" ry="26" fill="#f2f2f2" stroke="#333" stroke-width="2"/>
		<circle cx="60" cy="38" r="16" fill="#f2f2f2" stroke="#333" stroke-width="2"/>
		<!-- Keep the right wing behind the beak. SVG paint order controls the overlap. -->
		<g>
			<animateTransform attributeName="transform" type="rotate" values="20 75 65;-20 75 65;20 75 65" dur="0.6s" repeatCount="indefinite"/>
			<path d="M75 55 C 90 60, 98 75, 92 88 C 82 82, 74 70, 72 60 Z" fill="#dcdcdc" stroke="#333" stroke-width="2"/>
		</g>
		<path d="M60 44 C 75 46, 88 52, 90 58 C 78 60, 66 58, 60 50 Z" fill="#ffb703" stroke="#333" stroke-width="2"/>
		<path d="M60 34 C 78 32, 92 36, 96 40 C 88 42, 74 42, 60 40 Z" fill="#fb8500" stroke="#333" stroke-width="2"/>
		<circle cx="56" cy="34" r="2" fill="#333"/>
		<g>
			<animateTransform attributeName="transform" type="rotate" values="-20 45 65;20 45 65;-20 45 65" dur="0.6s" repeatCount="indefinite"/>
			<path d="M45 55 C 30 60, 22 75, 28 88 C 38 82, 46 70, 48 60 Z" fill="#dcdcdc" stroke="#333" stroke-width="2"/>
		</g>
		<g>
			<animateTransform attributeName="transform" type="rotate" values="-6 52 92;6 52 92;-6 52 92" dur="0.6s" repeatCount="indefinite"/>
			<line x1="52" y1="92" x2="48" y2="104" stroke="#fb8500" stroke-width="3" stroke-linecap="round"/>
		</g>
		<g>
			<animateTransform attributeName="transform" type="rotate" values="6 68 92;-6 68 92;6 68 92" dur="0.6s" repeatCount="indefinite"/>
			<line x1="68" y1="92" x2="72" y2="104" stroke="#fb8500" stroke-width="3" stroke-linecap="round"/>
		</g>
	</g>
</svg>

<style>
	.pelican { flex-shrink: 0; }
</style>