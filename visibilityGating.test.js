import { afterEach, describe, expect, it, vi } from "vitest";

// 펫 회귀 가드 — "안 볼 때 멈춘다"는 visibility(Page Visibility)로 판정해야 한다(focus 가 아니라).
// 내장 브라우저는 메인 webview 와 별개인 네이티브 child webview 라, 브라우저로 포커스가 가면
// 메인 창에 blur 가 뜬다 → 그래도 같은 창을 보고 있으므로 멈추면 안 된다.

let hidden = false;
let origGetContext;

function installEnv() {
  let id = 0;
  const raf = vi.fn(() => ++id); // 자동 호출 안 함 — 게이팅 배선(start/stop)만 검증.
  const caf = vi.fn();
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", caf);
  vi.stubGlobal("Path2D", class {}); // jsdom 미구현 — 패스 스텁.
  origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = () =>
    new Proxy({}, { get: () => () => {} });
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  document.hasFocus = () => true;
  return { raf, caf };
}

function setHidden(v) {
  hidden = v;
  document.dispatchEvent(new Event("visibilitychange"));
}

function mockCtx() {
  const disp = { dispose() {} };
  const handlers = new Map();
  const ctx = {
    subscriptions: [],
    app: {
      commands: { register: () => disp },
      events: {
        on: (event, fn) => {
          handlers.set(event, fn);
          return disp;
        },
      },
    },
  };
  return { ctx, fire: (event, p) => handlers.get(event)?.(p) };
}

describe("shark 펫 — visibility 게이팅", () => {
  const load = () => import("./main.js");

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    HTMLCanvasElement.prototype.getContext = origGetContext;
    delete document.hidden;
    delete document.visibilityState;
  });

  it("내장 브라우저 포커스(window blur)에도 계속 돈다", async () => {
    const env = installEnv();
    const mod = await load();
    mod.default.activate(mockCtx().ctx);
    expect(env.raf).toHaveBeenCalled();
    const cancelsBefore = env.caf.mock.calls.length;
    window.dispatchEvent(new Event("blur"));
    expect(env.caf.mock.calls.length).toBe(cancelsBefore);
  });

  it("창이 가려지면(visibilitychange→hidden) 멈춘다", async () => {
    const env = installEnv();
    const mod = await load();
    mod.default.activate(mockCtx().ctx);
    setHidden(true);
    expect(env.caf).toHaveBeenCalled();
  });

  it("앱이 비활성(app.focus=false)이면 멈추고, 재활성이면 재개한다", async () => {
    const env = installEnv();
    const mod = await load();
    const { ctx, fire } = mockCtx();
    mod.default.activate(ctx);
    expect(env.raf).toHaveBeenCalled();
    fire("app.focus", { focused: false });
    expect(env.caf).toHaveBeenCalled();
    const startsBefore = env.raf.mock.calls.length;
    fire("app.focus", { focused: true });
    expect(env.raf.mock.calls.length).toBeGreaterThan(startsBefore);
  });
});
