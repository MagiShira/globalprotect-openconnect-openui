import React from "react";
import ReactDOM from "react-dom/client";
import App from "../components/App/App";
import SettingsPage from "../components/SettingsPage";

const params = new URLSearchParams(window.location.search);
const Root = params.get("window") === "settings" ? SettingsPage : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
