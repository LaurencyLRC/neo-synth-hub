import React from "react";
import ReactDOM from "react-dom/client";
import NeonSynthPad from "./consonanceanalyzer.ts";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <NeonSynthPad />
  </React.StrictMode>
);
