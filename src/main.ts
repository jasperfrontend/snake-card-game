import { createApp } from 'vue';
import './styles/tokens.css';
import App from './ui/App.vue';
import { applyTheme, loadTheme } from './ui/persistence';

// paint the theme onto <html> before the app mounts, so there's no flash of
// light before Vue takes over
applyTheme(loadTheme());

createApp(App).mount('#app');
