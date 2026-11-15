// Ambient module declarations for imports TypeScript cannot type by itself.
declare module '*.yaml?raw' {
	const text: string;
	export default text;
}

declare module 'pdfmake/build/pdfmake.js' {
	const pdfMake: unknown;
	export default pdfMake;
}
