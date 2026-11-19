import "../src/lib/assets/tokens.css";
import { mount } from "svelte";
import App from "./App.svelte";
import PopupDemo from "./PopupDemo.svelte";

mount(location.hash === "#/popup" ? PopupDemo : App, { target: document.body });
