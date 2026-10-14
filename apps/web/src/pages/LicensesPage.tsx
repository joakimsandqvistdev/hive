import { Anchor, Badge, Code, Paper, Stack, Text, Title } from "@mantine/core";

const mitTerms = `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

function LicenseNotice({ copyright }: { copyright: string }) {
  return <Code className="license-text" block>{`Copyright (c) ${copyright}\n\n${mitTerms}`}</Code>;
}

export function LicensesPage() {
  return (
    <Stack className="workspace-page" gap="lg">
      <Stack gap={3}><Text className="page-eyebrow">About this app</Text><Title order={1} className="page-title">Open-source licenses</Title></Stack>
      <Text c="dimmed" maw={760}>This page lists third-party software and model weights used by Hive, with links to their sources and license terms.</Text>
      <Paper className="license-card" withBorder>
        <Stack gap="sm">
          <div><Badge variant="light" color="hiveSky">MIT</Badge></div>
          <Title order={2} size="h4">Chatbot Flow Builder Starter Kit</Title>
          <Text size="sm" c="dimmed">By Denish Sharma. Listed as the upstream starter-kit reference for this editor; Hive currently uses the separately licensed @xyflow/react package for its canvas.</Text>
          <Text size="sm">Source: <Anchor href="https://github.com/denishsharma/chatbot-flow-builder-starter-kit" target="_blank" rel="noreferrer">denishsharma/chatbot-flow-builder-starter-kit</Anchor></Text>
          <LicenseNotice copyright="2025 Denish Sharma" />
        </Stack>
      </Paper>
      <ModelLicense title="InstructPix2Pix model weights" license="CreativeML Open RAIL-M" source="https://huggingface.co/timbrooks/instruct-pix2pix" licenseUrl="https://huggingface.co/spaces/timbrooks/instruct-pix2pix/blob/main/LICENSE" description="Instruction-based image editing. The repository carries MIT metadata for some material, but its license file notes that model checkpoints derive from Stable Diffusion and may be subject to additional restrictions; review the checkpoint license before use." />
      <ModelLicense title="Stable Diffusion 1.5 Inpainting model weights" license="CreativeML Open RAIL-M" source="https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-inpainting" licenseUrl="https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-inpainting/blob/main/LICENSE" description="Inpainting model for editing masked portions of an image. Hive does not bundle the weights." />
      <ModelLicense title="LongCat-Image-Edit-Turbo model weights" license="Apache 2.0" source="https://huggingface.co/meituan-longcat/LongCat-Image-Edit-Turbo" licenseUrl="https://github.com/meituan-longcat/LongCat-Image/blob/main/LICENSE" description="Distilled instruction-based image editing model. Hive does not bundle the weights." />
      <ModelLicense title="FLUX.2 Klein 4B model weights" license="Apache 2.0" source="https://huggingface.co/black-forest-labs/FLUX.2-klein-4B" licenseUrl="https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/blob/main/LICENSE" description="Text-to-image and reference-image editing model. Hive does not bundle the weights." />
      <ModelLicense title="Stable Diffusion 1.5 model weights" license="CreativeML Open RAIL-M" source="https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5" licenseUrl="https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/blob/main/LICENSE.md" description="Lightweight text-to-image model. The license includes use-based restrictions; review the model card and terms. Hive downloads weights to the local Docker runner." />
      <ModelLicense title="SDXL Base 1.0 model weights" license="CreativeML Open RAIL++-M" source="https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0" licenseUrl="https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md" description="Higher-resolution text-to-image model. The license includes use-based restrictions; review the model card and terms. Hive downloads weights to the local Docker runner." />
      <ModelLicense title="Stable Diffusion 3.5 Medium model weights" license="Stability AI Community License" source="https://huggingface.co/stabilityai/stable-diffusion-3.5-medium" licenseUrl="https://stability.ai/license" description="Text-to-image model with three text encoders. Hugging Face access approval is required before downloading. The Community License permits free use below its stated $1M annual revenue threshold; see the agreement for conditions. Hive downloads weights to the local Docker runner." />
      <ModelLicense title="SDXL-Turbo model weights" license="Stability AI Non-Commercial Research Community License" source="https://huggingface.co/stabilityai/sdxl-turbo" licenseUrl="https://huggingface.co/stabilityai/sdxl-turbo/blob/main/LICENSE.TXT" description="Fast text-to-image model. The listed license grants non-commercial/research use; production or commercial use requires separate Stability AI terms. Hive downloads weights to the local Docker runner." />
      <ModelLicense title="Sana Sprint 0.6B model weights" license="Apache 2.0 (Gemma encoder terms also apply)" source="https://huggingface.co/Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers" licenseUrl="https://ai.google.dev/gemma/terms" description="One-to-four-step text-to-image model. The model card identifies Gemma 2 as its text encoder, so Google Gemma terms and prohibited-use policy also apply. Hive downloads weights to the local Docker runner." />
      <ModelLicense title="Wan2.1 T2V 1.3B model weights" license="Apache 2.0" source="https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B" licenseUrl="https://www.apache.org/licenses/LICENSE-2.0" description="Text-to-video model weights published by the Wan team. Hive downloads the weights to the local Docker runner and does not bundle them." />
      <ModelLicense title="CogVideoX-2B model weights" license="Apache 2.0" source="https://huggingface.co/zai-org/CogVideoX-2b" licenseUrl="https://www.apache.org/licenses/LICENSE-2.0" description="Text-to-video model weights published by Z.ai. This entry covers the 2B model only; the 5B model has separate terms. Hive downloads the weights to the local Docker runner and does not bundle them." />
      <Paper className="license-card" withBorder>
        <Stack gap="sm">
          <div><Badge variant="light" color="hiveSky">Apache 2.0</Badge></div>
          <Title order={2} size="h4">Z-Image-Turbo model weights</Title>
          <Text size="sm" c="dimmed">By Tongyi-MAI. Hive does not bundle the weights; download the model from the Models view to the local Docker runner.</Text>
          <Text size="sm">Model source: <Anchor href="https://huggingface.co/Tongyi-MAI/Z-Image-Turbo" target="_blank" rel="noreferrer">Tongyi-MAI/Z-Image-Turbo</Anchor></Text>
          <Text size="sm">License: <Anchor href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">Apache License, Version 2.0</Anchor></Text>
        </Stack>
      </Paper>
      <Paper className="license-card" withBorder>
        <Stack gap="sm">
          <div><Badge variant="light" color="hiveSky">Apache 2.0</Badge></div>
          <Title order={2} size="h4">Qwen-Image-Edit-2511 model weights</Title>
          <Text size="sm" c="dimmed">By the Qwen Team. Hive does not bundle the weights; download the model from the Models view to the local Docker runner.</Text>
          <Text size="sm">Model source: <Anchor href="https://huggingface.co/Qwen/Qwen-Image-Edit-2511" target="_blank" rel="noreferrer">Qwen/Qwen-Image-Edit-2511</Anchor></Text>
          <Text size="sm">License: <Anchor href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">Apache License, Version 2.0</Anchor></Text>
        </Stack>
      </Paper>
      <Paper className="license-card" withBorder>
        <Stack gap="sm">
          <div><Badge variant="light" color="hiveSky">MIT</Badge></div>
          <Title order={2} size="h4">React Flow (@xyflow/react)</Title>
          <Text size="sm" c="dimmed">The node-based editor library used to render and connect workflow nodes. Copyright (c) 2019–2025 webkid GmbH.</Text>
          <Text size="sm">Source: <Anchor href="https://github.com/xyflow/xyflow" target="_blank" rel="noreferrer">xyflow/xyflow</Anchor></Text>
          <LicenseNotice copyright="2019-2025 webkid GmbH" />
        </Stack>
      </Paper>
    </Stack>
  );
}

function ModelLicense({ title, license, source, licenseUrl, description }: { title: string; license: string; source: string; licenseUrl: string; description: string }) {
  return <Paper className="license-card" withBorder><Stack gap="sm"><div><Badge variant="light" color="hiveSky">{license}</Badge></div><Title order={2} size="h4">{title}</Title><Text size="sm" c="dimmed">{description}</Text><Text size="sm">Model source: <Anchor href={source} target="_blank" rel="noreferrer">{source.replace("https://huggingface.co/", "")}</Anchor></Text><Text size="sm">License: <Anchor href={licenseUrl} target="_blank" rel="noreferrer">{license}</Anchor></Text></Stack></Paper>;
}
