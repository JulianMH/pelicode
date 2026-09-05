import { mount } from 'svelte';
import BrowserApp from './BrowserApp.svelte';

mount(BrowserApp, { target: document.getElementById('app')! });
