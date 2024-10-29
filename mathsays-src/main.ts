#!/usr/bin/env deno --allow-net=[::]:8000 --allow-run=sh --no-prompt
import type { EmulatedCanvas2DContext } from "https://deno.land/x/canvas@v1.4.2/mod.ts";
import { createCanvas } from "https://deno.land/x/canvas@v1.4.2/mod.ts";

// calc canvas size by text
function calculateCanvasSize(
  context: EmulatedCanvas2DContext,
  text: string,
  fontSize: number,
  fontFace: string,
) {
  const lines = text.split("\n");
  const maxLineWidth = Math.max(
    ...lines.map((line) => context.measureText(line).width),
  );
  const lineHeight = fontSize * 1.2; // adjust line height
  const canvasHeight = lines.length * lineHeight;
  return { width: maxLineWidth + 40, height: canvasHeight + 40 };
}

const textDecoder = new TextDecoder()
async function sayCli(t) {
  const cmd = new Deno.Command("sh", {
    args: ["-c", 'deno cowsay-cli.ts "' + t.replace(/"/g, '\\"') + '"'],
  });
  const { code, stdout, stderr } = await cmd.output();
  return textDecoder.decode(stdout);
}

async function generateImage(t) {
  let cowsayText = await sayCli(t);

  if (!cowsayText) cowsayText = 'Generate mathsays error!'

  const fontSize = 16;
  const fontFace = "monospace";

  const tempCanvas = createCanvas(1, 1);
  const context = tempCanvas.getContext("2d");
  context.font = `${fontSize}px ${fontFace}`;

  const { width, height } = calculateCanvasSize(
    context,
    cowsayText,
    fontSize,
    fontFace,
  );
  tempCanvas.dispose() // cleanup

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff"; // white background
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000000"; // black text
  ctx.font = `${fontSize}px ${fontFace}`;

  // draw text without wrapping
  const marginLeft = 20;
  const marginTop = 30;
  cowsayText.split("\n").forEach((line, index) => {
    if (line == '') line = ' ' // fix
    ctx.fillText(line, marginLeft, marginTop + index * fontSize * 1.2);
  });

  const buffer = canvas.toBuffer("image/png");

  canvas.dispose() // cleanup

  return buffer
}

Deno.serve({
  hostname: `[::]`,
  port: 8000,
}, async (req: Request) => {
  const url = new URL(req.url, "a://b");
  const text = url.searchParams.get("t");
  return new Response(await generateImage(text), {
    headers: {
      "Content-Type": "image/png",
    },
  });
});
