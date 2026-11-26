// Mounts the playground.

import "../src/lib/assets/tokens.css";
import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.body });
