import {
  ArrowDownToolbarItem,
  ArrowLeftToolbarItem,
  ArrowRightToolbarItem,
  ArrowToolbarItem,
  ArrowUpToolbarItem,
  AssetToolbarItem,
  Box,
  CheckBoxToolbarItem,
  CloudToolbarItem,
  DefaultImageToolbar,
  DefaultImageToolbarContent,
  DefaultToolbar,
  DefaultColorStyle,
  DefaultStylePanel,
  DefaultStylePanelContent,
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EmbedShapeUtil,
  EraserToolbarItem,
  FrameToolbarItem,
  FrameShapeUtil,
  HandToolbarItem,
  HeartToolbarItem,
  HTMLContainer,
  HexagonToolbarItem,
  HighlightToolbarItem,
  LaserToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  OvalToolbarItem,
  RectangleToolbarItem,
  RhombusToolbarItem,
  SelectToolbarItem,
  StateNode,
  StarToolbarItem,
  TextToolbarItem,
  Tldraw,
  TldrawUiButton,
  TldrawUiButtonIcon,
  TldrawUiContextualToolbar,
  TldrawUiInput,
  TldrawUiMenuToolItem,
  TldrawUiToolbarButton,
  TriangleToolbarItem,
  XBoxToolbarItem,
  createShapeId,
  DEFAULT_EMBED_DEFINITIONS,
  onDragFromToolbarToCreateShape,
  startEditingShapeWithRichText,
  toRichText,
  toDomPrecision,
  useEditor,
  useIsEditing,
  useTranslation,
  useUiEvents,
  useValue
} from 'tldraw'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { AllSelection } from '@tiptap/pm/state'
import html2canvas from 'html2canvas'
import 'tldraw/tldraw.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import aiHtmlToolIconRaw from './assets/ai-html.svg?raw'
import aiImageToolIconRaw from './assets/ai-image.svg?raw'
import annotationToolIconRaw from './assets/tool-comment.svg?raw'
import {
  IS_COWART_WIDGET_BUILD,
  downloadCowartFile,
  hasCowartWidgetBridge,
  loadCowartCanvasState,
  readCowartPageAsset,
  refreshCowartCanvasSnapshot,
  saveCowartCanvasSnapshot,
  saveCowartReferenceImage,
  saveCowartSelectionState,
  saveCowartViewState,
  updateCowartHtmlDraft
} from './cowartClient.js'
import {
  describeSkippedRecord,
  isCanvasSnapshot,
  sanitizeCanvasSnapshotForTldraw
} from './canvasSnapshot.js'

const SELECTION_STATE_ELEMENT_ID = 'cowart-selection-state'
const PAGE_ASSETS_ROUTE = '/page-assets/'
const GLOBAL_ASSETS_ROUTE = '/assets/'
const AI_IMAGE_TOOL_ID = 'ai-image'
const AI_IMAGE_HOLDER_LABEL = 'AI 图片'
const AI_DRAFT_TOOL_ID = 'ai-draft'
const AI_DRAFT_HOLDER_LABEL = 'AI Html'
const AI_IMAGE_HOLDER_DEFAULT_W = 512
const AI_IMAGE_HOLDER_DEFAULT_H = 683
const AI_IMAGE_SIZE_MIN = 16
const AI_IMAGE_SIZE_MAX = 8192
const AI_IMAGE_GENERATION_PANEL_OFFSET = 14
const AI_IMAGE_GENERATION_PANEL_MIN_W = 520
const AI_IMAGE_GENERATION_PANEL_MAX_W = 640
const AI_IMAGE_GENERATION_PANEL_VIEWPORT_MARGIN = 16
const AI_IMAGE_GENERATION_PANEL_ESTIMATED_H = 226
const AI_IMAGE_GENERATION_STATUS_RESET_MS = 2200
const AI_IMAGE_REFERENCE_MAX_FILES = 10
const SKIPPED_RECORDS_NOTICE_AUTO_HIDE_MS = 5000
const COWART_HTML_DRAFT_URL_ORIGIN = 'http://cowart.local'
const COWART_HTML_DRAFT_EMBED_TYPE = 'cowart_html_draft'
const AI_IMAGE_ASPECT_PRESETS = [
  { id: '1-1', label: '1:1', w: 512, h: 512 },
  { id: '3-2', label: '3:2', w: 768, h: 512 },
  { id: '2-3', label: '2:3', w: 512, h: 768 },
  { id: '4-3', label: '4:3', w: 683, h: 512 },
  { id: '3-4', label: '3:4', w: 512, h: 683 },
  { id: '16-9', label: '16:9', w: 1024, h: 576 },
  { id: '9-16', label: '9:16', w: 512, h: 910 }
]
const ANNOTATION_TOOL_ID = 'cowart-annotation'
const ANNOTATION_TOOL_LABEL = '标注'
const ANNOTATION_DEFAULT_COLOR = 'red'
const ANNOTATION_MIN_LENGTH = 8
const ANNOTATION_BEND_RATIO = 0.12
const ANNOTATION_MIN_BEND = 16
const ANNOTATION_MAX_BEND = 48
const ANNOTATION_LABEL_POSITION = 0
const ANNOTATION_SELECT_TEXT_MAX_ATTEMPTS = 8
const ANNOTATION_SELECT_TEXT_SETTLE_ATTEMPTS = 4
const ANNOTATION_EDIT_TOOL_LABEL = '按标注修改'
const ANNOTATION_EDIT_PROMPT = [
  '[@cowart](plugin://cowart@personal) 按标注修改',
  '',
  '请根据这张 Cowart 截图里的标注修改当前选中的图片：',
  '- 截图包含当前图片，以及连到图片里或图片附近的标注箭头和标注文字。',
  '- 请把标注文字当作修改要求，生成一张新的干净图片。',
  '- 不要把标注箭头、标注文字、蓝色选框或工具栏带进最终图片。',
  '- 保留原图和原标注不动，把新图放到原图旁边。'
].join('\n')
const ANNOTATION_EDIT_EXPORT_PADDING = 32
const ANNOTATION_EDIT_NEAR_MARGIN_MIN = 160
const ANNOTATION_EDIT_NEAR_MARGIN_MAX = 720
const ANNOTATION_EDIT_RELATED_TEXT_MARGIN = 120
const ANNOTATION_EDIT_STATUS_RESET_MS = 2200
const ANNOTATION_EDIT_COLORS = new Set(['red', 'yellow', 'orange'])
const HTML_DRAFT_DOWNLOAD_LABEL = '下载原图'
const HTML_DRAFT_DOM_EDIT_LABEL = '编辑文本'
const HTML_DRAFT_DOM_EDIT_DONE_LABEL = '完成编辑'
const HTML_DRAFT_ANNOTATION_EDIT_LABEL = '按标注修改'
const HTML_DRAFT_ANNOTATION_IMAGE_LABEL = '按标注生图'
const HTML_DRAFT_ANNOTATION_EDIT_PROMPT = [
  '[@cowart](plugin://cowart@personal) 按标注修改 AI Html',
  '',
  '请根据这张 Cowart 截图里的标注修改当前选中的 HTML 草稿：',
  '- 截图包含当前 HTML 草稿，以及草稿周围的标注箭头和标注文字。',
  '- 请把标注文字当作修改要求，并以现有 HTML 源文件为基础修改。',
  '- 不要生成 bitmap，不要调用 imagegen，也不要调用 insert_cowart_image。',
  '- 不要把标注箭头、标注文字、蓝色选框或工具栏写进 HTML。',
  '- 保留原 HTML 草稿和原标注不动，创建一个修改后的新 HTML 草稿并放到原草稿右侧。',
  '- 不要覆盖原草稿的 HTML 文件、shape 或画布记录。'
].join('\n')
const HTML_DRAFT_ANNOTATION_IMAGE_PROMPT = [
  '[@cowart](plugin://cowart@personal) 按标注生图',
  '',
  '请使用内置 imagegen skill，根据这张 Cowart 截图里的 HTML 草稿和标注生成一张新的干净位图：',
  '- 截图包含当前 HTML 草稿，以及草稿周围的标注箭头和标注文字。',
  '- 请把标注文字当作生成要求，并保留草稿的主体、构图和纵横比，除非标注明确要求改变。',
  '- 不要修改 HTML，不要调用 insert_cowart_html_draft。',
  '- 不要把标注箭头、标注文字、蓝色选框或工具栏带进最终图片。',
  '- 保留原 HTML 草稿和原标注不动，把生成的图片放到草稿右侧。'
].join('\n')
const AI_IMAGE_GENERATION_PROMPT_PREFIX = [
  '[@cowart](plugin://cowart@personal) 生成图片',
  '',
  '请根据下面的 prompt 生成一张图片，并替换当前选中的 Cowart AI 图片框；最终画布里应留下普通图片形状，不保留 AI 图片框容器。',
  '如果附带一张或多张参考图，请把参考图作为视觉参考；不要把参考图文件名或任何界面元素画进最终图片。',
  '不需要选择生图模型，使用 Codex 当前可用的图片生成能力。'
].join('\n')
const AI_DRAFT_GENERATION_PROMPT_PREFIX = [
  '[@cowart](plugin://cowart@personal) 生成 AI Html',
  '',
  '请根据下面的 prompt 生成一个单文件 HTML 草稿，并把它嵌入当前选中的 Cowart AI Html 框。',
  '这不是图片生成任务：不要生成 bitmap，不要调用 insert_cowart_image。',
  '请生成完整可运行的 HTML 文档，CSS 和 JS 尽量内联，适合直接放进 iframe 预览。',
  '完成后调用 Cowart MCP 工具 insert_cowart_html_draft，把 htmlContent 写入当前 page 的 canvas/pages/<page-id>/assets/，并替换对应 AI Html 框为 HTML embed。'
].join('\n')
const aiImageToolIconSvg = aiImageToolIconRaw.replaceAll('black', 'currentColor')
const aiImageToolIcon = (
  <div
    aria-hidden="true"
    className="cowart-ai-frame-tool-icon"
    dangerouslySetInnerHTML={{ __html: aiImageToolIconSvg }}
  />
)
const aiHtmlToolIconSvg = aiHtmlToolIconRaw.replaceAll('black', 'currentColor')
const aiHtmlToolIcon = (
  <div
    aria-hidden="true"
    className="cowart-ai-frame-tool-icon"
    dangerouslySetInnerHTML={{ __html: aiHtmlToolIconSvg }}
  />
)
const annotationToolIconSvg = annotationToolIconRaw.replaceAll('black', 'currentColor')
const annotationToolIcon = (
  <div
    className="cowart-annotation-tool-icon"
    dangerouslySetInnerHTML={{ __html: annotationToolIconSvg }}
  />
)
const iconSvgSources = import.meta.glob(
  '../node_modules/@tldraw/assets/icons/icon/*.svg',
  { eager: true, query: '?raw', import: 'default' }
)
const cowartAssetUrls = buildCowartAssetUrls()
const cowartAssetObjectUrlCache = new Map()
const cowartAssetSourceKeys = new Map()
const cowartHtmlDraftIframes = new Map()
const cowartHtmlDraftDomEditSessions = new Map()

const cowartTldrawAssetStore = {
  upload: async (_asset, file) => ({ src: await readFileAsDataUrl(file) }),
  resolve: resolveCowartTldrawAssetUrl
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', revokeCowartAssetObjectUrls, { once: true })
}

function buildCowartAssetUrls() {
  const icons = {}
  for (const [path, source] of Object.entries(iconSvgSources)) {
    const name = path.split('/').pop().replace(/\.svg$/, '')
    icons[name] = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(source)))}`
  }
  let base = {}
  try {
    base = getAssetUrlsByImport()
  } catch (error) {
    console.warn('Cowart could not load bundled tldraw asset URLs.', error)
  }
  return { ...base, icons: { ...base.icons, ...icons } }
}

function isCowartLocalAssetUrl(src) {
  return typeof src === 'string' && (src.startsWith(PAGE_ASSETS_ROUTE) || src.startsWith(GLOBAL_ASSETS_ROUTE))
}

function isCowartHtmlDraftAssetUrl(src) {
  return typeof src === 'string' && src.startsWith(PAGE_ASSETS_ROUTE) && /\.html?(?:$|[?#])/i.test(src)
}

function isCowartHtmlDraftDataUrl(src) {
  return typeof src === 'string' && /^data:text\/html(?:;[^,]*)?,/i.test(src)
}

function cowartHtmlDraftAssetUrlFromVirtualUrl(src) {
  if (isCowartHtmlDraftAssetUrl(src)) return src
  if (typeof src !== 'string') return null

  try {
    const url = new URL(src)
    if (url.origin !== COWART_HTML_DRAFT_URL_ORIGIN) return null
    const assetUrl = `${url.pathname}${url.search}${url.hash}`
    return isCowartHtmlDraftAssetUrl(assetUrl) ? assetUrl : null
  } catch (_error) {
    return null
  }
}

function cowartHtmlDraftVirtualUrl(assetUrl) {
  const normalizedAssetUrl = cowartHtmlDraftAssetUrlFromVirtualUrl(assetUrl)
  return normalizedAssetUrl ? `${COWART_HTML_DRAFT_URL_ORIGIN}${normalizedAssetUrl}` : ''
}

function cowartAssetCacheKey(asset) {
  const src = asset?.props?.src ?? ''
  const fileSize = asset?.props?.fileSize ?? ''
  const mimeType = asset?.props?.mimeType ?? ''
  const name = asset?.props?.name ?? ''
  return [src, fileSize, mimeType, name].join('\u001f')
}

function revokeCowartCachedAsset(cacheKey) {
  const cached = cowartAssetObjectUrlCache.get(cacheKey)
  if (!cached) return
  URL.revokeObjectURL(cached.objectUrl)
  cowartAssetObjectUrlCache.delete(cacheKey)
  if (cowartAssetSourceKeys.get(cached.src) === cacheKey) {
    cowartAssetSourceKeys.delete(cached.src)
  }
}

function revokeCowartAssetObjectUrls() {
  for (const cacheKey of Array.from(cowartAssetObjectUrlCache.keys())) {
    revokeCowartCachedAsset(cacheKey)
  }
}

function blobFromBase64(dataBase64, mimeType) {
  const binary = window.atob(String(dataBase64 || ''))
  const chunks = []
  const chunkSize = 8192
  for (let offset = 0; offset < binary.length; offset += chunkSize) {
    const slice = binary.slice(offset, offset + chunkSize)
    const bytes = new Uint8Array(slice.length)
    for (let index = 0; index < slice.length; index += 1) {
      bytes[index] = slice.charCodeAt(index)
    }
    chunks.push(bytes)
  }
  return new Blob(chunks, { type: mimeType || 'application/octet-stream' })
}

async function resolveCowartTldrawAssetUrl(asset) {
  const src = asset?.props?.src
  if (!src) return null
  if (!hasCowartWidgetBridge() || !isCowartLocalAssetUrl(src)) return src

  const cacheKey = cowartAssetCacheKey(asset)
  const cached = cowartAssetObjectUrlCache.get(cacheKey)
  if (cached) return cached.objectUrl

  const previousKey = cowartAssetSourceKeys.get(src)
  if (previousKey && previousKey !== cacheKey) {
    revokeCowartCachedAsset(previousKey)
  }

  try {
    const pageAsset = await readCowartPageAsset(src)
    const objectUrl = URL.createObjectURL(blobFromBase64(pageAsset.dataBase64, pageAsset.mimeType))
    cowartAssetObjectUrlCache.set(cacheKey, { objectUrl, src })
    cowartAssetSourceKeys.set(src, cacheKey)
    return objectUrl
  } catch (error) {
    console.warn('Cowart could not resolve local page asset through MCP; falling back to source URL.', error)
    return src
  }
}

function recordsAreEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

const REMOTE_REMOVABLE_RECORD_TYPES = new Set(['asset', 'binding', 'shape'])

function isRemoteRemovableRecord(record) {
  return REMOTE_REMOVABLE_RECORD_TYPES.has(record?.typeName)
}

function storeChangedSinceSnapshot(editor, baselineStore) {
  const currentStore = editor.store.getStoreSnapshot().store
  const baselineIds = new Set(Object.keys(baselineStore))

  for (const [id, baselineRecord] of Object.entries(baselineStore)) {
    const currentRecord = currentStore[id]
    if (!currentRecord) return true
    if (!recordsAreEqual(currentRecord, baselineRecord)) return true
  }

  for (const id of Object.keys(currentStore)) {
    if (!baselineIds.has(id)) return true
  }

  return false
}

function applyRemoteCanvasSnapshot(editor, snapshot, { preserveLocalChanges = false } = {}) {
  if (!isCanvasSnapshot(snapshot)) return { changedRecords: 0, skippedRecords: [] }

  const sanitized = sanitizeCanvasSnapshotForTldraw(snapshot)
  if (!sanitized.snapshot) return { changedRecords: 0, skippedRecords: sanitized.skippedRecords }

  const recordsToPut = Object.values(sanitized.snapshot.store).filter((record) => {
    if (preserveLocalChanges) return false
    const localRecord = editor.store.get(record.id)
    if (!localRecord) return true
    return !recordsAreEqual(localRecord, record)
  })
  const remoteRecordIds = new Set(Object.keys(sanitized.snapshot.store))
  const recordsToRemove = preserveLocalChanges
    ? []
    : Object.values(editor.store.getStoreSnapshot().store)
        .filter((record) => isRemoteRemovableRecord(record) && !remoteRecordIds.has(record.id))
        .map((record) => record.id)

  if (recordsToPut.length === 0 && recordsToRemove.length === 0) {
    return { changedRecords: 0, skippedRecords: sanitized.skippedRecords }
  }

  let changedRecords = 0
  editor.store.mergeRemoteChanges(() => {
    if (recordsToRemove.length > 0) {
      editor.store.remove(recordsToRemove)
      changedRecords += recordsToRemove.length
    }
    for (const record of recordsToPut) {
      try {
        editor.store.put([record])
        changedRecords += 1
      } catch (error) {
        sanitized.skippedRecords.push(describeSkippedRecord(record, error))
      }
    }
  })

  return { changedRecords, skippedRecords: sanitized.skippedRecords }
}

function getAiImageHolderMeta() {
  return {
    cowartAiImageHolder: true,
    cowartAiImageHolderVersion: 1
  }
}

function getAiDraftHolderMeta() {
  return {
    cowartAiDraftHolder: true,
    cowartAiDraftHolderVersion: 1
  }
}

function isAiImageHolderShape(shape) {
  return shape?.type === 'frame' && shape.meta?.cowartAiImageHolder === true
}

function isAiDraftHolderShape(shape) {
  return shape?.type === 'frame' && shape.meta?.cowartAiDraftHolder === true
}

function isCowartAiHolderShape(shape) {
  return isAiImageHolderShape(shape) || isAiDraftHolderShape(shape)
}

function isCowartHtmlDraftEmbedShape(shape) {
  if (shape?.type !== 'embed') return false
  if (shape.meta?.cowartHtmlDraft === true) return true
  return Boolean(
    cowartHtmlDraftAssetUrlFromVirtualUrl(shape.props?.url) ||
      isCowartHtmlDraftDataUrl(shape.props?.url)
  )
}

function isImageShape(shape) {
  return shape?.type === 'image'
}

function isImageShapeRecord(record) {
  return record?.typeName === 'shape' && record.type === 'image'
}

function recordValues(records) {
  return Object.values(records || {})
}

function collectRemovedImageShapeIds(changes) {
  const imageShapeIds = []
  for (const removedRecord of recordValues(changes?.removed)) {
    if (isImageShapeRecord(removedRecord)) imageShapeIds.push(removedRecord.id)
  }
  return imageShapeIds
}

function isAiImageAspectLocked(shape) {
  return isCowartAiHolderShape(shape) && shape.meta?.cowartAiAspectLocked === true
}

function clampAiImageSize(value) {
  if (!Number.isFinite(value)) return null
  return Math.round(Math.min(Math.max(value, AI_IMAGE_SIZE_MIN), AI_IMAGE_SIZE_MAX))
}

function getAiImageAspectRatio(shape) {
  const metaRatio = Number(shape?.meta?.cowartAiAspectRatio)
  if (Number.isFinite(metaRatio) && metaRatio > 0) return metaRatio

  const w = Number(shape?.props?.w)
  const h = Number(shape?.props?.h)
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null

  return w / h
}

function getAiImageAspectPreset(shape) {
  if (!shape?.props) return null

  const w = Number(shape.props.w)
  const h = Number(shape.props.h)
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null

  const shapeRatio = w / h
  return (
    AI_IMAGE_ASPECT_PRESETS.find((preset) => {
      const presetRatio = preset.w / preset.h
      return Math.abs(shapeRatio - presetRatio) < 0.01
    }) ?? null
  )
}

function formatAiImageSize(value) {
  return String(Math.round(Number.isFinite(value) ? value : 0))
}

function getAspectIconStyle(preset) {
  const maxSize = 22
  const scale = Math.min(maxSize / preset.w, maxSize / preset.h)
  return {
    width: `${Math.max(8, Math.round(preset.w * scale))}px`,
    height: `${Math.max(8, Math.round(preset.h * scale))}px`
  }
}

function createAiImageHolderShape(editor, id, shapeOverrides = {}) {
  const scale = editor.getResizeScaleFactor()
  const { meta, props, ...shapeRecordOverrides } = shapeOverrides
  const { scale: _scale, ...frameProps } = props ?? {}

  return editor.createShape({
    ...shapeRecordOverrides,
    id,
    type: 'frame',
    meta: {
      ...getAiImageHolderMeta(),
      ...meta
    },
    props: {
      w: AI_IMAGE_HOLDER_DEFAULT_W * scale,
      h: AI_IMAGE_HOLDER_DEFAULT_H * scale,
      name: AI_IMAGE_HOLDER_LABEL,
      color: 'blue',
      ...frameProps
    }
  })
}

function createAiImageHolderAtViewportCenter(editor) {
  const scale = editor.getResizeScaleFactor()
  const w = AI_IMAGE_HOLDER_DEFAULT_W * scale
  const h = AI_IMAGE_HOLDER_DEFAULT_H * scale
  const center = editor.getViewportPageBounds().center
  const id = createShapeId()

  createAiImageHolderShape(editor, id, {
    x: center.x - w / 2,
    y: center.y - h / 2,
    props: { w, h }
  })
  editor.select(id)
  editor.setCurrentTool('select.idle')
}

function createAiDraftHolderShape(editor, id, shapeOverrides = {}) {
  const scale = editor.getResizeScaleFactor()
  const { meta, props, ...shapeRecordOverrides } = shapeOverrides
  const { scale: _scale, ...frameProps } = props ?? {}

  return editor.createShape({
    ...shapeRecordOverrides,
    id,
    type: 'frame',
    meta: {
      ...getAiDraftHolderMeta(),
      ...meta
    },
    props: {
      w: AI_IMAGE_HOLDER_DEFAULT_W * scale,
      h: AI_IMAGE_HOLDER_DEFAULT_H * scale,
      name: AI_DRAFT_HOLDER_LABEL,
      color: 'blue',
      ...frameProps
    }
  })
}

function createAiDraftHolderAtViewportCenter(editor) {
  const scale = editor.getResizeScaleFactor()
  const w = AI_IMAGE_HOLDER_DEFAULT_W * scale
  const h = AI_IMAGE_HOLDER_DEFAULT_H * scale
  const center = editor.getViewportPageBounds().center
  const id = createShapeId()

  createAiDraftHolderShape(editor, id, {
    x: center.x - w / 2,
    y: center.y - h / 2,
    props: { w, h }
  })
  editor.select(id)
  editor.setCurrentTool('select.idle')
}

function startEditingAnnotationArrowLabel(editor, arrowId) {
  const shape = editor.getShape(arrowId)
  if (!shape || !editor.canEditShape(shape)) {
    return
  }

  editor.select(arrowId)
  startEditingShapeWithRichText(editor, arrowId, { selectAll: true })
  pinAnnotationArrowLabelPosition(editor, arrowId)
  editor.getCurrentTool().setCurrentToolIdMask(ANNOTATION_TOOL_ID)
  selectAnnotationTextWhenReady(editor, arrowId)
}

function pinAnnotationArrowLabelPosition(editor, arrowId, attempt = 0) {
  editor.timers.setTimeout(() => {
    const shape = editor.getShape(arrowId)
    if (!shape || shape.meta?.cowartAnnotationArrow !== true) return
    if (shape.props.labelPosition !== ANNOTATION_LABEL_POSITION) {
      editor.updateShapes([
        {
          id: arrowId,
          type: 'arrow',
          props: {
            labelPosition: ANNOTATION_LABEL_POSITION
          }
        }
      ])
    }

    if (attempt < 2 && editor.getEditingShapeId() === arrowId) {
      pinAnnotationArrowLabelPosition(editor, arrowId, attempt + 1)
    }
  }, 16)
}

function unlockGlobalToolLock(editor) {
  if (!editor.getInstanceState().isToolLocked) return
  editor.updateInstanceState({ isToolLocked: false })
}

function selectAnnotationTextWhenReady(editor, arrowId, attempt = 0) {
  editor.timers.setTimeout(() => {
    const editingShapeId = editor.getEditingShapeId()
    if (editingShapeId !== arrowId) return

    const textEditor = editor.getRichTextEditor()
    if (textEditor) {
      textEditor.view.focus()
      textEditor.view.dispatch(
        textEditor.state.tr.setSelection(new AllSelection(textEditor.state.doc)).scrollIntoView()
      )
    }

    const didSelectText = selectAnnotationTextRange(editor, arrowId)
    if (didSelectText && attempt >= ANNOTATION_SELECT_TEXT_SETTLE_ATTEMPTS) {
      return
    }

    if (attempt < ANNOTATION_SELECT_TEXT_MAX_ATTEMPTS) {
      selectAnnotationTextWhenReady(editor, arrowId, attempt + 1)
    }
  }, 16)
}

function selectAnnotationTextRange(editor, arrowId) {
  const doc = editor.getContainerDocument()
  const shapeElement = Array.from(doc.querySelectorAll('[data-shape-id]')).find(
    (element) => element.getAttribute('data-shape-id') === arrowId
  )
  const editable = shapeElement?.querySelector('[contenteditable="true"]')

  if (!editable || typeof editable.focus !== 'function') {
    return false
  }

  editable.focus()

  const textNodes = getTextNodes(editable)
  if (textNodes.length === 0) {
    return doc.activeElement === editable || editable.contains(doc.activeElement)
  }

  const range = doc.createRange()
  const firstTextNode = textNodes[0]
  const lastTextNode = textNodes[textNodes.length - 1]
  range.setStart(firstTextNode, 0)
  range.setEnd(lastTextNode, lastTextNode.textContent?.length ?? 0)

  const selection = doc.getSelection()
  if (!selection) return false

  selection.removeAllRanges()
  selection.addRange(range)
  doc.execCommand?.('selectAll')

  return selection.rangeCount > 0 && selection.toString() === editable.textContent
}

function getTextNodes(node, textNodes = []) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent) {
      textNodes.push(child)
    } else {
      getTextNodes(child, textNodes)
    }
  }

  return textNodes
}

function getDefaultAnnotationArrowBend(dx, dy, scale) {
  const length = Math.hypot(dx, dy)
  if (length === 0) return 0

  const bend = Math.min(
    Math.max(length * ANNOTATION_BEND_RATIO, ANNOTATION_MIN_BEND * scale),
    ANNOTATION_MAX_BEND * scale
  )

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? -bend : bend
  }

  return bend
}

function getAnnotationColor(editor) {
  const color = editor.getStyleForNextShape(DefaultColorStyle)
  return color === DefaultColorStyle.defaultValue ? ANNOTATION_DEFAULT_COLOR : color
}

function expandBox(bounds, padding) {
  return new Box(
    bounds.x - padding,
    bounds.y - padding,
    bounds.w + padding * 2,
    bounds.h + padding * 2
  )
}

function annotationEditNearMargin(targetBounds) {
  return Math.min(
    ANNOTATION_EDIT_NEAR_MARGIN_MAX,
    Math.max(ANNOTATION_EDIT_NEAR_MARGIN_MIN, Math.max(targetBounds.w, targetBounds.h))
  )
}

function shapeHasAnnotationColor(shape) {
  const color = shape?.props?.color
  const labelColor = shape?.props?.labelColor
  return ANNOTATION_EDIT_COLORS.has(color) || ANNOTATION_EDIT_COLORS.has(labelColor)
}

function isAnnotationArrowShape(shape) {
  return shape?.type === 'arrow' && (shape.meta?.cowartAnnotationArrow === true || shapeHasAnnotationColor(shape))
}

function isAnnotationTextShape(shape) {
  return shape?.type === 'text' && (shape.meta?.cowartAnnotationText === true || shapeHasAnnotationColor(shape))
}

function uniqueShapeIds(shapeIds) {
  return Array.from(new Set(shapeIds.filter(Boolean)))
}

function collectAnnotationTargetShapeIds(editor, targetShapeId, isTargetShape, invalidTargetMessage) {
  const targetShape = editor.getShape(targetShapeId)
  if (!isTargetShape(targetShape)) {
    throw new Error(invalidTargetMessage)
  }

  const targetBounds = editor.getShapePageBounds(targetShapeId)
  if (!targetBounds) {
    throw new Error('无法读取当前内容的画布位置。')
  }

  const nearBounds = expandBox(targetBounds, annotationEditNearMargin(targetBounds))
  const relatedArrowIds = []
  const relatedArrowBounds = []
  const relatedTextIds = []

  for (const shape of editor.getCurrentPageShapesSorted()) {
    if (!shape || shape.id === targetShapeId) continue

    const bounds = editor.getShapePageBounds(shape)
    if (!bounds) continue

    if (isAnnotationArrowShape(shape) && nearBounds.collides(bounds)) {
      relatedArrowIds.push(shape.id)
      relatedArrowBounds.push(bounds)
      continue
    }

    if (!isAnnotationTextShape(shape)) continue

    if (nearBounds.collides(bounds)) {
      relatedTextIds.push(shape.id)
      continue
    }

    if (
      relatedArrowBounds.some((arrowBounds) =>
        expandBox(arrowBounds, ANNOTATION_EDIT_RELATED_TEXT_MARGIN).collides(bounds)
      )
    ) {
      relatedTextIds.push(shape.id)
    }
  }

  return uniqueShapeIds([targetShapeId, ...relatedArrowIds, ...relatedTextIds])
}

function collectAnnotationEditShapeIds(editor, imageShapeId) {
  return collectAnnotationTargetShapeIds(
    editor,
    imageShapeId,
    isImageShape,
    '请选择一张图片后再按标注修改。'
  )
}

function collectHtmlDraftAnnotationShapeIds(editor, draftShapeId) {
  return collectAnnotationTargetShapeIds(
    editor,
    draftShapeId,
    isCowartHtmlDraftEmbedShape,
    '请选择一个已生成 HTML 的 AI Html。'
  )
}

function buildAnnotationEditPrompt({ imageShapeId, shapeIds, exportWidth, exportHeight, screenshotAsset }) {
  const annotationCount = Math.max(0, shapeIds.length - 1)
  const lines = [
    ANNOTATION_EDIT_PROMPT,
    '',
    `Cowart source image shape: ${imageShapeId}`,
    `Included annotation shapes: ${annotationCount}`,
    `Screenshot size: ${Math.round(exportWidth)}x${Math.round(exportHeight)}`
  ]

  if (screenshotAsset?.assetPath) {
    lines.push(
      `Annotation screenshot local path: ${screenshotAsset.assetPath}`,
      'Use this local screenshot file as the authoritative visual reference for the requested edits.'
    )
  }

  return lines.join('\n')
}

function getAnnotationEditExportPixelRatio(bounds) {
  const maxDimension = Math.max(bounds.w, bounds.h)
  if (maxDimension > 1600) return 1
  if (maxDimension > 1000) return 1.5
  return 2
}

function annotationEditScreenshotFileName() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `annotation-edit-${timestamp}.png`
}

function dataUrlToImageContent(dataUrl, meta = {}) {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) {
    throw new Error('导出的截图不是有效的图片 data URL。')
  }

  return {
    type: 'image',
    data: match[2],
    mimeType: match[1],
    _meta: meta
  }
}

function followUpSender() {
  if (typeof window.cowartMcp?.sendFollowUpMessage === 'function') {
    return (message) => window.cowartMcp.sendFollowUpMessage(message)
  }
  if (typeof window.openai?.sendFollowUpMessage === 'function') {
    return (message) => window.openai.sendFollowUpMessage(message)
  }
  return null
}

function cowartHostCapabilities() {
  try {
    return (
      window.cowartMcp?.getHostCapabilities?.() ||
      window.openai?.hostCapabilities ||
      globalThis.__COWART_MCP_APP__?.getHostCapabilities?.() ||
      null
    )
  } catch (_error) {
    return null
  }
}

function supportsCowartMessageImages() {
  return Boolean(cowartHostCapabilities()?.message?.image)
}

async function sendAnnotationEditRequest(editor, imageShapeId) {
  const shapeIds = collectAnnotationEditShapeIds(editor, imageShapeId)
  const rawBounds = editor.getShapesPageBounds(shapeIds)
  if (!rawBounds) throw new Error('无法计算截图范围。')

  const exportBounds = expandBox(rawBounds, ANNOTATION_EDIT_EXPORT_PADDING)
  const exportResult = await editor.toImageDataUrl(shapeIds, {
    bounds: exportBounds,
    background: true,
    darkMode: false,
    format: 'png',
    padding: 0,
    pixelRatio: getAnnotationEditExportPixelRatio(exportBounds)
  })
  const screenshotAsset = await saveCowartReferenceImage({
    anchorShapeId: imageShapeId,
    fileName: annotationEditScreenshotFileName(),
    dataUrl: exportResult.url,
    mimeType: 'image/png'
  })
  const prompt = buildAnnotationEditPrompt({
    imageShapeId,
    shapeIds,
    exportWidth: exportResult.width,
    exportHeight: exportResult.height,
    screenshotAsset
  })
  const sender = followUpSender()
  if (!sender) {
    throw new Error('当前 Cowart 画布没有可用的 Codex MCP 消息桥。')
  }

  const content = [{ type: 'text', text: prompt }]

  if (supportsCowartMessageImages()) {
    content.push(
      dataUrlToImageContent(exportResult.url, {
        cowartAnnotationEdit: true,
        cowartSourceImageShapeId: imageShapeId,
        cowartIncludedShapeIds: shapeIds,
        cowartAnnotationScreenshotPath: screenshotAsset.assetPath || null,
        cowartAnnotationScreenshotFileName: screenshotAsset.fileName || null
      })
    )
  }

  return sender({ prompt, content })
}

async function waitForHtmlDraftDocument(shapeId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const iframe = cowartHtmlDraftIframes.get(shapeId)
    try {
      const iframeDocument = iframe?.contentDocument
      if (iframeDocument?.documentElement && iframeDocument.readyState !== 'loading') {
        return iframeDocument
      }
    } catch (_error) {
      // The iframe is briefly cross-origin while its same-origin blob URL is being prepared.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50))
  }

  throw new Error('HTML 草稿仍在加载，请稍后重试。')
}

const COWART_DOM_EDITOR_STYLE_ID = 'cowart-dom-editor-style'
const COWART_DOM_EDITOR_ACTIVE_ATTRIBUTE = 'data-cowart-dom-editor-active'
const COWART_DOM_EDITOR_HOVER_ATTRIBUTE = 'data-cowart-dom-editor-hover'
const COWART_DOM_EDITOR_SELECTED_ATTRIBUTE = 'data-cowart-dom-editor-selected'
const COWART_DOM_EDITOR_EDITABLE_ATTRIBUTE = 'data-cowart-dom-editor-editable'
const COWART_DOM_EDITOR_ADDED_CONTENTEDITABLE_ATTRIBUTE =
  'data-cowart-dom-editor-added-contenteditable'

function cowartHtmlDraftDataUrl(htmlContent) {
  const bytes = new TextEncoder().encode(String(htmlContent || ''))
  const chunks = []
  const chunkSize = 8192
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)))
  }
  return `data:text/html;base64,${window.btoa(chunks.join(''))}`
}

function serializeHtmlDoctype(doctype) {
  if (!doctype) return '<!doctype html>'
  let result = `<!DOCTYPE ${doctype.name}`
  if (doctype.publicId) result += ` PUBLIC "${doctype.publicId}"`
  if (doctype.systemId) result += doctype.publicId ? ` "${doctype.systemId}"` : ` SYSTEM "${doctype.systemId}"`
  return `${result}>`
}

function serializeCowartHtmlDraftDocument(iframeDocument) {
  const root = iframeDocument.documentElement.cloneNode(true)
  root.removeAttribute(COWART_DOM_EDITOR_ACTIVE_ATTRIBUTE)
  root.querySelector(`#${COWART_DOM_EDITOR_STYLE_ID}`)?.remove()
  for (const element of root.querySelectorAll(
    `[${COWART_DOM_EDITOR_HOVER_ATTRIBUTE}],` +
      `[${COWART_DOM_EDITOR_SELECTED_ATTRIBUTE}],` +
      `[${COWART_DOM_EDITOR_EDITABLE_ATTRIBUTE}],` +
      `[${COWART_DOM_EDITOR_ADDED_CONTENTEDITABLE_ATTRIBUTE}]`
  )) {
    element.removeAttribute(COWART_DOM_EDITOR_HOVER_ATTRIBUTE)
    element.removeAttribute(COWART_DOM_EDITOR_SELECTED_ATTRIBUTE)
    element.removeAttribute(COWART_DOM_EDITOR_EDITABLE_ATTRIBUTE)
    if (element.hasAttribute(COWART_DOM_EDITOR_ADDED_CONTENTEDITABLE_ATTRIBUTE)) {
      element.removeAttribute('contenteditable')
      element.removeAttribute('spellcheck')
      element.removeAttribute(COWART_DOM_EDITOR_ADDED_CONTENTEDITABLE_ATTRIBUTE)
    }
  }
  return `${serializeHtmlDoctype(iframeDocument.doctype)}\n${root.outerHTML}`
}

function isCowartDomTextElement(element) {
  if (!element || ['HTML', 'BODY', 'SCRIPT', 'STYLE', 'SVG', 'CANVAS', 'IMG', 'VIDEO'].includes(element.tagName)) {
    return false
  }
  if (!element.textContent?.trim()) return false
  return Array.from(element.childNodes).some(
    (node) => node.nodeType === window.Node.TEXT_NODE && node.textContent?.trim()
  )
}

function cowartDomSelectionTarget(target, iframeDocument) {
  const ElementClass = iframeDocument.defaultView?.Element
  if (!ElementClass || !(target instanceof ElementClass)) return null
  if (target.closest('script, style, link, meta, title, noscript')) return null
  return target.closest('svg') || target
}

function placeCowartDomCaret(iframeDocument, element, clientX, clientY) {
  const selection = iframeDocument.getSelection()
  if (!selection) return

  let range = iframeDocument.caretRangeFromPoint?.(clientX, clientY) || null
  if (!range || !element.contains(range.startContainer)) {
    range = iframeDocument.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
  }
  selection.removeAllRanges()
  selection.addRange(range)
}

function captureCowartDomTextSelection(iframeDocument) {
  const selection = iframeDocument.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

  return {
    anchorNode: selection.anchorNode,
    anchorOffset: selection.anchorOffset,
    focusNode: selection.focusNode,
    focusOffset: selection.focusOffset,
    ranges: Array.from({ length: selection.rangeCount }, (_, index) =>
      selection.getRangeAt(index).cloneRange()
    )
  }
}

function restoreCowartDomTextSelection(iframeDocument, selectionSnapshot) {
  if (!selectionSnapshot) return false
  const selection = iframeDocument.getSelection()
  if (!selection) return false

  selection.removeAllRanges()
  if (
    typeof selection.setBaseAndExtent === 'function' &&
    selectionSnapshot.anchorNode?.isConnected &&
    selectionSnapshot.focusNode?.isConnected
  ) {
    selection.setBaseAndExtent(
      selectionSnapshot.anchorNode,
      selectionSnapshot.anchorOffset,
      selectionSnapshot.focusNode,
      selectionSnapshot.focusOffset
    )
    return true
  }

  for (const range of selectionSnapshot.ranges) selection.addRange(range)
  return selection.rangeCount > 0 && !selection.isCollapsed
}

function createCowartHtmlDraftDomEditorSession(iframeDocument, { onSave, onRequestExit }) {
  const style = iframeDocument.createElement('style')
  style.id = COWART_DOM_EDITOR_STYLE_ID
  style.textContent = `
    [${COWART_DOM_EDITOR_HOVER_ATTRIBUTE}]:not([${COWART_DOM_EDITOR_SELECTED_ATTRIBUTE}]) {
      outline: 1px dashed #2f80ed !important;
      outline-offset: 2px !important;
    }
    [${COWART_DOM_EDITOR_SELECTED_ATTRIBUTE}] {
      outline: 2px solid #2f80ed !important;
      outline-offset: 2px !important;
    }
    [${COWART_DOM_EDITOR_EDITABLE_ATTRIBUTE}] {
      cursor: text !important;
    }
  `
  iframeDocument.head?.append(style)
  iframeDocument.documentElement.setAttribute(COWART_DOM_EDITOR_ACTIVE_ATTRIBUTE, 'true')

  let selectedElement = null
  let hoveredElement = null
  let revision = 0
  let savedRevision = 0
  let savePromise = null

  function clearHoveredElement() {
    hoveredElement?.removeAttribute(COWART_DOM_EDITOR_HOVER_ATTRIBUTE)
    hoveredElement = null
  }

  function clearSelectedElement() {
    if (!selectedElement) return
    selectedElement.removeAttribute(COWART_DOM_EDITOR_SELECTED_ATTRIBUTE)
    selectedElement.removeAttribute(COWART_DOM_EDITOR_EDITABLE_ATTRIBUTE)
    if (selectedElement.hasAttribute(COWART_DOM_EDITOR_ADDED_CONTENTEDITABLE_ATTRIBUTE)) {
      selectedElement.removeAttribute('contenteditable')
      selectedElement.removeAttribute('spellcheck')
      selectedElement.removeAttribute(COWART_DOM_EDITOR_ADDED_CONTENTEDITABLE_ATTRIBUTE)
    }
    selectedElement = null
  }

  function selectElement(element, event) {
    const textSelection = captureCowartDomTextSelection(iframeDocument)
    if (selectedElement !== element) clearSelectedElement()
    selectedElement = element
    selectedElement.setAttribute(COWART_DOM_EDITOR_SELECTED_ATTRIBUTE, 'true')

    if (!isCowartDomTextElement(selectedElement)) return
    selectedElement.setAttribute(COWART_DOM_EDITOR_EDITABLE_ATTRIBUTE, 'true')
    if (!selectedElement.hasAttribute('contenteditable')) {
      selectedElement.setAttribute('contenteditable', 'plaintext-only')
      selectedElement.setAttribute('spellcheck', 'false')
      selectedElement.setAttribute(COWART_DOM_EDITOR_ADDED_CONTENTEDITABLE_ATTRIBUTE, 'true')
    }
    selectedElement.focus({ preventScroll: true })
    if (!restoreCowartDomTextSelection(iframeDocument, textSelection)) {
      placeCowartDomCaret(iframeDocument, selectedElement, event.clientX, event.clientY)
    }
  }

  function handlePointerOver(event) {
    const nextElement = cowartDomSelectionTarget(event.target, iframeDocument)
    if (!nextElement || nextElement === selectedElement || nextElement === hoveredElement) return
    clearHoveredElement()
    hoveredElement = nextElement
    hoveredElement.setAttribute(COWART_DOM_EDITOR_HOVER_ATTRIBUTE, 'true')
  }

  function handlePointerOut(event) {
    if (hoveredElement && !hoveredElement.contains(event.relatedTarget)) clearHoveredElement()
  }

  function handleClick(event) {
    const element = cowartDomSelectionTarget(event.target, iframeDocument)
    if (!element) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    clearHoveredElement()
    selectElement(element, event)
  }

  function handleInput(event) {
    if (!selectedElement || !selectedElement.contains(event.target)) return
    revision += 1
  }

  function handleKeyDown(event) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onRequestExit()
  }

  iframeDocument.addEventListener('pointerover', handlePointerOver, true)
  iframeDocument.addEventListener('pointerout', handlePointerOut, true)
  iframeDocument.addEventListener('click', handleClick, true)
  iframeDocument.addEventListener('input', handleInput, true)
  iframeDocument.addEventListener('keydown', handleKeyDown, true)

  async function flush() {
    if (savePromise) await savePromise
    if (revision === savedRevision) return null

    const targetRevision = revision
    const htmlContent = serializeCowartHtmlDraftDocument(iframeDocument)
    savePromise = Promise.resolve(onSave(htmlContent))
    try {
      const result = await savePromise
      savedRevision = targetRevision
      if (revision > savedRevision) return flush()
      return result
    } finally {
      savePromise = null
    }
  }

  function dispose({ save = true } = {}) {
    const pendingSave = save ? flush() : Promise.resolve(null)
    iframeDocument.removeEventListener('pointerover', handlePointerOver, true)
    iframeDocument.removeEventListener('pointerout', handlePointerOut, true)
    iframeDocument.removeEventListener('click', handleClick, true)
    iframeDocument.removeEventListener('input', handleInput, true)
    iframeDocument.removeEventListener('keydown', handleKeyDown, true)
    clearHoveredElement()
    clearSelectedElement()
    iframeDocument.documentElement.removeAttribute(COWART_DOM_EDITOR_ACTIVE_ATTRIBUTE)
    style.remove()
    return pendingSave
  }

  return { dispose, flush }
}

async function waitForHtmlDraftAssets(iframeDocument) {
  const pending = []
  if (iframeDocument.fonts?.ready) pending.push(iframeDocument.fonts.ready.catch(() => undefined))

  for (const image of Array.from(iframeDocument.images || [])) {
    if (image.complete) {
      if (typeof image.decode === 'function') pending.push(image.decode().catch(() => undefined))
      continue
    }
    pending.push(
      new Promise((resolve) => {
        const finish = () => resolve()
        image.addEventListener('load', finish, { once: true })
        image.addEventListener('error', finish, { once: true })
      })
    )
  }

  await Promise.race([
    Promise.all(pending),
    new Promise((resolve) => window.setTimeout(resolve, 1500))
  ])
}

function loadRasterImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener('error', () => reject(new Error('HTML 草稿无法转换成图片。')), {
      once: true
    })
    image.src = src
  })
}

function getCowartHtmlDraftAssetUrl(shape) {
  return (
    cowartHtmlDraftAssetUrlFromVirtualUrl(shape?.meta?.cowartHtmlDraftAssetUrl) ||
    cowartHtmlDraftAssetUrlFromVirtualUrl(shape?.props?.url) ||
    null
  )
}

function getCowartHtmlDraftLocalPath(shape) {
  const projectDir = window.openai?.toolOutput?.projectDir
  const assetUrl = getCowartHtmlDraftAssetUrl(shape)
  const match = assetUrl?.match(/^\/page-assets\/([^/]+)\/(.+)$/)
  if (!projectDir || !match) return null

  try {
    return `${projectDir}/canvas/pages/${decodeURIComponent(match[1])}/assets/${decodeURIComponent(match[2])}`
  } catch (_error) {
    return null
  }
}

async function renderCowartHtmlDraftCanvas(shape, pixelRatio) {
  if (!isCowartHtmlDraftEmbedShape(shape)) {
    throw new Error('请选择一个已生成 HTML 的 AI Html。')
  }

  const iframeDocument = await waitForHtmlDraftDocument(shape.id)
  await waitForHtmlDraftAssets(iframeDocument)

  const width = Math.max(1, Number(shape.props.w) || AI_IMAGE_HOLDER_DEFAULT_W)
  const height = Math.max(1, Number(shape.props.h) || AI_IMAGE_HOLDER_DEFAULT_H)
  const captureRatio = Math.max(1, Number(pixelRatio) || 1)
  const canvas = await html2canvas(iframeDocument.documentElement, {
    allowTaint: false,
    backgroundColor: '#ffffff',
    height,
    logging: false,
    onclone(clonedDocument) {
      clonedDocument.querySelectorAll('script').forEach((script) => script.remove())
      const captureStyle = clonedDocument.createElement('style')
      captureStyle.textContent = `
        html, body { width: ${width}px !important; height: ${height}px !important; }
        *, *::before, *::after { animation-play-state: paused !important; caret-color: transparent !important; }
      `
      clonedDocument.head?.append(captureStyle)
    },
    scale: captureRatio,
    scrollX: 0,
    scrollY: 0,
    useCORS: true,
    width,
    windowHeight: height,
    windowWidth: width,
    x: 0,
    y: 0
  })
  return {
    canvas,
    url: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
    displayWidth: width,
    displayHeight: height,
    pixelRatio: captureRatio
  }
}

function htmlDraftDownloadFileName(shape) {
  const assetUrl = getCowartHtmlDraftAssetUrl(shape)
  const rawName = assetUrl?.split('/').pop()?.split(/[?#]/)[0]
  let htmlName = 'ai-draft.html'
  if (rawName) {
    try {
      htmlName = decodeURIComponent(rawName)
    } catch (_error) {
      htmlName = rawName
    }
  }
  return htmlName.replace(/\.html?$/i, '') + '.png'
}

function downloadDataUrl(dataUrl, fileName) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}

async function downloadCowartImageShape(editor, imageShape) {
  const asset = imageShape?.props?.assetId ? editor.getAsset(imageShape.props.assetId) : null
  const sourceUrl = asset?.props?.src
  if (!asset || !sourceUrl) throw new Error('当前图片没有可下载的原始文件。')

  const fileName = asset.props.name || 'cowart-image.png'
  if (sourceUrl.startsWith(PAGE_ASSETS_ROUTE)) {
    return downloadCowartFile({ assetUrl: sourceUrl, fileName })
  }

  let dataUrl = sourceUrl
  if (!sourceUrl.startsWith('data:')) {
    const resolvedUrl = await editor.resolveAssetUrl(asset.id, { shouldResolveToOriginal: true })
    if (!resolvedUrl) throw new Error('无法读取当前图片的原始文件。')
    const response = await window.fetch(resolvedUrl)
    if (!response.ok) throw new Error(`读取当前图片失败：${response.status}`)
    dataUrl = await readFileAsDataUrl(await response.blob())
  }

  return downloadCowartFile({
    dataUrl,
    fileName,
    mimeType: asset.props.mimeType || undefined
  })
}

async function downloadCowartHtmlDraft(editor, draftShapeId) {
  const shape = editor.getShape(draftShapeId)
  const bounds = new Box(0, 0, Number(shape?.props?.w) || 1, Number(shape?.props?.h) || 1)
  const exportResult = await renderCowartHtmlDraftCanvas(
    shape,
    getAnnotationEditExportPixelRatio(bounds)
  )
  const fileName = htmlDraftDownloadFileName(shape)
  if (hasCowartWidgetBridge()) {
    return downloadCowartFile({
      dataUrl: exportResult.url,
      fileName,
      mimeType: 'image/png'
    })
  }

  downloadDataUrl(exportResult.url, fileName)
  return { fileName }
}

async function exportCowartHtmlDraftAnnotationScreenshot(editor, draftShapeId) {
  const shapeIds = collectHtmlDraftAnnotationShapeIds(editor, draftShapeId)
  const draftShape = editor.getShape(draftShapeId)
  const rawBounds = editor.getShapesPageBounds(shapeIds)
  if (!draftShape || !rawBounds) throw new Error('无法计算 HTML 草稿截图范围。')

  const exportBounds = expandBox(rawBounds, ANNOTATION_EDIT_EXPORT_PADDING)
  const pixelRatio = getAnnotationEditExportPixelRatio(exportBounds)
  const draftCapture = await renderCowartHtmlDraftCanvas(draftShape, pixelRatio)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(exportBounds.w * pixelRatio))
  canvas.height = Math.max(1, Math.round(exportBounds.h * pixelRatio))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法创建标注截图。')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const pageTransform = editor.getShapePageTransform(draftShapeId)
  if (!pageTransform) throw new Error('无法读取 HTML 草稿的画布变换。')
  context.setTransform(
    pixelRatio * pageTransform.a,
    pixelRatio * pageTransform.b,
    pixelRatio * pageTransform.c,
    pixelRatio * pageTransform.d,
    pixelRatio * (pageTransform.e - exportBounds.x),
    pixelRatio * (pageTransform.f - exportBounds.y)
  )
  context.drawImage(
    draftCapture.canvas,
    0,
    0,
    Number(draftShape.props.w) || draftCapture.displayWidth,
    Number(draftShape.props.h) || draftCapture.displayHeight
  )

  const annotationShapeIds = shapeIds.filter((shapeId) => shapeId !== draftShapeId)
  if (annotationShapeIds.length) {
    const overlay = await editor.toImageDataUrl(annotationShapeIds, {
      bounds: exportBounds,
      background: false,
      darkMode: false,
      format: 'png',
      padding: 0,
      pixelRatio
    })
    const overlayImage = await loadRasterImage(overlay.url)
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.drawImage(overlayImage, 0, 0, canvas.width, canvas.height)
  }

  return {
    url: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
    shapeIds
  }
}

function htmlDraftAnnotationScreenshotFileName(mode) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `html-draft-annotation-${mode}-${timestamp}.png`
}

function buildHtmlDraftAnnotationEditPrompt({ draftShape, exportResult, screenshotAsset }) {
  const assetUrl = getCowartHtmlDraftAssetUrl(draftShape)
  const assetPath = getCowartHtmlDraftLocalPath(draftShape)
  const annotationCount = Math.max(0, exportResult.shapeIds.length - 1)
  const targetWidth = Math.round(Number(draftShape.props.w) || AI_IMAGE_HOLDER_DEFAULT_W)
  const targetHeight = Math.round(Number(draftShape.props.h) || AI_IMAGE_HOLDER_DEFAULT_H)
  return [
    HTML_DRAFT_ANNOTATION_EDIT_PROMPT,
    '',
    `Cowart HTML draft shape: ${draftShape.id}`,
    `HTML draft asset URL: ${assetUrl || 'unavailable'}`,
    ...(assetPath ? [`HTML draft local path: ${assetPath}`] : []),
    `Included annotation shapes: ${annotationCount}`,
    `Screenshot size: ${exportResult.width}x${exportResult.height}`,
    ...(screenshotAsset?.assetPath
      ? [
          `Annotation screenshot local path: ${screenshotAsset.assetPath}`,
          'Use this screenshot as the authoritative source for the annotation requests.'
        ]
      : []),
    '',
    'Required completion step:',
    `- Call insert_cowart_html_draft with draftShapeId: "${draftShape.id}", updateExistingDraft: false, replaceDraftHolder: false, placement: "right", margin: 40, matchAnchor: true, displayWidth: ${targetWidth}, and displayHeight: ${targetHeight}.`,
    '- Pass the final complete HTML document as htmlContent.',
    '- Use a new short .html fileName; do not overwrite the original HTML asset.',
    '- Keep the original draft shape and annotations unchanged. The returned shapeId must be a new shape placed to the right.',
    '- If this already-open Codex task does not expose updateExistingDraft yet, omit that argument but still pass replaceDraftHolder: false, placement: "right", margin: 40, matchAnchor: true, displayWidth and displayHeight. Never edit the original HTML file or original shape record.'
  ].join('\n')
}

function buildHtmlDraftAnnotationImagePrompt({ draftShape, exportResult, screenshotAsset }) {
  const targetWidth = Math.round(Number(draftShape.props.w) || AI_IMAGE_HOLDER_DEFAULT_W)
  const targetHeight = Math.round(Number(draftShape.props.h) || AI_IMAGE_HOLDER_DEFAULT_H)
  const ratio = targetHeight ? targetWidth / targetHeight : 1
  const annotationCount = Math.max(0, exportResult.shapeIds.length - 1)
  return [
    HTML_DRAFT_ANNOTATION_IMAGE_PROMPT,
    '',
    `Cowart HTML draft shape: ${draftShape.id}`,
    `Target canvas image size: ${targetWidth} x ${targetHeight} canvas units.`,
    `Target aspect ratio: ${targetWidth}:${targetHeight} (${ratio.toFixed(3)} width/height).`,
    `Included annotation shapes: ${annotationCount}`,
    `Screenshot size: ${exportResult.width}x${exportResult.height}`,
    ...(screenshotAsset?.assetPath
      ? [
          `Annotation screenshot local path: ${screenshotAsset.assetPath}`,
          'Use this screenshot as the authoritative visual input for image generation.'
        ]
      : []),
    '',
    'Required placement after imagegen:',
    `- Call insert_cowart_image with anchorShapeId: "${draftShape.id}", placement: "right", margin: 40, matchAnchor: true, displayWidth: ${targetWidth}, and displayHeight: ${targetHeight}.`,
    '- Leave replaceAiImageHolder false or unset; this HTML draft is the source anchor and must remain unchanged.',
    '- Set shapeMeta.cowartGeneratedFromHtmlDraftAnnotation to true.'
  ].join('\n')
}

async function sendHtmlDraftAnnotationRequest(editor, draftShapeId, mode) {
  const sender = followUpSender()
  if (!sender) throw new Error('当前 Cowart 画布没有可用的 Codex MCP 消息桥。')

  const draftShape = editor.getShape(draftShapeId)
  if (!isCowartHtmlDraftEmbedShape(draftShape)) {
    throw new Error('请选择一个已生成 HTML 的 AI Html。')
  }

  const exportResult = await exportCowartHtmlDraftAnnotationScreenshot(editor, draftShapeId)
  const screenshotAsset = await saveCowartReferenceImage({
    anchorShapeId: draftShapeId,
    fileName: htmlDraftAnnotationScreenshotFileName(mode),
    dataUrl: exportResult.url,
    mimeType: 'image/png'
  })
  const prompt =
    mode === 'edit'
      ? buildHtmlDraftAnnotationEditPrompt({ draftShape, exportResult, screenshotAsset })
      : buildHtmlDraftAnnotationImagePrompt({ draftShape, exportResult, screenshotAsset })
  const content = [{ type: 'text', text: prompt }]

  if (supportsCowartMessageImages()) {
    content.push(
      dataUrlToImageContent(exportResult.url, {
        cowartHtmlDraftAnnotation: true,
        cowartHtmlDraftAnnotationMode: mode,
        cowartSourceHtmlDraftShapeId: draftShapeId,
        cowartIncludedShapeIds: exportResult.shapeIds,
        cowartAnnotationScreenshotPath: screenshotAsset.assetPath || null,
        cowartAnnotationScreenshotFileName: screenshotAsset.fileName || null
      })
    )
  }

  return sender({ prompt, content })
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function formatAiImageGenerationTarget(shape) {
  const targetWidth = Math.round(Number(shape?.props?.w) || AI_IMAGE_HOLDER_DEFAULT_W)
  const targetHeight = Math.round(Number(shape?.props?.h) || AI_IMAGE_HOLDER_DEFAULT_H)
  const ratio = targetHeight ? targetWidth / targetHeight : 1
  const preset = getAiImageAspectPreset(shape)
  const ratioLabel = preset?.label ?? `${targetWidth}:${targetHeight}`

  return {
    targetWidth,
    targetHeight,
    ratio,
    ratioLabel,
    label: `${ratioLabel} · ${targetWidth}x${targetHeight}`
  }
}

function getAiImageGenerationPanelLayout(editor, shapeId) {
  const bounds = editor.getShapePageBounds(shapeId)
  if (!bounds) return null

  const containerBounds = editor.getContainer().getBoundingClientRect()
  const viewportWidth = containerBounds.width || window.innerWidth || 0
  const viewportHeight = containerBounds.height || window.innerHeight || 0
  if (!viewportWidth || !viewportHeight) return null

  const bottomLeft = editor.pageToViewport({ x: bounds.x, y: bounds.y + bounds.h })
  const bottomRight = editor.pageToViewport({ x: bounds.x + bounds.w, y: bounds.y + bounds.h })
  const screenWidth = Math.abs(bottomRight.x - bottomLeft.x)
  const panelWidth = Math.min(
    AI_IMAGE_GENERATION_PANEL_MAX_W,
    Math.max(AI_IMAGE_GENERATION_PANEL_MIN_W, screenWidth * 2.6)
  )
  const panelLeft = clampNumber(
    bottomLeft.x + screenWidth / 2 - panelWidth / 2,
    AI_IMAGE_GENERATION_PANEL_VIEWPORT_MARGIN,
    Math.max(AI_IMAGE_GENERATION_PANEL_VIEWPORT_MARGIN, viewportWidth - panelWidth - AI_IMAGE_GENERATION_PANEL_VIEWPORT_MARGIN)
  )
  const preferredTop = bottomLeft.y + AI_IMAGE_GENERATION_PANEL_OFFSET
  const panelTop = clampNumber(
    preferredTop,
    AI_IMAGE_GENERATION_PANEL_VIEWPORT_MARGIN,
    Math.max(AI_IMAGE_GENERATION_PANEL_VIEWPORT_MARGIN, viewportHeight - AI_IMAGE_GENERATION_PANEL_ESTIMATED_H - AI_IMAGE_GENERATION_PANEL_VIEWPORT_MARGIN)
  )

  return {
    left: panelLeft,
    top: panelTop,
    width: panelWidth
  }
}

function aiImageReferenceLines({ references, referenceAttached }) {
  if (!references.length) return ['Reference images: none']

  const lines = [`Reference images: ${references.length}`]
  const localPathLines = []
  references.forEach((reference, index) => {
    const savedReference = reference.savedReference
    const displayName = savedReference?.fileName || reference.file?.name || `selected reference image ${index + 1}`
    if (savedReference?.assetPath) {
      localPathLines.push(`${index + 1}. ${savedReference.assetPath}`)
    } else {
      localPathLines.push(`${index + 1}. ${displayName} (local path unavailable)`)
    }
  })

  if (localPathLines.some((line) => !line.endsWith('(local path unavailable)'))) {
    lines.push('Reference image local paths:', ...localPathLines, 'Use these local files as visual references.')
  } else if (referenceAttached) {
    lines.push('Reference images are attached as image content blocks; use them as visual references.')
  } else {
    lines.push('Reference image local paths were unavailable.')
  }
  return lines
}

function buildAiImageGenerationPrompt({ holderShape, userPrompt, references, referenceAttached }) {
  const { targetWidth, targetHeight, ratio, ratioLabel } = formatAiImageGenerationTarget(holderShape)
  const referenceLines = aiImageReferenceLines({ references, referenceAttached })

  return [
    AI_IMAGE_GENERATION_PROMPT_PREFIX,
    '',
    `Cowart AI image holder shape: ${holderShape.id}`,
    `Target canvas slot: ${targetWidth} x ${targetHeight} canvas units.`,
    `Target aspect ratio: ${ratioLabel} (${ratio.toFixed(3)} width/height).`,
    'Compose the final bitmap for this slot without cropping or stretching.',
    ...referenceLines,
    '',
    'Prompt:',
    userPrompt.trim()
  ].join('\n')
}

function buildAiDraftGenerationPrompt({ holderShape, userPrompt, references, referenceAttached }) {
  const { targetWidth, targetHeight, ratio, ratioLabel } = formatAiImageGenerationTarget(holderShape)
  const referenceLines = aiImageReferenceLines({ references, referenceAttached })

  return [
    AI_DRAFT_GENERATION_PROMPT_PREFIX,
    '',
    `Cowart AI draft holder shape: ${holderShape.id}`,
    `Target canvas draft slot: ${targetWidth} x ${targetHeight} canvas units.`,
    `Target aspect ratio: ${ratioLabel} (${ratio.toFixed(3)} width/height).`,
    'Design the HTML so it fills this iframe size without needing external files.',
    ...referenceLines,
    '',
    'Required tool call after generating the HTML:',
    `- Call insert_cowart_html_draft with draftShapeId: "${holderShape.id}".`,
    '- Pass the final HTML document as htmlContent.',
    '- Use a short .html fileName that describes the draft.',
    '- Leave replaceDraftHolder unset or true so the AI Html frame becomes the embedded HTML preview.',
    '',
    'Prompt:',
    userPrompt.trim()
  ].join('\n')
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result || '')))
    reader.addEventListener('error', () => reject(reader.error || new Error('无法读取参考图。')))
    reader.readAsDataURL(file)
  })
}

function clipboardImageFiles(event) {
  const clipboardData = event.clipboardData
  if (!clipboardData) return []

  const itemFiles = Array.from(clipboardData.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean)

  if (itemFiles.length) return itemFiles
  return Array.from(clipboardData.files || []).filter((file) => file.type.startsWith('image/'))
}

function stopEditorOverlayEvent(event) {
  event.stopPropagation()
}

async function sendAiImageGenerationRequest({ holderShape, userPrompt, referenceFiles = [] }) {
  const sender = followUpSender()
  if (!sender) {
    throw new Error('当前 Cowart 画布没有可用的 Codex MCP 消息桥。')
  }

  const imageReferences = referenceFiles.slice(0, AI_IMAGE_REFERENCE_MAX_FILES)
  const referenceAttached = Boolean(imageReferences.length && supportsCowartMessageImages())
  const references = []

  for (const [index, referenceFile] of imageReferences.entries()) {
    const referenceDataUrl = await readFileAsDataUrl(referenceFile)
    let savedReference = null
    if (hasCowartWidgetBridge()) {
      try {
        savedReference = await saveCowartReferenceImage({
          holderShapeId: holderShape.id,
          fileName: referenceFile.name || `reference-${index + 1}.png`,
          dataUrl: referenceDataUrl,
          mimeType: referenceFile.type || undefined
        })
      } catch (error) {
        if (!referenceAttached) {
          throw new Error(`参考图无法保存到 Cowart 本地 assets：${error instanceof Error ? error.message : String(error)}`)
        }
        console.warn('Cowart reference image could not be saved; relying on direct image attachment.', error)
      }
    } else if (!referenceAttached) {
      throw new Error('当前 Codex host 没有声明支持图片附件，也没有可用的 Cowart MCP 文件保存桥。')
    }
    references.push({ file: referenceFile, dataUrl: referenceDataUrl, savedReference })
  }

  const prompt = buildAiImageGenerationPrompt({
    holderShape,
    userPrompt,
    references,
    referenceAttached
  })
  const content = [{ type: 'text', text: prompt }]

  if (referenceAttached) {
    for (const [index, reference] of references.entries()) {
      content.push(dataUrlToImageContent(reference.dataUrl, {
        cowartAiImageReference: true,
        cowartAiImageReferenceIndex: index + 1,
        cowartAiImageHolderShapeId: holderShape.id,
        cowartReferenceFileName: reference.file.name || null,
        cowartReferenceAssetPath: reference.savedReference?.assetPath || null
      }))
    }
  }

  return sender({ prompt, content })
}

async function sendAiDraftGenerationRequest({ holderShape, userPrompt, referenceFiles = [] }) {
  const sender = followUpSender()
  if (!sender) {
    throw new Error('当前 Cowart 画布没有可用的 Codex MCP 消息桥。')
  }

  const imageReferences = referenceFiles.slice(0, AI_IMAGE_REFERENCE_MAX_FILES)
  const referenceAttached = Boolean(imageReferences.length && supportsCowartMessageImages())
  const references = []

  for (const [index, referenceFile] of imageReferences.entries()) {
    const referenceDataUrl = await readFileAsDataUrl(referenceFile)
    let savedReference = null
    if (hasCowartWidgetBridge()) {
      try {
        savedReference = await saveCowartReferenceImage({
          holderShapeId: holderShape.id,
          fileName: referenceFile.name || `draft-reference-${index + 1}.png`,
          dataUrl: referenceDataUrl,
          mimeType: referenceFile.type || undefined
        })
      } catch (error) {
        if (!referenceAttached) {
          throw new Error(`参考图无法保存到 Cowart 本地 assets：${error instanceof Error ? error.message : String(error)}`)
        }
        console.warn('Cowart draft reference image could not be saved; relying on direct image attachment.', error)
      }
    } else if (!referenceAttached) {
      throw new Error('当前 Codex host 没有声明支持图片附件，也没有可用的 Cowart MCP 文件保存桥。')
    }
    references.push({ file: referenceFile, dataUrl: referenceDataUrl, savedReference })
  }

  const prompt = buildAiDraftGenerationPrompt({
    holderShape,
    userPrompt,
    references,
    referenceAttached
  })
  const content = [{ type: 'text', text: prompt }]

  if (referenceAttached) {
    for (const [index, reference] of references.entries()) {
      content.push(dataUrlToImageContent(reference.dataUrl, {
        cowartAiDraftReference: true,
        cowartAiDraftReferenceIndex: index + 1,
        cowartAiDraftHolderShapeId: holderShape.id,
        cowartReferenceFileName: reference.file.name || null,
        cowartReferenceAssetPath: reference.savedReference?.assetPath || null
      }))
    }
  }

  return sender({ prompt, content })
}

class CowartAnnotationTool extends StateNode {
  static id = ANNOTATION_TOOL_ID
  static initial = 'idle'

  static children() {
    return [CowartAnnotationIdle, CowartAnnotationPointing]
  }

  onEnter() {
    unlockGlobalToolLock(this.editor)
  }
}

class CowartAnnotationIdle extends StateNode {
  static id = 'idle'

  onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  onPointerDown(info) {
    this.parent.transition('pointing', info)
  }

  onCancel() {
    this.editor.setCurrentTool('select')
  }
}

class CowartAnnotationPointing extends StateNode {
  static id = 'pointing'

  arrowId = null
  markId = ''
  origin = null

  onEnter() {
    const origin = this.editor.inputs.getOriginPagePoint()
    const scale = this.editor.getResizeScaleFactor()
    const color = getAnnotationColor(this.editor)
    const arrowId = createShapeId()

    this.arrowId = arrowId
    this.origin = { x: origin.x, y: origin.y }
    this.markId = this.editor.markHistoryStoppingPoint(`creating_annotation:${arrowId}`)

    this.editor.createShape({
      id: arrowId,
      type: 'arrow',
      x: origin.x,
      y: origin.y,
      meta: {
        cowartAnnotationArrow: true
      },
      props: {
        kind: 'arc',
        dash: 'draw',
        size: 'm',
        fill: 'none',
        color,
        labelColor: color,
        bend: 0,
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
        richText: toRichText(''),
        labelPosition: ANNOTATION_LABEL_POSITION,
        font: 'draw',
        scale
      }
    })
  }

  onPointerMove() {
    this.updateArrowEnd()
  }

  onPointerUp() {
    this.complete()
  }

  onCancel() {
    this.cancel()
  }

  onInterrupt() {
    this.cancel()
  }

  updateArrowEnd() {
    if (!this.arrowId || !this.origin) return

    const point = this.editor.inputs.getCurrentPagePoint()
    this.editor.updateShapes([
      {
        id: this.arrowId,
        type: 'arrow',
        props: {
          end: {
            x: point.x - this.origin.x,
            y: point.y - this.origin.y
          }
        }
      }
    ])
  }

  complete() {
    if (!this.arrowId || !this.origin) {
      this.editor.setCurrentTool(ANNOTATION_TOOL_ID)
      return
    }

    this.updateArrowEnd()

    const point = this.editor.inputs.getCurrentPagePoint()
    const dx = point.x - this.origin.x
    const dy = point.y - this.origin.y
    const length = Math.hypot(dx, dy)

    if (length < ANNOTATION_MIN_LENGTH / this.editor.getZoomLevel()) {
      this.editor.bailToMark(this.markId)
      this.parent.transition('idle')
      return
    }

    this.editor.updateShapes([
      {
        id: this.arrowId,
        type: 'arrow',
        props: {
          bend: getDefaultAnnotationArrowBend(dx, dy, this.editor.getResizeScaleFactor())
        }
      }
    ])

    startEditingAnnotationArrowLabel(this.editor, this.arrowId)
  }

  cancel() {
    if (this.arrowId) {
      this.editor.bailToMark(this.markId)
    }
    this.parent.transition('idle')
  }
}

class CowartFrameShapeUtil extends FrameShapeUtil {
  isAspectRatioLocked(shape) {
    if (isCowartAiHolderShape(shape)) {
      return isAiImageAspectLocked(shape)
    }

    return super.isAspectRatioLocked(shape)
  }
}

const COWART_HTML_DRAFT_EMBED_DEFINITION = {
  type: COWART_HTML_DRAFT_EMBED_TYPE,
  title: AI_DRAFT_HOLDER_LABEL,
  hostnames: ['cowart.local'],
  width: AI_IMAGE_HOLDER_DEFAULT_W,
  height: AI_IMAGE_HOLDER_DEFAULT_H,
  minWidth: 160,
  minHeight: 120,
  doesResize: true,
  backgroundColor: '#ffffff',
  embedOnPaste: false,
  toEmbedUrl(url) {
    if (isCowartHtmlDraftDataUrl(url)) return url
    return cowartHtmlDraftAssetUrlFromVirtualUrl(url) ?? undefined
  },
  fromEmbedUrl(url) {
    if (isCowartHtmlDraftDataUrl(url)) return url
    const assetUrl = cowartHtmlDraftAssetUrlFromVirtualUrl(url)
    return assetUrl ? cowartHtmlDraftVirtualUrl(assetUrl) : undefined
  }
}

function CowartHtmlDraftEmbed({ shape }) {
  const editor = useEditor()
  const directHtmlUrl = isCowartHtmlDraftDataUrl(shape.props.url) ? shape.props.url : null
  const draftAssetUrl =
    cowartHtmlDraftAssetUrlFromVirtualUrl(shape.meta?.cowartHtmlDraftAssetUrl) ||
    cowartHtmlDraftAssetUrlFromVirtualUrl(shape.props.url)
  const isEditing = useIsEditing(shape.id)
  const [htmlSource, setHtmlSource] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [frameLoadVersion, setFrameLoadVersion] = useState(0)

  const handleIframeRef = useCallback(
    (iframe) => {
      if (iframe) {
        cowartHtmlDraftIframes.set(shape.id, iframe)
      } else if (cowartHtmlDraftIframes.get(shape.id)) {
        cowartHtmlDraftIframes.delete(shape.id)
      }
    },
    [shape.id]
  )

  useEffect(() => {
    setHtmlSource(null)
    setLoadError(null)
    const shouldReadPageAsset = draftAssetUrl && hasCowartWidgetBridge()
    const browserSourceUrl = !shouldReadPageAsset && (draftAssetUrl || directHtmlUrl)
    if (!shouldReadPageAsset && !browserSourceUrl) return undefined

    let isDisposed = false

    const htmlSourcePromise = shouldReadPageAsset
      ? readCowartPageAsset(draftAssetUrl).then((pageAsset) =>
          blobFromBase64(pageAsset.dataBase64, pageAsset.mimeType).text()
        )
      : window.fetch(browserSourceUrl).then((response) => {
          if (!response.ok) throw new Error(`HTML 草稿加载失败：${response.status}`)
          return response.text()
        })

    htmlSourcePromise
      .then((htmlContent) => {
        if (isDisposed) return
        setHtmlSource(htmlContent)
      })
      .catch((error) => {
        if (isDisposed) return
        console.warn('Cowart could not load HTML draft asset.', error)
        setLoadError(error instanceof Error ? error.message : 'HTML 草稿加载失败')
      })

    return () => {
      isDisposed = true
    }
  }, [directHtmlUrl, draftAssetUrl])

  const persistDomEdits = useCallback(
    async (htmlContent) => {
      const result = await updateCowartHtmlDraft({ draftShapeId: shape.id, htmlContent })
      const latestShape = editor.getShape(shape.id)
      if (!isCowartHtmlDraftEmbedShape(latestShape)) return
      editor.updateShape({
        id: shape.id,
        type: 'embed',
        meta: {
          ...latestShape.meta,
          ...(result?.assetUrl ? { cowartHtmlDraftAssetUrl: result.assetUrl } : {})
        },
        props: { url: cowartHtmlDraftDataUrl(htmlContent) }
      })
    },
    [editor, shape.id]
  )

  const exitDomEditing = useCallback(() => {
    editor.setEditingShape(null)
    editor.setCurrentTool('select')
  }, [editor])

  useEffect(() => {
    if (!isEditing || !htmlSource) return undefined

    let disposed = false
    let session = null
    waitForHtmlDraftDocument(shape.id)
      .then((iframeDocument) => {
        if (disposed) return
        session = createCowartHtmlDraftDomEditorSession(iframeDocument, {
          onSave: persistDomEdits,
          onRequestExit: exitDomEditing
        })
        cowartHtmlDraftDomEditSessions.set(shape.id, session)
      })
      .catch((error) => console.error('Cowart could not start HTML DOM editing.', error))

    return () => {
      disposed = true
      if (!session) return
      if (cowartHtmlDraftDomEditSessions.get(shape.id) === session) {
        cowartHtmlDraftDomEditSessions.delete(shape.id)
      }
      session
        .dispose({ save: true })
        .catch((error) => console.error('Cowart could not save HTML DOM edits.', error))
    }
  }, [exitDomEditing, frameLoadVersion, htmlSource, isEditing, persistDomEdits, shape.id])

  return (
    <HTMLContainer className="cowart-html-draft-container" id={shape.id}>
      {htmlSource ? (
        <iframe
          ref={handleIframeRef}
          className="cowart-html-draft-frame"
          data-cowart-html-draft-shape-id={shape.id}
          draggable={false}
          frameBorder="0"
          height={toDomPrecision(shape.props.h)}
          onLoad={() => setFrameLoadVersion((version) => version + 1)}
          referrerPolicy="no-referrer"
          sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
          srcDoc={htmlSource}
          tabIndex={isEditing ? 0 : -1}
          title={AI_DRAFT_HOLDER_LABEL}
          width={toDomPrecision(shape.props.w)}
          style={{
            pointerEvents: isEditing ? 'auto' : 'none',
            zIndex: isEditing ? '' : '-1'
          }}
        />
      ) : (
        <div
          className="cowart-html-draft-placeholder"
          style={{
            width: toDomPrecision(shape.props.w),
            height: toDomPrecision(shape.props.h)
          }}
        >
          <span>{loadError || 'HTML 草稿加载中'}</span>
        </div>
      )}
    </HTMLContainer>
  )
}

const CowartConfiguredEmbedShapeUtil = EmbedShapeUtil.configure({
  embedDefinitions: [COWART_HTML_DRAFT_EMBED_DEFINITION, ...DEFAULT_EMBED_DEFINITIONS]
})

class CowartEmbedShapeUtil extends CowartConfiguredEmbedShapeUtil {
  component(shape) {
    if (isCowartHtmlDraftEmbedShape(shape)) {
      return <CowartHtmlDraftEmbed shape={shape} />
    }

    return super.component(shape)
  }
}

const cowartShapeUtils = [CowartFrameShapeUtil, CowartEmbedShapeUtil]

const cowartUiOverrides = {
  actions(editor, actions, helpers) {
    const defaultDownloadOriginal = actions['download-original']
    return {
      ...actions,
      'download-original': {
        ...defaultDownloadOriginal,
        async onSelect(source) {
          if (!hasCowartWidgetBridge()) {
            return defaultDownloadOriginal.onSelect(source)
          }

          const imageShapes = editor.getSelectedShapes().filter(isImageShape)
          if (!imageShapes.length) return

          try {
            const results = []
            for (const imageShape of imageShapes) {
              results.push(await downloadCowartImageShape(editor, imageShape))
            }
            helpers.addToast({
              title: imageShapes.length === 1 ? '图片已下载' : `${imageShapes.length} 张图片已下载`,
              description: results[0]?.filePath || '文件已保存到系统下载目录。',
              severity: 'success'
            })
          } catch (error) {
            console.error(error)
            helpers.addToast({
              title: '图片下载失败',
              description: error instanceof Error ? error.message : '请稍后重试。',
              severity: 'error'
            })
          }
        }
      }
    }
  },
  translations: {
    en: {
      'tool.ai-image': AI_IMAGE_HOLDER_LABEL,
      'tool.ai-draft': AI_DRAFT_HOLDER_LABEL,
      'tool.cowart-annotation': ANNOTATION_TOOL_LABEL
    },
    'zh-cn': {
      'tool.ai-image': AI_IMAGE_HOLDER_LABEL,
      'tool.ai-draft': AI_DRAFT_HOLDER_LABEL,
      'tool.cowart-annotation': ANNOTATION_TOOL_LABEL
    }
  },
  tools(editor, tools) {
    return {
      ...tools,
      arrow: {
        ...tools.arrow,
        kbd: undefined
      },
      [AI_IMAGE_TOOL_ID]: {
        id: AI_IMAGE_TOOL_ID,
        label: 'tool.ai-image',
        icon: aiImageToolIcon,
        kbd: 'a',
        onSelect() {
          createAiImageHolderAtViewportCenter(editor)
        },
        onDragStart(source, info) {
          const scale = editor.getResizeScaleFactor()
          onDragFromToolbarToCreateShape(editor, info, {
            createShape: (id) =>
              createAiImageHolderShape(editor, id, {
                props: {
                  w: AI_IMAGE_HOLDER_DEFAULT_W * scale,
                  h: AI_IMAGE_HOLDER_DEFAULT_H * scale
                }
              }),
            onDragEnd: (id) => editor.select(id)
          })
        },
        meta: {
          cowartTool: 'ai-image-holder'
        }
      },
      [AI_DRAFT_TOOL_ID]: {
        id: AI_DRAFT_TOOL_ID,
        label: 'tool.ai-draft',
        icon: aiHtmlToolIcon,
        onSelect() {
          createAiDraftHolderAtViewportCenter(editor)
        },
        onDragStart(source, info) {
          const scale = editor.getResizeScaleFactor()
          onDragFromToolbarToCreateShape(editor, info, {
            createShape: (id) =>
              createAiDraftHolderShape(editor, id, {
                props: {
                  w: AI_IMAGE_HOLDER_DEFAULT_W * scale,
                  h: AI_IMAGE_HOLDER_DEFAULT_H * scale
                }
              }),
            onDragEnd: (id) => editor.select(id)
          })
        },
        meta: {
          cowartTool: 'ai-draft-holder'
        }
      },
      [ANNOTATION_TOOL_ID]: {
        id: ANNOTATION_TOOL_ID,
        label: 'tool.cowart-annotation',
        icon: annotationToolIcon,
        kbd: 'c',
        onSelect() {
          unlockGlobalToolLock(editor)
          editor.setCurrentTool(ANNOTATION_TOOL_ID)
        },
        meta: {
          cowartTool: 'annotation'
        }
      }
    }
  }
}

const cowartComponents = {
  Toolbar: CowartToolbar,
  ImageToolbar: CowartSelectionToolbar,
  InFrontOfTheCanvas: CowartCanvasOverlay,
  StylePanel: CowartStylePanel
}

function CowartCanvasOverlay() {
  return (
    <>
      <CowartAiImageGenerationPanel />
      <CowartAiDraftGenerationPanel />
    </>
  )
}

function CowartAiImageGenerationPanel() {
  const editor = useEditor()
  const selectedTarget = useValue(
    'selected ai image holder generation panel target',
    () => {
      const shape = editor.getOnlySelectedShape()
      if (!isAiImageHolderShape(shape)) return null

      editor.getCamera()
      editor.getViewportScreenBounds()

      const layout = getAiImageGenerationPanelLayout(editor, shape.id)
      if (!layout) return null

      return {
        shape,
        layout
      }
    },
    [editor]
  )
  const fileInputRef = useRef(null)
  const [promptValue, setPromptValue] = useState('')
  const [referenceFiles, setReferenceFiles] = useState([])
  const [referencePreviews, setReferencePreviews] = useState([])
  const [status, setStatus] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setStatus('idle')
    setErrorMessage('')
  }, [selectedTarget?.shape.id])

  useEffect(() => {
    if (status !== 'sent') return undefined
    const timer = window.setTimeout(() => setStatus('idle'), AI_IMAGE_GENERATION_STATUS_RESET_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  useEffect(() => {
    const previews = referenceFiles.map((file, index) => ({
      file,
      key: `${file.name}-${file.size}-${file.lastModified}-${index}`,
      url: URL.createObjectURL(file)
    }))
    setReferencePreviews(previews)
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [referenceFiles])

  if (!selectedTarget) return null

  const { shape, layout } = selectedTarget
  const canSend = promptValue.trim().length > 0 || referenceFiles.length > 0
  const isSending = status === 'sending'

  function handleReferenceChange(event) {
    const selectedFiles = Array.from(event.target.files || [])
    if (!selectedFiles.length) return

    const imageFiles = selectedFiles.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length !== selectedFiles.length) {
      setStatus('error')
      setErrorMessage('请选择图片文件。')
      event.target.value = ''
      return
    }

    const availableSlots = Math.max(0, AI_IMAGE_REFERENCE_MAX_FILES - referenceFiles.length)
    if (!availableSlots) {
      setStatus('error')
      setErrorMessage(`最多支持 ${AI_IMAGE_REFERENCE_MAX_FILES} 张参考图。`)
      event.target.value = ''
      return
    }

    const filesToAdd = imageFiles.slice(0, availableSlots)
    setReferenceFiles((currentFiles) => [...currentFiles, ...filesToAdd].slice(0, AI_IMAGE_REFERENCE_MAX_FILES))
    if (imageFiles.length > availableSlots) {
      setStatus('error')
      setErrorMessage(`最多支持 ${AI_IMAGE_REFERENCE_MAX_FILES} 张参考图。`)
    } else {
      setStatus('idle')
      setErrorMessage('')
    }
    event.target.value = ''
  }

  function clearReferences() {
    setReferenceFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function removeReferenceAt(indexToRemove) {
    setReferenceFiles((currentFiles) => currentFiles.filter((_file, index) => index !== indexToRemove))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (status === 'error') {
      setStatus('idle')
      setErrorMessage('')
    }
  }

  async function handleSubmit(event) {
    event?.preventDefault()
    if (!canSend || isSending) return

    setStatus('sending')
    setErrorMessage('')
    try {
      await sendAiImageGenerationRequest({
        holderShape: shape,
        userPrompt: promptValue,
        referenceFiles
      })
      setPromptValue('')
      clearReferences()
      setStatus('sent')
    } catch (error) {
      console.error(error)
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '发送失败，请重试。')
    }
  }

  function handlePromptKeyDown(event) {
    stopEditorOverlayEvent(event)
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      handleSubmit(event)
    }
  }

  function handlePromptPaste(event) {
    const imageFiles = clipboardImageFiles(event)
    if (!imageFiles.length) return

    event.preventDefault()
    stopEditorOverlayEvent(event)

    const availableSlots = Math.max(0, AI_IMAGE_REFERENCE_MAX_FILES - referenceFiles.length)
    if (!availableSlots) {
      setStatus('error')
      setErrorMessage(`最多支持 ${AI_IMAGE_REFERENCE_MAX_FILES} 张参考图。`)
      return
    }

    setReferenceFiles((currentFiles) => [
      ...currentFiles,
      ...imageFiles.slice(0, availableSlots)
    ].slice(0, AI_IMAGE_REFERENCE_MAX_FILES))
    if (imageFiles.length > availableSlots) {
      setStatus('error')
      setErrorMessage(`最多支持 ${AI_IMAGE_REFERENCE_MAX_FILES} 张参考图。`)
    } else {
      setStatus('idle')
      setErrorMessage('')
    }
  }

  return (
    <div className="cowart-ai-generation-overlay" aria-hidden={false}>
      <form
        aria-label="AI 图片生成"
        className="cowart-ai-generation-panel"
        data-status={status}
        onClick={stopEditorOverlayEvent}
        onDoubleClick={stopEditorOverlayEvent}
        onKeyDown={stopEditorOverlayEvent}
        onPointerDown={stopEditorOverlayEvent}
        onSubmit={handleSubmit}
        style={{
          left: `${layout.left}px`,
          top: `${layout.top}px`,
          width: `${layout.width}px`
        }}
      >
        <div className="cowart-ai-generation-reference-row">
          <div className="cowart-ai-generation-reference-strip">
            {referencePreviews.map((preview, index) => (
              <div className="cowart-ai-generation-reference-preview" key={preview.key}>
                <img alt={`参考图 ${index + 1}`} src={preview.url} />
                <button aria-label={`移除参考图 ${index + 1}`} onClick={() => removeReferenceAt(index)} type="button">
                  <TldrawUiButtonIcon icon="cross-2" small />
                </button>
              </div>
            ))}
            {referenceFiles.length < AI_IMAGE_REFERENCE_MAX_FILES && (
              <button
                aria-label="选择参考图"
                className="cowart-ai-generation-reference-button"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <TldrawUiButtonIcon icon="tool-media" small />
                <span>参考图</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            accept="image/*"
            className="cowart-ai-generation-file-input"
            multiple
            onChange={handleReferenceChange}
            type="file"
          />
        </div>

        <textarea
          aria-label="自定义 prompt"
          className="cowart-ai-generation-prompt"
          disabled={isSending}
          onChange={(event) => {
            setPromptValue(event.target.value)
            if (status === 'error') {
              setStatus('idle')
              setErrorMessage('')
            }
          }}
          onKeyDown={handlePromptKeyDown}
          onPaste={handlePromptPaste}
          placeholder="描述你想生成的图片"
          rows={3}
          value={promptValue}
        />

        <div className="cowart-ai-generation-footer">
          <div className="cowart-ai-generation-status" aria-live="polite">
            {status === 'sending'
              ? '正在发送'
              : status === 'sent'
                ? '已发送'
                : errorMessage}
          </div>
          <button
            aria-label="发送生成请求"
            className="cowart-ai-generation-send"
            disabled={!canSend || isSending}
            type="submit"
          >
            <span>{isSending ? '发送中' : '发送'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}

function CowartAiDraftGenerationPanel() {
  const editor = useEditor()
  const selectedTarget = useValue(
    'selected ai draft holder generation panel target',
    () => {
      const shape = editor.getOnlySelectedShape()
      if (!isAiDraftHolderShape(shape)) return null

      editor.getCamera()
      editor.getViewportScreenBounds()

      const layout = getAiImageGenerationPanelLayout(editor, shape.id)
      if (!layout) return null

      return {
        shape,
        layout
      }
    },
    [editor]
  )
  const fileInputRef = useRef(null)
  const [promptValue, setPromptValue] = useState('')
  const [referenceFiles, setReferenceFiles] = useState([])
  const [referencePreviews, setReferencePreviews] = useState([])
  const [status, setStatus] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setStatus('idle')
    setErrorMessage('')
  }, [selectedTarget?.shape.id])

  useEffect(() => {
    if (status !== 'sent') return undefined
    const timer = window.setTimeout(() => setStatus('idle'), AI_IMAGE_GENERATION_STATUS_RESET_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  useEffect(() => {
    const previews = referenceFiles.map((file, index) => ({
      file,
      key: `${file.name}-${file.size}-${file.lastModified}-${index}`,
      url: URL.createObjectURL(file)
    }))
    setReferencePreviews(previews)
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [referenceFiles])

  if (!selectedTarget) return null

  const { shape, layout } = selectedTarget
  const canSend = promptValue.trim().length > 0 || referenceFiles.length > 0
  const isSending = status === 'sending'

  function handleReferenceChange(event) {
    const selectedFiles = Array.from(event.target.files || [])
    if (!selectedFiles.length) return

    const imageFiles = selectedFiles.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length !== selectedFiles.length) {
      setStatus('error')
      setErrorMessage('请选择图片文件。')
      event.target.value = ''
      return
    }

    const availableSlots = Math.max(0, AI_IMAGE_REFERENCE_MAX_FILES - referenceFiles.length)
    if (!availableSlots) {
      setStatus('error')
      setErrorMessage(`最多支持 ${AI_IMAGE_REFERENCE_MAX_FILES} 张参考图。`)
      event.target.value = ''
      return
    }

    const filesToAdd = imageFiles.slice(0, availableSlots)
    setReferenceFiles((currentFiles) => [...currentFiles, ...filesToAdd].slice(0, AI_IMAGE_REFERENCE_MAX_FILES))
    if (imageFiles.length > availableSlots) {
      setStatus('error')
      setErrorMessage(`最多支持 ${AI_IMAGE_REFERENCE_MAX_FILES} 张参考图。`)
    } else {
      setStatus('idle')
      setErrorMessage('')
    }
    event.target.value = ''
  }

  function clearReferences() {
    setReferenceFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function removeReferenceAt(indexToRemove) {
    setReferenceFiles((currentFiles) => currentFiles.filter((_file, index) => index !== indexToRemove))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (status === 'error') {
      setStatus('idle')
      setErrorMessage('')
    }
  }

  async function handleSubmit(event) {
    event?.preventDefault()
    if (!canSend || isSending) return

    setStatus('sending')
    setErrorMessage('')
    try {
      await sendAiDraftGenerationRequest({
        holderShape: shape,
        userPrompt: promptValue,
        referenceFiles
      })
      setPromptValue('')
      clearReferences()
      setStatus('sent')
    } catch (error) {
      console.error(error)
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '发送失败，请重试。')
    }
  }

  function handlePromptKeyDown(event) {
    stopEditorOverlayEvent(event)
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      handleSubmit(event)
    }
  }

  function handlePromptPaste(event) {
    const imageFiles = clipboardImageFiles(event)
    if (!imageFiles.length) return

    event.preventDefault()
    stopEditorOverlayEvent(event)

    const availableSlots = Math.max(0, AI_IMAGE_REFERENCE_MAX_FILES - referenceFiles.length)
    if (!availableSlots) {
      setStatus('error')
      setErrorMessage(`最多支持 ${AI_IMAGE_REFERENCE_MAX_FILES} 张参考图。`)
      return
    }

    setReferenceFiles((currentFiles) => [
      ...currentFiles,
      ...imageFiles.slice(0, availableSlots)
    ].slice(0, AI_IMAGE_REFERENCE_MAX_FILES))
    if (imageFiles.length > availableSlots) {
      setStatus('error')
      setErrorMessage(`最多支持 ${AI_IMAGE_REFERENCE_MAX_FILES} 张参考图。`)
    } else {
      setStatus('idle')
      setErrorMessage('')
    }
  }

  return (
    <div className="cowart-ai-generation-overlay" aria-hidden={false}>
      <form
        aria-label="AI Html 生成"
        className="cowart-ai-generation-panel"
        data-status={status}
        onClick={stopEditorOverlayEvent}
        onDoubleClick={stopEditorOverlayEvent}
        onKeyDown={stopEditorOverlayEvent}
        onPointerDown={stopEditorOverlayEvent}
        onSubmit={handleSubmit}
        style={{
          left: `${layout.left}px`,
          top: `${layout.top}px`,
          width: `${layout.width}px`
        }}
      >
        <div className="cowart-ai-generation-reference-row">
          <div className="cowart-ai-generation-reference-strip">
            {referencePreviews.map((preview, index) => (
              <div className="cowart-ai-generation-reference-preview" key={preview.key}>
                <img alt={`参考图 ${index + 1}`} src={preview.url} />
                <button aria-label={`移除参考图 ${index + 1}`} onClick={() => removeReferenceAt(index)} type="button">
                  <TldrawUiButtonIcon icon="cross-2" small />
                </button>
              </div>
            ))}
            {referenceFiles.length < AI_IMAGE_REFERENCE_MAX_FILES && (
              <button
                aria-label="选择参考图"
                className="cowart-ai-generation-reference-button"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <TldrawUiButtonIcon icon="tool-media" small />
                <span>参考图</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            accept="image/*"
            className="cowart-ai-generation-file-input"
            multiple
            onChange={handleReferenceChange}
            type="file"
          />
        </div>

        <textarea
          aria-label="自定义 prompt"
          className="cowart-ai-generation-prompt"
          disabled={isSending}
          onChange={(event) => {
            setPromptValue(event.target.value)
            if (status === 'error') {
              setStatus('idle')
              setErrorMessage('')
            }
          }}
          onKeyDown={handlePromptKeyDown}
          onPaste={handlePromptPaste}
          placeholder="描述你想生成的 HTML 草稿"
          rows={3}
          value={promptValue}
        />

        <div className="cowart-ai-generation-footer">
          <div className="cowart-ai-generation-status" aria-live="polite">
            {status === 'sending'
              ? '正在发送'
              : status === 'sent'
                ? '已发送'
                : errorMessage}
          </div>
          <button
            aria-label="发送草稿请求"
            className="cowart-ai-generation-send"
            disabled={!canSend || isSending}
            type="submit"
          >
            <span>{isSending ? '发送中' : '发送'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}

function CowartStylePanel(props) {
  return (
    <DefaultStylePanel {...props}>
      <DefaultStylePanelContent />
      <CowartAiImageStyleControls />
    </DefaultStylePanel>
  )
}

function CowartAiImageStyleControls() {
  const editor = useEditor()
  const selectedAiHolderShape = useValue(
    'selected cowart ai holder shape',
    () => {
      const selectedShapeIds = editor.getSelectedShapeIds()
      if (selectedShapeIds.length !== 1) return null

      const shape = editor.getShape(selectedShapeIds[0])
      return isCowartAiHolderShape(shape) ? shape : null
    },
    [editor]
  )
  const [widthValue, setWidthValue] = useState('')
  const [heightValue, setHeightValue] = useState('')

  useEffect(() => {
    if (!selectedAiHolderShape) {
      setWidthValue('')
      setHeightValue('')
      return
    }

    setWidthValue(formatAiImageSize(selectedAiHolderShape.props.w))
    setHeightValue(formatAiImageSize(selectedAiHolderShape.props.h))
  }, [selectedAiHolderShape?.id, selectedAiHolderShape?.props.w, selectedAiHolderShape?.props.h])

  if (!selectedAiHolderShape) return null

  const activePreset = getAiImageAspectPreset(selectedAiHolderShape)
  const currentWidth = Number(selectedAiHolderShape.props.w)
  const currentHeight = Number(selectedAiHolderShape.props.h)
  const currentRatio = currentHeight ? currentWidth / currentHeight : 1
  const isAspectLocked = isAiImageAspectLocked(selectedAiHolderShape)

  function updateAiImageSize(nextWidth, nextHeight, historyMark = 'resize-ai-image-holder') {
    const w = clampAiImageSize(nextWidth)
    const h = clampAiImageSize(nextHeight)
    if (!w || !h) return

    editor.markHistoryStoppingPoint(historyMark)
    editor.updateShapes([
      {
        id: selectedAiHolderShape.id,
        type: 'frame',
        meta: {
          ...selectedAiHolderShape.meta,
          cowartAiAspectRatio: w / h
        },
        props: { w, h }
      }
    ])
  }

  function toggleAspectLock() {
    const nextIsLocked = !isAspectLocked
    editor.markHistoryStoppingPoint('toggle-ai-image-aspect-lock')
    editor.updateShapes([
      {
        id: selectedAiHolderShape.id,
        type: 'frame',
        meta: {
          ...selectedAiHolderShape.meta,
          cowartAiAspectLocked: nextIsLocked,
          cowartAiAspectRatio: currentRatio
        }
      }
    ])
  }

  function commitWidth(value) {
    const nextWidth = clampAiImageSize(Number(value))
    if (!nextWidth) {
      setWidthValue(formatAiImageSize(currentWidth))
      return
    }

    const nextHeight = isAspectLocked ? Math.round(nextWidth / currentRatio) : currentHeight
    updateAiImageSize(nextWidth, nextHeight)
  }

  function commitHeight(value) {
    const nextHeight = clampAiImageSize(Number(value))
    if (!nextHeight) {
      setHeightValue(formatAiImageSize(currentHeight))
      return
    }

    const nextWidth = isAspectLocked ? Math.round(nextHeight * currentRatio) : currentWidth
    updateAiImageSize(nextWidth, nextHeight)
  }

  function handleNumberKeyDown(event) {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    }
    if (event.key === 'Escape') {
      setWidthValue(formatAiImageSize(currentWidth))
      setHeightValue(formatAiImageSize(currentHeight))
      event.currentTarget.blur()
    }
  }

  return (
    <div className="cowart-ai-image-style-panel" aria-label="AI 框尺寸设置">
      <section className="cowart-ai-style-section">
        <div className="cowart-ai-style-heading">
          <span>尺寸</span>
        </div>
        <div className="cowart-ai-size-row">
          <label className="cowart-ai-size-field">
            <span>W</span>
            <input
              aria-label="AI 框宽度"
              inputMode="numeric"
              min={AI_IMAGE_SIZE_MIN}
              max={AI_IMAGE_SIZE_MAX}
              value={widthValue}
              onChange={(event) => setWidthValue(event.target.value)}
              onBlur={(event) => commitWidth(event.target.value)}
              onKeyDown={handleNumberKeyDown}
            />
          </label>
          <button
            aria-label={isAspectLocked ? '解除宽高比例锁定' : '锁定宽高比例'}
            aria-pressed={isAspectLocked}
            className="cowart-ai-aspect-lock"
            onClick={toggleAspectLock}
            type="button"
          >
            <CowartAspectLockIcon locked={isAspectLocked} />
          </button>
          <label className="cowart-ai-size-field">
            <span>H</span>
            <input
              aria-label="AI 框高度"
              inputMode="numeric"
              min={AI_IMAGE_SIZE_MIN}
              max={AI_IMAGE_SIZE_MAX}
              value={heightValue}
              onChange={(event) => setHeightValue(event.target.value)}
              onBlur={(event) => commitHeight(event.target.value)}
              onKeyDown={handleNumberKeyDown}
            />
          </label>
        </div>
      </section>

      <section className="cowart-ai-style-section">
        <div className="cowart-ai-style-heading">
          <span>比例</span>
        </div>
        <div className="cowart-ai-aspect-grid">
          {AI_IMAGE_ASPECT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              aria-pressed={activePreset?.id === preset.id}
              className="cowart-ai-aspect-preset"
              onClick={() =>
                updateAiImageSize(preset.w, preset.h, `resize-ai-image-holder:${preset.id}`)
              }
              type="button"
            >
              <span
                className="cowart-ai-aspect-icon"
                style={getAspectIconStyle(preset)}
              />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function CowartAspectLockIcon({ locked }) {
  if (locked) {
    return (
      <svg
        aria-hidden="true"
        className="cowart-ai-lock-icon"
        viewBox="0 0 20 20"
      >
        <rect x="4.5" y="8.5" width="11" height="8" rx="2" />
        <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" />
      </svg>
    )
  }

  return (
    <svg
      aria-hidden="true"
      className="cowart-ai-lock-icon"
      viewBox="0 0 20 20"
    >
      <rect x="4.5" y="8.5" width="11" height="8" rx="2" />
      <path d="M7 8.5V6.5a3 3 0 0 1 5.8-1.1" />
    </svg>
  )
}

function CowartSelectionToolbar() {
  const editor = useEditor()
  const htmlDraftShapeId = useValue(
    'cowart selected html draft toolbar shape id',
    () => {
      const shape = editor.getOnlySelectedShape()
      return isCowartHtmlDraftEmbedShape(shape) ? shape.id : null
    },
    [editor]
  )

  if (htmlDraftShapeId) {
    return <CowartHtmlDraftToolbar draftShapeId={htmlDraftShapeId} />
  }

  return <CowartImageToolbar />
}

function CowartHtmlDraftToolbar({ draftShapeId }) {
  const editor = useEditor()
  const showToolbar = useValue(
    'cowart show html draft toolbar',
    () => editor.isInAny('select.idle', 'select.pointing_shape', 'select.editing_shape'),
    [editor]
  )
  const isLocked = useValue(
    'cowart html draft toolbar locked',
    () => editor.getShape(draftShapeId)?.isLocked === true,
    [editor, draftShapeId]
  )
  const isDomEditing = useValue(
    'cowart html draft dom editing',
    () => editor.getEditingShapeId() === draftShapeId,
    [editor, draftShapeId]
  )
  const getSelectionBounds = useCallback(() => {
    const fullBounds = editor.getSelectionScreenBounds()
    if (!fullBounds) return undefined
    return new Box(fullBounds.x, fullBounds.y, fullBounds.width, 0)
  }, [editor])

  if (!showToolbar || isLocked) return null

  return (
    <TldrawUiContextualToolbar
      className="tlui-media__toolbar tlui-image__toolbar cowart-html-draft__toolbar"
      getSelectionBounds={getSelectionBounds}
      label="AI Html 工具栏"
    >
      {!isDomEditing && (
        <CowartHtmlDraftToolbarButton
          action="download"
          draftShapeId={draftShapeId}
          icon="download"
          label={HTML_DRAFT_DOWNLOAD_LABEL}
        />
      )}
      <CowartHtmlDraftDomEditButton draftShapeId={draftShapeId} isEditing={isDomEditing} />
      {!isDomEditing && (
        <>
          <CowartHtmlDraftToolbarButton
            action="edit"
            draftShapeId={draftShapeId}
            icon="tool-highlight"
            label={HTML_DRAFT_ANNOTATION_EDIT_LABEL}
            showLabel
          />
          <CowartHtmlDraftToolbarButton
            action="image"
            draftShapeId={draftShapeId}
            icon="tool-media"
            iconElement={aiImageToolIcon}
            label={HTML_DRAFT_ANNOTATION_IMAGE_LABEL}
            showLabel
          />
        </>
      )}
    </TldrawUiContextualToolbar>
  )
}

function CowartHtmlDraftDomEditButton({ draftShapeId, isEditing }) {
  const editor = useEditor()
  const [status, setStatus] = useState('idle')
  const label = isEditing ? HTML_DRAFT_DOM_EDIT_DONE_LABEL : HTML_DRAFT_DOM_EDIT_LABEL

  useEffect(() => {
    setStatus('idle')
  }, [draftShapeId, isEditing])

  async function handleClick() {
    if (status === 'saving') return
    if (!isEditing) {
      editor.setEditingShape(draftShapeId)
      editor.setCurrentTool('select.editing_shape')
      window.requestAnimationFrame(() => cowartHtmlDraftIframes.get(draftShapeId)?.focus())
      return
    }

    setStatus('saving')
    try {
      await cowartHtmlDraftDomEditSessions.get(draftShapeId)?.flush()
      editor.setEditingShape(null)
      editor.setCurrentTool('select')
    } catch (error) {
      console.error(error)
      setStatus('error')
    }
  }

  const title =
    status === 'saving'
      ? '正在保存网页内容'
      : status === 'error'
        ? '网页内容保存失败，请重试'
        : label

  return (
    <TldrawUiToolbarButton
      aria-label={title}
      className="cowart-html-draft-toolbar-button"
      data-action="dom-edit"
      data-compact="false"
      data-status={status}
      data-testid="tool.cowart-html-draft-dom-edit"
      disabled={status === 'saving'}
      onClick={handleClick}
      title={title}
      type="icon"
    >
      <TldrawUiButtonIcon icon={isEditing ? 'check' : 'tool-text'} small />
      <span className="cowart-html-draft-toolbar-label">{label}</span>
    </TldrawUiToolbarButton>
  )
}

function CowartHtmlDraftToolbarButton({
  action,
  draftShapeId,
  icon,
  iconElement,
  label,
  showLabel = false
}) {
  const editor = useEditor()
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    setStatus('idle')
  }, [action, draftShapeId])

  useEffect(() => {
    if (status === 'idle' || status === 'sending') return undefined
    const timer = window.setTimeout(() => setStatus('idle'), ANNOTATION_EDIT_STATUS_RESET_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  async function handleClick() {
    if (status === 'sending') return

    setStatus('sending')
    try {
      if (action === 'download') {
        await downloadCowartHtmlDraft(editor, draftShapeId)
      } else {
        await sendHtmlDraftAnnotationRequest(editor, draftShapeId, action)
      }
      setStatus('sent')
    } catch (error) {
      console.error(error)
      setStatus('error')
    }
  }

  const title =
    status === 'sending'
      ? `${label}中`
      : status === 'sent'
        ? `${label}已完成`
        : status === 'error'
          ? `${label}失败，请重试`
          : label
  const statusIcon = status === 'sent' ? 'check' : status === 'error' ? 'warning-triangle' : icon

  return (
    <TldrawUiToolbarButton
      aria-label={title}
      className="cowart-html-draft-toolbar-button"
      data-action={action}
      data-compact={showLabel ? 'false' : 'true'}
      data-status={status}
      data-testid={`tool.cowart-html-draft-${action}`}
      disabled={status === 'sending'}
      onClick={handleClick}
      title={title}
      type="icon"
    >
      {status === 'idle' && iconElement ? (
        iconElement
      ) : (
        <TldrawUiButtonIcon icon={statusIcon} small />
      )}
      {showLabel && <span className="cowart-html-draft-toolbar-label">{label}</span>}
    </TldrawUiToolbarButton>
  )
}

function CowartImageToolbar() {
  return (
    <DefaultImageToolbar>
      <CowartImageToolbarContent />
    </DefaultImageToolbar>
  )
}

function CowartImageToolbarContent() {
  const editor = useEditor()
  const imageShapeId = useValue(
    'cowart selected image shape id',
    () => {
      const shape = editor.getOnlySelectedShape()
      return isImageShape(shape) ? shape.id : null
    },
    [editor]
  )
  const isInCropTool = useValue('cowart image crop tool state', () => editor.isIn('select.crop.'), [
    editor
  ])
  const [isEditingAltText, setIsEditingAltText] = useState(false)

  const handleManipulatingEnd = useCallback(() => {
    editor.setCroppingShape(null)
    editor.setCurrentTool('select.idle')
  }, [editor])
  const handleManipulatingStart = useCallback(() => editor.setCurrentTool('select.crop.idle'), [editor])
  const handleEditAltTextStart = useCallback(() => setIsEditingAltText(true), [])
  const handleEditAltTextClose = useCallback(() => setIsEditingAltText(false), [])

  useEffect(() => {
    setIsEditingAltText(false)
  }, [imageShapeId])

  if (!imageShapeId) return null

  if (isEditingAltText) {
    return (
      <CowartAltTextEditor
        onClose={handleEditAltTextClose}
        shapeId={imageShapeId}
      />
    )
  }

  return (
    <>
      <DefaultImageToolbarContent
        imageShapeId={imageShapeId}
        isManipulating={isInCropTool}
        onEditAltTextStart={handleEditAltTextStart}
        onManipulatingEnd={handleManipulatingEnd}
        onManipulatingStart={handleManipulatingStart}
      />
      {!isInCropTool && <CowartAnnotationEditToolbarButton imageShapeId={imageShapeId} />}
    </>
  )
}

function CowartAltTextEditor({ shapeId, onClose }) {
  const editor = useEditor()
  const msg = useTranslation()
  const trackEvent = useUiEvents()
  const inputRef = useRef(null)
  const isReadonly = editor.getIsReadonly()
  const [altText, setAltText] = useState(() => {
    const shape = editor.getShape(shapeId)
    return typeof shape?.props?.altText === 'string' ? shape.props.altText : ''
  })

  const handleComplete = useCallback(() => {
    trackEvent('set-alt-text', { source: 'image-toolbar' })
    const shape = editor.getShape(shapeId)
    if (shape && 'altText' in shape.props) {
      editor.updateShapes([
        {
          id: shape.id,
          type: shape.type,
          props: { altText }
        }
      ])
    }
    onClose()
  }, [altText, editor, onClose, shapeId, trackEvent])

  useEffect(() => {
    inputRef.current?.select()

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }

    const doc = editor.getContainerDocument()
    doc.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => doc.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [editor, inputRef, onClose])

  useEffect(() => {
    function handlePointerDown(event) {
      const toolbar = editor.getContainerDocument().querySelector('.tlui-media__toolbar')
      if (toolbar?.contains(event.target)) return
      handleComplete()
    }

    const doc = editor.getContainerDocument()
    doc.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => doc.removeEventListener('pointerdown', handlePointerDown, { capture: true })
  }, [editor, handleComplete])

  return (
    <>
      <TldrawUiInput
        ref={inputRef}
        aria-label={msg('tool.media-alt-text-desc')}
        className="tlui-media__toolbar-alt-text-input"
        data-testid="media-toolbar.alt-text-input"
        disabled={isReadonly}
        onCancel={onClose}
        onComplete={handleComplete}
        onValueChange={setAltText}
        placeholder={msg('tool.media-alt-text-desc')}
        value={altText}
      />
      {!isReadonly && (
        <TldrawUiButton
          data-testid="tool.media-alt-text-confirm"
          onClick={handleComplete}
          onPointerDown={(event) => event.preventDefault()}
          title={msg('tool.media-alt-text-confirm')}
          type="icon"
        >
          <TldrawUiButtonIcon icon="check" small />
        </TldrawUiButton>
      )}
    </>
  )
}

function CowartAnnotationEditToolbarButton({ imageShapeId }) {
  const editor = useEditor()
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    if (status === 'idle' || status === 'sending') return
    const timer = window.setTimeout(() => setStatus('idle'), ANNOTATION_EDIT_STATUS_RESET_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  async function handleClick() {
    if (status === 'sending') return

    setStatus('sending')
    try {
      await sendAnnotationEditRequest(editor, imageShapeId)
      setStatus('sent')
    } catch (error) {
      console.error(error)
      setStatus('error')
    }
  }

  const title =
    status === 'sending'
      ? '正在提交标注修改'
      : status === 'sent'
        ? '已提交标注修改'
        : status === 'error'
          ? '提交失败，请重试'
          : ANNOTATION_EDIT_TOOL_LABEL

  return (
    <TldrawUiToolbarButton
      aria-label={title}
      className="cowart-annotation-edit-toolbar-button"
      data-status={status}
      data-testid="tool.cowart-annotation-edit"
      disabled={status === 'sending'}
      onClick={handleClick}
      title={title}
      type="icon"
    >
      <TldrawUiButtonIcon
        icon={status === 'sent' ? 'check' : status === 'error' ? 'warning-triangle' : 'tool-highlight'}
        small
      />
      <span className="cowart-annotation-edit-toolbar-label">{ANNOTATION_EDIT_TOOL_LABEL}</span>
    </TldrawUiToolbarButton>
  )
}

function CowartToolbarItem({ toolId }) {
  const editor = useEditor()
  const isSelected = useValue(
    `is ${toolId} selected`,
    () => editor.getCurrentToolId() === toolId,
    [editor, toolId]
  )

  return <TldrawUiMenuToolItem toolId={toolId} isSelected={isSelected} />
}

function CowartAnnotationToolbarItem() {
  const editor = useEditor()
  const isSelected = useValue(
    'is annotation selected',
    () => editor.getCurrentToolId() === ANNOTATION_TOOL_ID,
    [editor]
  )

  return (
    <button
      aria-label={ANNOTATION_TOOL_LABEL}
      aria-pressed={isSelected ? 'true' : 'false'}
      className="tlui-button tlui-button__tool cowart-annotation-toolbar-button"
      data-testid={`tools.${ANNOTATION_TOOL_ID}`}
      data-value={ANNOTATION_TOOL_ID}
      draggable={false}
      onClick={() => {
        unlockGlobalToolLock(editor)
        editor.setCurrentTool(ANNOTATION_TOOL_ID)
      }}
      onTouchStart={(event) => {
        event.preventDefault()
        unlockGlobalToolLock(editor)
        editor.setCurrentTool(ANNOTATION_TOOL_ID)
      }}
      title={ANNOTATION_TOOL_LABEL}
      type="button"
    >
      {annotationToolIcon}
      <span className="cowart-annotation-toolbar-label" draggable={false}>
        {ANNOTATION_TOOL_LABEL}
      </span>
    </button>
  )
}

function CowartToolbarDivider() {
  return <div aria-orientation="vertical" className="cowart-toolbar-divider" role="separator" />
}

function CowartToolbar(props) {
  return (
    <DefaultToolbar {...props} maxItems={10}>
      <CowartAnnotationToolbarItem />
      <CowartToolbarDivider />
      <SelectToolbarItem />
      <HandToolbarItem />
      <CowartToolbarItem toolId={AI_IMAGE_TOOL_ID} />
      <CowartToolbarItem toolId={AI_DRAFT_TOOL_ID} />
      <CowartToolbarDivider />
      <AssetToolbarItem />
      <DrawToolbarItem />
      <EraserToolbarItem />
      <TextToolbarItem />
      <ArrowToolbarItem />
      <NoteToolbarItem />
      <RectangleToolbarItem />
      <EllipseToolbarItem />
      <TriangleToolbarItem />
      <DiamondToolbarItem />
      <HexagonToolbarItem />
      <OvalToolbarItem />
      <RhombusToolbarItem />
      <StarToolbarItem />
      <CloudToolbarItem />
      <HeartToolbarItem />
      <XBoxToolbarItem />
      <CheckBoxToolbarItem />
      <ArrowLeftToolbarItem />
      <ArrowUpToolbarItem />
      <ArrowDownToolbarItem />
      <ArrowRightToolbarItem />
      <LineToolbarItem />
      <HighlightToolbarItem />
      <LaserToolbarItem />
      <FrameToolbarItem />
    </DefaultToolbar>
  )
}

function getCowartSelection(editor) {
  const selectedShapeIds = editor.getSelectedShapeIds()
  return selectedShapeIds.map((id) => {
    const shape = editor.getShape(id)
    const asset = shape?.props?.assetId ? editor.getAsset(shape.props.assetId) : null
    return {
      id,
      type: shape?.type ?? null,
      parentId: shape?.parentId ?? null,
      x: shape?.x ?? null,
      y: shape?.y ?? null,
      rotation: shape?.rotation ?? null,
      meta: shape?.meta ?? null,
      isAiImageHolder: shape?.meta?.cowartAiImageHolder === true,
      isAiDraftHolder: shape?.meta?.cowartAiDraftHolder === true,
      isHtmlDraft: isCowartHtmlDraftEmbedShape(shape),
      props: shape?.props ?? null,
      asset: asset
        ? {
            id: asset.id,
            type: asset.type,
            name: asset.props?.name ?? null,
            src: asset.props?.src ?? null,
            w: asset.props?.w ?? null,
            h: asset.props?.h ?? null,
            mimeType: asset.props?.mimeType ?? null,
            fileSize: asset.props?.fileSize ?? null
          }
        : null
    }
  })
}

function getCowartSelectionSnapshot(editor) {
  return {
    selectedShapes: getCowartSelection(editor)
  }
}

function getCowartViewState(editor) {
  const camera = editor.getCamera()
  return {
    version: 1,
    currentPageId: editor.getCurrentPageId(),
    camera: {
      x: camera.x,
      y: camera.y,
      z: camera.z
    }
  }
}

function isRestorableViewState(viewState) {
  return (
    viewState &&
    typeof viewState === 'object' &&
    typeof viewState.currentPageId === 'string' &&
    viewState.camera &&
    Number.isFinite(viewState.camera.x) &&
    Number.isFinite(viewState.camera.y) &&
    Number.isFinite(viewState.camera.z)
  )
}

function restoreCowartViewState(editor, viewState) {
  if (!isRestorableViewState(viewState)) return
  if (!editor.getPage(viewState.currentPageId)) return

  editor.setCurrentPage(viewState.currentPageId)
  editor.setCamera(viewState.camera, { immediate: true, force: true })
}

function writeCowartSelectionState(selectionSnapshot) {
  let stateElement = document.getElementById(SELECTION_STATE_ELEMENT_ID)
  if (!stateElement) {
    stateElement = document.createElement('script')
    stateElement.id = SELECTION_STATE_ELEMENT_ID
    stateElement.type = 'application/json'
    document.body.append(stateElement)
  }

  stateElement.textContent = JSON.stringify({
    ...selectionSnapshot,
    updatedAt: new Date().toISOString()
  })
}

export default function App() {
  const [snapshot, setSnapshot] = useState()
  const [viewState, setViewState] = useState()
  const [loadError, setLoadError] = useState(null)
  const [skippedRecords, setSkippedRecords] = useState([])

  useEffect(() => {
    const controller = new AbortController()

    async function loadCanvas() {
      try {
        const canvasState = await loadCowartCanvasState(controller.signal)
        const sanitized = sanitizeCanvasSnapshotForTldraw(canvasState.snapshot)
        setSnapshot(sanitized.snapshot)
        setSkippedRecords(sanitized.skippedRecords)
        setViewState(canvasState.viewState ?? null)
      } catch (error) {
        if (error.name === 'AbortError') return
        setLoadError(error)
        setSnapshot(null)
        setViewState(null)
      }
    }

    loadCanvas()

    return () => controller.abort()
  }, [])

  const handleMount = useCallback((editor) => {
    window.__cowartEditor = editor
    window.__cowartSelection = () => getCowartSelection(editor)
    window.__cowartViewState = () => getCowartViewState(editor)
    let lastSyncedSelectionState = ''
    let isSelectionStateSaving = false
    let hasPendingSelectionState = false
    let lastSyncedViewState = ''
    let isViewStateSaving = false
    let hasPendingViewState = false

    editor.timers.requestAnimationFrame(() => {
      restoreCowartViewState(editor, viewState)
    })

    async function syncSelectionState() {
      const selectionSnapshot = getCowartSelectionSnapshot(editor)
      writeCowartSelectionState(selectionSnapshot)

      const selectionState = JSON.stringify(selectionSnapshot)
      if (selectionState === lastSyncedSelectionState) return
      lastSyncedSelectionState = selectionState

      if (isSelectionStateSaving) {
        hasPendingSelectionState = true
        return
      }

      isSelectionStateSaving = true
      try {
        await saveCowartSelectionState({
          ...selectionSnapshot,
          updatedAt: new Date().toISOString()
        })
      } catch (error) {
        console.error(error)
      } finally {
        isSelectionStateSaving = false
        if (hasPendingSelectionState) {
          hasPendingSelectionState = false
          syncSelectionState()
        }
      }
    }

    syncSelectionState()
    const selectionStateTimer = window.setInterval(syncSelectionState, 250)

    async function syncViewState() {
      const viewStateSnapshot = {
        ...getCowartViewState(editor),
        updatedAt: new Date().toISOString()
      }

      const nextViewState = JSON.stringify(viewStateSnapshot)
      if (nextViewState === lastSyncedViewState) return
      lastSyncedViewState = nextViewState

      if (isViewStateSaving) {
        hasPendingViewState = true
        return
      }

      isViewStateSaving = true
      try {
        await saveCowartViewState(viewStateSnapshot)
      } catch (error) {
        console.error(error)
      } finally {
        isViewStateSaving = false
        if (hasPendingViewState) {
          hasPendingViewState = false
          syncViewState()
        }
      }
    }

    const viewStateTimer = window.setInterval(syncViewState, 500)
    editor.timers.setTimeout(syncViewState, 100)

    let saveTimer = null
    let isSaving = false
    let hasPendingSave = false
    let hasUnsavedChanges = false
    let isSyncingAnnotationShape = false
    let remoteLoadController = null
    const acknowledgedImageShapeDeletes = new Set()

    async function saveCanvas() {
      if (!hasUnsavedChanges) return

      if (isSaving) {
        hasPendingSave = true
        return
      }

      isSaving = true
      try {
        const saveResult = await saveCowartCanvasSnapshot(editor.store.getStoreSnapshot(), {
          protectImageRecords: true,
          acknowledgedImageShapeDeletes: Array.from(acknowledgedImageShapeDeletes)
        })
        if (saveResult?.ok === false) {
          throw new Error(saveResult.message || 'Cowart refused to save the canvas snapshot.')
        }
        acknowledgedImageShapeDeletes.clear()
        hasUnsavedChanges = false
      } catch (error) {
        console.error(error)
      } finally {
        isSaving = false
        if (hasPendingSave) {
          hasPendingSave = false
          scheduleSave()
        }
      }
    }

    function scheduleSave() {
      hasUnsavedChanges = true
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(saveCanvas, 500)
    }

    async function loadRemoteCanvasSnapshot() {
      remoteLoadController?.abort()
      const controller = new AbortController()
      remoteLoadController = controller

      const preserveLocalChanges = hasUnsavedChanges || isSaving
      const preFetchStore = preserveLocalChanges ? null : editor.store.getStoreSnapshot().store

      try {
        const nextSnapshot = await refreshCowartCanvasSnapshot(controller.signal)
        const effectivePreserve =
          preserveLocalChanges || (preFetchStore && storeChangedSinceSnapshot(editor, preFetchStore))
        const { changedRecords, skippedRecords: nextSkippedRecords } = applyRemoteCanvasSnapshot(
          editor,
          nextSnapshot,
          {
            preserveLocalChanges: effectivePreserve
          }
        )
        setSkippedRecords(nextSkippedRecords)

        if (changedRecords > 0 && effectivePreserve) {
          hasUnsavedChanges = true
          if (isSaving) {
            hasPendingSave = true
          } else {
            scheduleSave()
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') return
        console.error(error)
      } finally {
        if (remoteLoadController === controller) {
          remoteLoadController = null
        }
      }
    }

    const unsubscribe = editor.store.listen(
      ({ changes }) => {
        for (const imageShapeId of collectRemovedImageShapeIds(changes)) {
          acknowledgedImageShapeDeletes.add(imageShapeId)
        }
        scheduleSave()
      },
      {
        source: 'user',
        scope: 'document'
      }
    )

    let canvasEvents = null
    let canvasRefreshTimer = null
    if (hasCowartWidgetBridge()) {
      canvasRefreshTimer = window.setInterval(loadRemoteCanvasSnapshot, 1600)
    } else if (!IS_COWART_WIDGET_BUILD && 'EventSource' in window) {
      canvasEvents = new window.EventSource('/api/canvas-events')
      canvasEvents.addEventListener('canvas-changed', loadRemoteCanvasSnapshot)
      canvasEvents.onerror = (error) => {
        console.warn('Cowart canvas live refresh disconnected.', error)
      }
    }

    const unsubscribeAnnotationEditingToolLock = editor.store.listen(
      ({ changes }) => {
        for (const [previous, next] of Object.values(changes.updated)) {
          if (previous?.typeName !== 'instance_page_state') continue
          if (!previous.editingShapeId || next.editingShapeId) continue

          const shape = editor.getShape(previous.editingShapeId)
          if (shape?.meta?.cowartAnnotationArrow !== true) continue

          editor.timers.requestAnimationFrame(() => {
            if (editor.getEditingShapeId()) return
            if (editor.getCurrentToolId() !== 'select') return
            editor.setCurrentTool(ANNOTATION_TOOL_ID)
          })
        }
      },
      {
        source: 'all',
        scope: 'session'
      }
    )

    const unsubscribeAnnotationShapeSync = editor.store.listen(
      ({ changes }) => {
        if (isSyncingAnnotationShape) return

        const updates = []
        for (const [_previous, next] of Object.values(changes.updated)) {
          if (next?.typeName !== 'shape') continue
          if (next.type !== 'arrow') continue
          if (next.meta?.cowartAnnotationArrow !== true) continue

          const props = {}
          if (next.props?.color !== next.props?.labelColor) {
            props.labelColor = next.props.color
          }
          if (next.props?.labelPosition !== ANNOTATION_LABEL_POSITION) {
            props.labelPosition = ANNOTATION_LABEL_POSITION
          }

          if (Object.keys(props).length === 0) continue

          updates.push({
            id: next.id,
            type: 'arrow',
            props
          })
        }

        if (updates.length === 0) return

        isSyncingAnnotationShape = true
        try {
          editor.updateShapes(updates)
        } finally {
          isSyncingAnnotationShape = false
        }
      },
      {
        source: 'all',
        scope: 'document'
      }
    )

    return () => {
      window.clearTimeout(saveTimer)
      window.clearInterval(selectionStateTimer)
      window.clearInterval(viewStateTimer)
      window.clearInterval(canvasRefreshTimer)
      remoteLoadController?.abort()
      canvasEvents?.close()
      if (window.__cowartEditor === editor) {
        delete window.__cowartEditor
        delete window.__cowartSelection
        delete window.__cowartViewState
      }
      document.getElementById(SELECTION_STATE_ELEMENT_ID)?.remove()
      unsubscribe()
      unsubscribeAnnotationEditingToolLock()
      unsubscribeAnnotationShapeSync()
      syncViewState()
      saveCanvas()
    }
  }, [viewState])

  if (snapshot === undefined || viewState === undefined) {
    return (
      <main className="cowart-status" aria-live="polite">
        Loading canvas...
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="cowart-status" aria-live="polite">
        Canvas file could not be loaded.
      </main>
    )
  }

  return (
    <main className="cowart-canvas" aria-label="Cowart infinite canvas">
      <SkippedRecordsNotice records={skippedRecords} />
      <Tldraw
        snapshot={snapshot ?? undefined}
        assetUrls={cowartAssetUrls}
        assets={cowartTldrawAssetStore}
        inferDarkMode
        onMount={handleMount}
        overrides={cowartUiOverrides}
        components={cowartComponents}
        shapeUtils={cowartShapeUtils}
        tools={[CowartAnnotationTool]}
      />
    </main>
  )
}

function SkippedRecordsNotice({ records }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const recordsKey = records
    .map((record) => `${record.id}:${record.typeName ?? ''}:${record.type ?? ''}:${record.reason}`)
    .join('\n')

  useEffect(() => {
    if (!records.length) {
      setIsVisible(false)
      setIsDetailsOpen(false)
      return
    }

    setIsVisible(true)
    setIsDetailsOpen(false)
  }, [records.length, recordsKey])

  useEffect(() => {
    if (!records.length || !isVisible || isDetailsOpen) return undefined

    const noticeTimer = window.setTimeout(() => {
      setIsVisible(false)
    }, SKIPPED_RECORDS_NOTICE_AUTO_HIDE_MS)

    return () => window.clearTimeout(noticeTimer)
  }, [records.length, recordsKey, isVisible, isDetailsOpen])

  if (!records.length || !isVisible) return null

  return (
    <aside className="cowart-skipped-records" aria-live="polite">
      <strong>Skipped {records.length} invalid canvas record{records.length === 1 ? '' : 's'}.</strong>
      <span>Valid content was loaded.</span>
      <details open={isDetailsOpen} onToggle={(event) => setIsDetailsOpen(event.currentTarget.open)}>
        <summary>Details</summary>
        <ul>
          {records.slice(0, 8).map((record, index) => (
            <li key={`${record.id}:${index}`}>
              <code>{record.id}</code>
              {record.typeName ? ` ${record.typeName}` : ''}
              {record.type ? `/${record.type}` : ''}: {record.reason}
            </li>
          ))}
        </ul>
      </details>
    </aside>
  )
}
