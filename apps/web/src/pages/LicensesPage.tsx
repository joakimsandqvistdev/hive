import { Anchor, Badge, Paper, Stack, Text, Title } from "@mantine/core";

export function LicensesPage() {
  return (
    <Stack className="workspace-page" gap="lg">
      <Text c="dimmed" maw={760}>This page lists third-party software and model weights used by Hive, with links to their sources and license terms. <Anchor href="/THIRD-PARTY-NOTICES.txt" target="_blank" rel="noreferrer">View bundled dependency notices</Anchor>.</Text>
      <Paper className="license-card" withBorder>
        <Stack gap="sm">
          <div><Badge variant="light" color="hiveSky">Apache 2.0</Badge></div>
          <Title order={2} size="h4">ionodes</Title>
          <Text size="sm" c="dimmed">Reusable React node graph editor used to build and edit Hive workflows.</Text>
          <Text size="sm">Source: <Anchor href="https://github.com/joakimsandqvistdev/ionodes" target="_blank" rel="noreferrer">joakimsandqvistdev/ionodes</Anchor></Text>
          <Text size="sm">License: <Anchor href="https://github.com/joakimsandqvistdev/ionodes/blob/v0.1.1/LICENSE" target="_blank" rel="noreferrer">Apache License, Version 2.0</Anchor></Text>
        </Stack>
      </Paper>
      <ModelLicense title="Sharp image processing library" license="Apache 2.0 + native dependency notices" source="https://github.com/lovell/sharp" licenseUrl="https://www.apache.org/licenses/LICENSE-2.0" description="Used by the built-in Processing nodes to composite and encode generated image artifacts. Its platform binaries include libvips and other components under additional licenses; see the bundled dependency notices." />
      <ModelLicense title="Liberation Fonts" license="SIL Open Font License 1.1" source="https://github.com/liberationfonts/liberation-fonts" licenseUrl="https://github.com/liberationfonts/liberation-fonts/blob/main/LICENSE" description="Sans, serif, and monospace fonts installed in the local app image for consistent Text Overlay rendering." />
      <ModelLicense title="DejaVu Fonts" license="Bitstream Vera License with DejaVu changes in the public domain" source="https://github.com/dejavu-fonts/dejavu-fonts" licenseUrl="https://github.com/dejavu-fonts/dejavu-fonts/blob/master/LICENSE" description="Sans, serif, and monospace families available to Text Overlay in the local app image." />
      <ModelLicense title="Lato" license="SIL Open Font License 1.1" source="https://github.com/google/fonts/tree/main/ofl/lato" licenseUrl="https://github.com/google/fonts/blob/main/ofl/lato/OFL.txt" description="Humanist sans-serif font available to Text Overlay in the local app image." />
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
      <ModelLicense title="Kokoro-82M model weights" license="Apache 2.0" source="https://huggingface.co/hexgrad/Kokoro-82M" licenseUrl="https://www.apache.org/licenses/LICENSE-2.0" description="Text-to-speech model weights. Hive downloads these weights on demand and does not bundle them. The current Hive integration exposes selected English voices; see the model card and voice documentation for voice-specific source and attribution details." />
      <ModelLicense title="Kokoro Python package" license="Apache 2.0" source="https://github.com/hexgrad/kokoro" licenseUrl="https://github.com/hexgrad/kokoro/blob/main/LICENSE" description="Python inference package used by the local runner. The package is installed separately from the model weights." />
      <ModelLicense title="spaCy English pipeline model (en_core_web_sm)" license="MIT" source="https://github.com/explosion/spacy-models/releases/tag/en_core_web_sm-3.8.0" licenseUrl="https://github.com/explosion/spacy-models/blob/master/meta/en_core_web_sm-3.8.0.json" description="English tokenization and tagging data downloaded into the persistent model cache with Kokoro. The model metadata declares MIT licensing and supports spaCy 3.8.x." />
      <ModelLicense title="eSpeak NG speech engine" license="GPL-3.0-or-later" source="https://github.com/espeak-ng/espeak-ng" licenseUrl="https://github.com/espeak-ng/espeak-ng/blob/master/COPYING" description="Speech engine installed in the runner image as a Kokoro pronunciation dependency. The upstream project includes components under additional licenses; see its repository notices." />
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
    </Stack>
  );
}

function ModelLicense({ title, license, source, licenseUrl, description }: { title: string; license: string; source: string; licenseUrl: string; description: string }) {
  return <Paper className="license-card" withBorder><Stack gap="sm"><div><Badge variant="light" color="hiveSky">{license}</Badge></div><Title order={2} size="h4">{title}</Title><Text size="sm" c="dimmed">{description}</Text><Text size="sm">Model source: <Anchor href={source} target="_blank" rel="noreferrer">{source.replace("https://huggingface.co/", "")}</Anchor></Text><Text size="sm">License: <Anchor href={licenseUrl} target="_blank" rel="noreferrer">{license}</Anchor></Text></Stack></Paper>;
}
