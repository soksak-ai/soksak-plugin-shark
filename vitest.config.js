import { defineConfig } from "vitest/config";

// activate 가 document/canvas 를 쓰므로 jsdom 환경.
export default defineConfig({ test: { environment: "jsdom" } });
