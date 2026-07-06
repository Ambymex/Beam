// Import the planner's REAL house style + canopy animations, then studio layout
// on top. Themes are applied by lib/theme.ts (which imports the real palettes).
import '../../planner/src/app.css';
import './studio.css';
import './lib/theme'; // side-effect: apply the initial theme
import App from './App.svelte';

const app = new App({ target: document.getElementById('app')! });

export default app;
