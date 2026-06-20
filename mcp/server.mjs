import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";

const SERVER_NAME = "Cowart MCP";
const SERVER_VERSION = "0.1.1";
const TOOL_GET_SELECTION = "get_cowart_selection";
const TOOL_RENDER_WIDGET = "render_cowart_canvas_widget";
const WIDGET_URI = "ui://widget/cowart/canvas.html";
const WIDGET_MIME_TYPE = "text/html;profile=mcp-app";
const DEFAULT_CANVAS_URL = "http://127.0.0.1:43217/";
const require = createRequire(import.meta.url);
let cachedMcpAppsGlobalScript = "";
const JsonRpcError = {
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
};

const widgetMeta = {
  ui: {
    resourceUri: WIDGET_URI,
    prefersBorder: false,
    csp: {
      connectDomains: [
        "http://127.0.0.1:*",
        "http://localhost:*",
      ],
      resourceDomains: [
        "http://127.0.0.1:*",
        "http://localhost:*",
        "data:",
        "blob:",
      ],
    },
  },
  "openai/widgetDescription": "Cowart tldraw canvas widget.",
  "openai/widgetPrefersBorder": false,
  "openai/widgetCSP": {
    connect_domains: [
      "http://127.0.0.1:*",
      "http://localhost:*",
    ],
    resource_domains: [
      "http://127.0.0.1:*",
      "http://localhost:*",
      "data:",
      "blob:",
    ],
  },
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeCanvasUrl(value) {
  const rawUrl = nonEmptyString(value) ?? DEFAULT_CANVAS_URL;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Cowart canvas URL must use http or https.");
    }
    if (!url.pathname.endsWith("/")) {
      url.pathname = `${url.pathname}/`;
    }
    return url.toString();
  } catch (error) {
    throw new Error(`Invalid Cowart canvas URL: ${error.message}`);
  }
}

function mcpAppsGlobalScript() {
  if (cachedMcpAppsGlobalScript) return cachedMcpAppsGlobalScript;

  const sourcePath = require.resolve("@modelcontextprotocol/ext-apps/app-with-deps");
  const source = readFileSync(sourcePath, "utf8");
  const exportStart = source.lastIndexOf("export{");
  if (exportStart === -1) {
    throw new Error("Could not find ext-apps browser export block.");
  }

  const exportBlock = source.slice(exportStart).match(/^export\{([^}]+)\};?\s*$/s);
  if (!exportBlock) {
    throw new Error("Could not parse ext-apps browser export block.");
  }

  const exportMap = parseExportMap(exportBlock[1]);
  const requiredExports = ["App"];
  for (const name of requiredExports) {
    if (!exportMap.has(name)) {
      throw new Error(`Missing ext-apps browser export: ${name}`);
    }
  }

  cachedMcpAppsGlobalScript = [
    source.slice(0, exportStart),
    ";globalThis.__COWART_MCP_APPS__={",
    requiredExports.map((name) => `${JSON.stringify(name)}:${exportMap.get(name)}`).join(","),
    "};",
  ].join("");
  return cachedMcpAppsGlobalScript;
}

function parseExportMap(body) {
  const exportMap = new Map();
  for (const rawEntry of body.split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const parts = entry.split(/\s+as\s+/);
    const local = parts[0]?.trim();
    const exported = (parts[1] || parts[0])?.trim();
    if (local && exported) exportMap.set(exported, local);
  }
  return exportMap;
}

function escapeInlineScript(source) {
  return source.replaceAll("</script", "<\\/script").replaceAll("</SCRIPT", "<\\/SCRIPT");
}

function cowartHostBridgeScript() {
  return `(() => {
  "use strict";

  const apps = globalThis.__COWART_MCP_APPS__;
  if (!apps || typeof apps.App !== "function") return;

  function publishHostGlobals(globals) {
    window.openai = Object.assign(window.openai || {}, globals);
    window.dispatchEvent(new CustomEvent("openai:set_globals", {
      detail: { globals: window.openai },
    }));
  }

  function payloadFromToolResult(result) {
    if (!result || typeof result !== "object") return {};
    const metadata = result._meta && typeof result._meta === "object" ? result._meta : {};
    return metadata.widgetData || result.structuredContent || result;
  }

  function handleToolResult(result) {
    const payload = payloadFromToolResult(result);
    if (typeof payload.canvasUrl === "string" && payload.canvasUrl) {
      window.__COWART_CANVAS_BASE_URL__ = payload.canvasUrl;
    }
    publishHostGlobals({
      rawToolResult: result,
      toolOutput: payload,
      widgetData: payload,
    });
    window.cowartMcp?.notifyResize?.();
  }

  function currentSize() {
    const root = document.documentElement;
    const body = document.body;
    return {
      width: Math.ceil(window.innerWidth || root.clientWidth || 0),
      height: Math.ceil(Math.max(
        root.scrollHeight || 0,
        root.offsetHeight || 0,
        body?.scrollHeight || 0,
        body?.offsetHeight || 0,
      )),
    };
  }

  let mcpApp = null;
  window.cowartMcp = {
    requestDisplayMode: async (request) => {
      if (!mcpApp || typeof mcpApp.requestDisplayMode !== "function") return {};
      return mcpApp.requestDisplayMode(typeof request === "string" ? { mode: request } : request);
    },
    notifyResize: () => {
      if (!mcpApp || typeof mcpApp.sendSizeChanged !== "function") return;
      try {
        mcpApp.sendSizeChanged(currentSize());
      } catch {}
    },
  };

  try {
    mcpApp = new apps.App(
      { name: "cowart-canvas-widget", version: ${JSON.stringify(SERVER_VERSION)} },
      { availableDisplayModes: ["inline", "fullscreen"] },
      { autoResize: true },
    );
    mcpApp.addEventListener("hostcontextchanged", (context) => {
      publishHostGlobals({
        hostContext: context,
        displayMode: context?.displayMode,
        availableDisplayModes: context?.availableDisplayModes,
      });
    });
    mcpApp.addEventListener("toolresult", handleToolResult);
    window.addEventListener("resize", () => window.cowartMcp.notifyResize());

    mcpApp.ready = mcpApp.connect()
      .then(() => {
        publishHostGlobals({
          hostContext: mcpApp.getHostContext && mcpApp.getHostContext(),
        });
        return window.cowartMcp.requestDisplayMode({ mode: "fullscreen" });
      })
      .then(() => window.cowartMcp.notifyResize())
      .catch(() => {});
  } catch {
    // The widget still works inline when the host Apps bridge is unavailable.
  }
})();`;
}

function resolveSelectionFile(args = {}) {
  const explicitCanvasDir = nonEmptyString(args.canvasDir);
  if (explicitCanvasDir) {
    return path.join(path.resolve(explicitCanvasDir), "cowart-selection.json");
  }

  const explicitProjectDir = nonEmptyString(args.projectDir);
  if (explicitProjectDir) {
    return path.join(path.resolve(explicitProjectDir), "canvas", "cowart-selection.json");
  }

  const envCanvasDir = nonEmptyString(process.env.COWART_CANVAS_DIR);
  if (envCanvasDir) {
    return path.join(path.resolve(envCanvasDir), "cowart-selection.json");
  }

  const envProjectDir = nonEmptyString(process.env.COWART_PROJECT_DIR);
  if (envProjectDir) {
    return path.join(path.resolve(envProjectDir), "canvas", "cowart-selection.json");
  }

  return path.join(process.cwd(), "canvas", "cowart-selection.json");
}

function cowartWidgetHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cowart Canvas</title>
    <style>
      * {
        box-sizing: border-box;
      }
      html,
      body,
      #root {
        width: 100%;
        height: 100%;
        min-height: 640px;
        margin: 0;
      }
      body {
        background: #f7f5ef;
        color: #1f2430;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow: hidden;
      }
      #root {
        display: grid;
        place-items: center;
      }
      #cowartWidgetStatus {
        max-width: 520px;
        padding: 24px;
        color: #4a5568;
        font-size: 13px;
        line-height: 1.45;
        text-align: center;
      }
    </style>
    <script id="cowartMcpAppsBundle">
      ${escapeInlineScript(mcpAppsGlobalScript())}
    </script>
    <script id="cowartMcpHostBridge">
      ${cowartHostBridgeScript()}
    </script>
  </head>
  <body>
    <div id="root">
      <main id="cowartWidgetStatus" aria-live="polite">Opening Cowart Canvas...</main>
    </div>
    <script id="cowartCanvasLoader">
      (() => {
        const fallbackUrl = ${JSON.stringify(DEFAULT_CANVAS_URL)};
        let latestCanvasUrl = "";
        let didStart = false;

        function payloadFromToolResult(result) {
          if (!result || typeof result !== "object") return {};
          const metadata = result._meta && typeof result._meta === "object" ? result._meta : {};
          return metadata.widgetData || result.structuredContent || result;
        }

        function normalizeCanvasUrl(value) {
          try {
            const url = new URL(value || fallbackUrl);
            if (!url.pathname.endsWith("/")) url.pathname += "/";
            return url.toString();
          } catch {
            return fallbackUrl;
          }
        }

        function rememberPayload(payload) {
          if (typeof payload?.canvasUrl === "string" && payload.canvasUrl) {
            latestCanvasUrl = payload.canvasUrl;
          }
        }

        function setStatus(message) {
          const status = document.getElementById("cowartWidgetStatus");
          if (status) status.textContent = message;
        }

        function assetUrl(canvasUrl, fileName) {
          return new URL("cowart-widget-assets/" + fileName, canvasUrl).toString();
        }

        async function fetchText(url, label) {
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(label + " returned " + response.status);
          }
          return response.text();
        }

        async function start() {
          if (didStart) return;
          didStart = true;
          const canvasUrl = normalizeCanvasUrl(latestCanvasUrl);
          window.__COWART_CANVAS_BASE_URL__ = canvasUrl;
          setStatus("Loading Cowart Canvas...");

          try {
            const [styleText, scriptText] = await Promise.all([
              fetchText(assetUrl(canvasUrl, "cowart-style.css"), "Cowart stylesheet"),
              fetchText(assetUrl(canvasUrl, "cowart-app.js"), "Cowart app bundle"),
            ]);

            const stylesheet = document.createElement("style");
            stylesheet.id = "cowartCanvasStyles";
            stylesheet.textContent = styleText;
            document.head.appendChild(stylesheet);

            const script = document.createElement("script");
            const scriptUrl = URL.createObjectURL(new Blob([scriptText], { type: "text/javascript" }));
            script.src = scriptUrl;
            script.async = false;
            script.addEventListener("load", () => {
              URL.revokeObjectURL(scriptUrl);
              window.cowartMcp?.notifyResize?.();
            });
            script.addEventListener("error", () => {
              URL.revokeObjectURL(scriptUrl);
              setStatus("Cowart Canvas could not run its app bundle.");
            });
            document.body.appendChild(script);
          } catch (error) {
            setStatus("Cowart Canvas could not load its app bundle.");
            console.error(error);
          }
        }

        window.addEventListener("openai:set_globals", (event) => {
          const globals = event.detail?.globals || {};
          rememberPayload(globals.widgetData);
          rememberPayload(globals.toolOutput);
          start();
        });
        window.addEventListener("message", (event) => {
          const result = event.data?.params?.result;
          if (event.data?.method !== "ui/notifications/tool-result" || !result) return;
          rememberPayload(payloadFromToolResult(result));
          start();
        });

        rememberPayload(window.openai?.widgetData);
        rememberPayload(window.openai?.toolOutput);
        window.setTimeout(start, 800);
      })();
    </script>
  </body>
</html>`;
}

async function readSelectionState(args) {
  const selectionFile = resolveSelectionFile(args);
  try {
    const selection = JSON.parse(await readFile(selectionFile, "utf8"));
    if (!selection || typeof selection !== "object" || !Array.isArray(selection.selectedShapes)) {
      throw new Error(`Invalid selection state in ${selectionFile}`);
    }
    return { selection, selectionFile };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        selection: { selectedShapes: [], updatedAt: null },
        selectionFile,
      };
    }
    throw error;
  }
}

function renderCowartWidget(args = {}) {
  const canvasUrl = normalizeCanvasUrl(args.canvasUrl ?? args.url);
  const projectDir = nonEmptyString(args.projectDir);

  return {
    content: [
      {
        type: "text",
        text: `Rendered Cowart canvas widget for ${canvasUrl}`,
      },
    ],
    structuredContent: {
      widget: "cowart-canvas",
      canvasUrl,
      projectDir,
    },
    _meta: {
      "openai/outputTemplate": WIDGET_URI,
      widgetData: {
        canvasUrl,
        projectDir,
      },
    },
  };
}

async function handleToolCall(id, params) {
  if (params?.name === TOOL_RENDER_WIDGET) {
    sendResult(id, renderCowartWidget(params.arguments ?? {}));
    return;
  }

  if (params?.name !== TOOL_GET_SELECTION) {
    sendError(id, JsonRpcError.INVALID_PARAMS, `Unknown tool: ${params?.name ?? ""}`);
    return;
  }

  const { selection, selectionFile } = await readSelectionState(params.arguments ?? {});
  const selectedShapes = selection.selectedShapes ?? [];
  const summary =
    selectedShapes.length === 0
      ? "No Cowart shapes are currently selected."
      : selectedShapes
          .map((shape) => {
            const assetName = shape.asset?.name ? ` (${shape.asset.name})` : "";
            return `${shape.id} [${shape.type ?? "unknown"}]${assetName}`;
          })
          .join("\n");

  sendResult(id, {
    content: [
      {
        type: "text",
        text: summary,
      },
    ],
    structuredContent: {
      selection,
      selectionFile,
    },
  });
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    sendResult(id, {
      protocolVersion: params?.protocolVersion ?? "2025-11-25",
      capabilities: { tools: {}, resources: {} },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      instructions:
        "Render and read Cowart canvas state. Use render_cowart_canvas_widget to show the running Cowart web app as a Codex widget, and get_cowart_selection with the current Codex project directory to inspect the canvas selection.",
    });
    return;
  }

  if (method === "ping") {
    sendResult(id, {});
    return;
  }

  if (method === "tools/list") {
    sendResult(id, {
      tools: [
        {
          name: TOOL_GET_SELECTION,
          title: "Get Cowart Selection",
          description:
            "Return the currently selected Cowart/tldraw shapes and image asset metadata from a project's canvas/cowart-selection.json state file.",
          inputSchema: {
            type: "object",
            properties: {
              projectDir: {
                type: "string",
                description:
                  "Absolute Cowart project directory. The tool reads <projectDir>/canvas/cowart-selection.json.",
              },
              canvasDir: {
                type: "string",
                description:
                  "Absolute canvas directory. If provided, this takes precedence over projectDir.",
              },
            },
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        {
          name: TOOL_RENDER_WIDGET,
          title: "Render Cowart Canvas Widget",
          description:
            "Render the running Cowart/tldraw local web app inside a Codex widget. Start the Cowart Vite service before calling this tool.",
          inputSchema: {
            type: "object",
            properties: {
              canvasUrl: {
                type: "string",
                description:
                  "Local Cowart canvas URL to embed. Defaults to http://127.0.0.1:43217/.",
              },
              projectDir: {
                type: "string",
                description:
                  "Absolute user project directory whose canvas data is being edited.",
              },
            },
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
          _meta: {
            ui: {
              resourceUri: WIDGET_URI,
              visibility: ["model", "app"],
            },
            "openai/outputTemplate": WIDGET_URI,
            "openai/widgetAccessible": true,
            "openai/toolInvocation/invoking": "Opening Cowart canvas...",
            "openai/toolInvocation/invoked": "Cowart canvas ready",
          },
        },
      ],
    });
    return;
  }

  if (method === "resources/list") {
    sendResult(id, {
      resources: [
        {
          uri: WIDGET_URI,
          name: "cowart-canvas-widget",
          title: "Cowart Canvas Widget",
          description: "Widget shell for the running Cowart tldraw canvas.",
          mimeType: WIDGET_MIME_TYPE,
          _meta: widgetMeta,
        },
      ],
    });
    return;
  }

  if (method === "resources/read") {
    if (params?.uri !== WIDGET_URI) {
      sendError(id, JsonRpcError.INVALID_PARAMS, `Unknown resource: ${params?.uri ?? ""}`);
      return;
    }

    sendResult(id, {
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: WIDGET_MIME_TYPE,
          text: cowartWidgetHtml(),
          _meta: widgetMeta,
        },
      ],
    });
    return;
  }

  if (method === "tools/call") {
    try {
      await handleToolCall(id, params);
    } catch (error) {
      sendError(id, JsonRpcError.INVALID_PARAMS, error instanceof Error ? error.message : String(error));
    }
    return;
  }

  if (id !== undefined) {
    sendError(id, JsonRpcError.METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

const lines = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

lines.on("line", (line) => {
  if (line.trim().length === 0) return;

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  handleRequest(message).catch((error) => {
    if (message.id !== undefined) {
      sendError(message.id, JsonRpcError.INVALID_PARAMS, error instanceof Error ? error.message : String(error));
    }
  });
});
