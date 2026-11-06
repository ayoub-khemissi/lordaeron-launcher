import { HeroUIProvider, ToastProvider } from "@heroui/react";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <ToastProvider placement="bottom-right" toastOffset={16} />
      <main className="dark h-full text-foreground">
        <App />
      </main>
    </HeroUIProvider>
  </React.StrictMode>,
);
