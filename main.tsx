import React from "react";
import ReactDOM from "react-dom/client";
import NeonSynthPad from "./consonanceanalyzer.tsx";
import "./index.css";
import "./flash-probe";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <NeonSynthPad />
  </React.StrictMode>
);
