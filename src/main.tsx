import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PwaStatus from "./components/PwaStatus";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <PwaStatus />
  </React.StrictMode>,
);
