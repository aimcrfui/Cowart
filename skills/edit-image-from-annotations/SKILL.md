---
name: edit-image-from-annotations
description: Generate new AI images from user-supplied Cowart annotation screenshots. Use when the user provides one or more screenshots showing Cowart images marked with the 批注 tool, arrows, or visible edit notes and wants Codex to apply those requested changes, create revised bitmap images, and place each result beside the corresponding original without replacing, moving, hiding, or deleting the original images or annotations.
---

# Edit Image From Annotations

Use this skill to turn user-provided Cowart 批注 screenshots into revised AI-generated bitmaps placed next to the corresponding original images.

## Preconditions

The Cowart service should be running for the active project, usually at:

```text
http://127.0.0.1:43217
```

The user is responsible for providing the relevant screenshot(s). Do not auto-capture the current canvas and do not scan the whole canvas to infer edit requests; a canvas may contain many images with different annotations.

## Workflow

1. Read the user-provided screenshot(s).

   Treat each screenshot as the authoritative edit brief for one output image unless the user says multiple screenshots belong to the same image.

   If the user provides multiple screenshots, process them independently and keep their generated outputs separate. Do not merge annotations across screenshots unless explicitly requested.

2. Extract the edit requirements from each screenshot.

   Read visible 批注 labels, arrows, and nearby edit notes from the screenshot itself. Use the arrow tip or marked region to understand where each note applies.

   Ignore editor chrome such as toolbars, blue selection outlines, resize handles, cursor icons, and unrelated neighboring images.

3. Choose the source image for generation.

   Use the clean underlying image content visible in the provided screenshot as the visual base whenever possible.

   If the screenshot is too cropped, obstructed, or low-resolution to serve as a good image base, ask the user for the original image export or a cleaner screenshot of that specific image.

   Do not read the current Cowart canvas to discover which image the screenshot refers to. If placement back into Cowart is required, ask the user to select the corresponding original image or `AI 图片` frame before insertion.

4. Prepare image-generation input.

   Use the provided screenshot, plus a cleaner source image if the user supplied one.

   The generation prompt should:

   - apply the 批注 text as edit instructions
   - preserve the original image's subject, composition, aspect ratio, and style unless an annotation asks otherwise
   - remove all annotation artifacts from the output, including red arrows, labels, blue selection outlines, handles, and tool UI
   - output only the revised clean image

5. Generate a new bitmap.

   Use the built-in image generation flow available in the current environment. Do not overwrite the source image file. Save the new bitmap with a timestamped filename, for example:

   ```text
   annotation-edit-20260620-153012.png
   ```

6. Insert the revised image beside the original.

   Add a new tldraw image asset and a new image shape. Do not update, remove, hide, reparent, or reorder the original image, the original `AI 图片` frame, or any annotation shapes.

   Before insertion, require a clear placement anchor:

   - If the user has selected the original image, use that image as the anchor.
   - If the user has selected the original `AI 图片` frame, use that frame as the anchor.
   - If there are multiple screenshots/outputs, ask the user to select each corresponding anchor or provide an explicit placement order.
   - If no anchor is clear, provide the generated image file and ask the user which original it should sit beside.

   Placement rules:

   - If the source image is inside an `AI 图片` frame, use the frame's page-level bounds as the anchor and place the new image as a sibling of that frame.
   - Otherwise use the source image's own bounds and parent.
   - Place the new image to the right of the anchor with a margin of about `40` canvas units.
   - Match the displayed width and height of the anchor unless the user asks for a different size.
   - If that position would overlap existing content, keep moving right by `anchor width + 40` until the new image is clear.

   Recommended shape metadata:

   ```json
   {
     "cowartGeneratedFromAnnotationEdit": true,
     "cowartAnnotationSourceShapeId": "<selected source image or frame id>",
     "cowartAnnotationScreenshot": "<source screenshot file name when available>"
   }
   ```

7. Save through Cowart.

   Only do Cowart state access after the bitmap is generated and the user has selected or identified the placement anchor. Use this access only to insert the new image beside that anchor, not to discover edit intent or choose among many annotated images.

   Prefer updating the required store snapshot and saving through:

   ```bash
   curl -s -X PUT http://127.0.0.1:43217/api/canvas \
     -H 'content-type: application/json' \
     --data-binary @<updated-snapshot.json>
   ```

   Use page-local image asset URLs:

   ```text
   /page-assets/<page-dir>/<filename>
   ```

   The Cowart server will preserve per-page snapshots under:

   ```text
   canvas/pages/<page-id-without-page-prefix>/cowart-canvas.json
   ```

8. Verify visually.

   Refresh the Cowart tab or let Vite hot-reload, then confirm:

   - the original image is still in the same place
   - the original 批注 arrows and labels are still visible
   - the new revised image appears beside the original
   - the new image does not include annotation arrows, labels, selections, or UI chrome

## Guardrails

- Never replace the original image unless the user explicitly asks for replacement.
- Never delete or move annotation shapes; they are the visible edit brief.
- Never put the revised image inside the original `AI 图片` frame, because that can cover the old image and make the before/after comparison harder.
- Never auto-capture or scan the current canvas for edit intent; use the screenshot(s) supplied by the user.
- If the annotations contradict each other, generate the most literal combined interpretation and mention the ambiguity.
- If a supplied screenshot shows selected-state outlines or toolbar UI, treat them as context only, not as content to generate.
