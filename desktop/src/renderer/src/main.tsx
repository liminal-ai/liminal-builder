import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { bootstrapTheme } from "./theme/apply-theme";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/chrome.css";
import "./styles/sidebar.css";
import "./styles/new-thread.css";
import "./styles/transcript.css";
import "./styles/composer.css";
import "highlight.js/styles/github-dark.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

bootstrapTheme();

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
