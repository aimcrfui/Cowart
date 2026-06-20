import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const SERVER_NAME = "Cowart MCP";
const SERVER_VERSION = "0.1.1";
const TOOL_GET_SELECTION = "get_cowart_selection";
const JsonRpcError = {
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
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

async function handleToolCall(id, params) {
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
      capabilities: { tools: {} },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      instructions:
        "Read Cowart canvas state. Use get_cowart_selection with the current Codex project directory to inspect the browser canvas selection persisted by the Cowart web app.",
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
