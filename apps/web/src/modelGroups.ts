export type ModelId = "z-image-turbo" | "qwen-image-edit-2511" | "instruct-pix2pix" | "sd15-inpainting" | "longcat-image-edit-turbo" | "flux2-klein-4b" | "sd15-base" | "sdxl-base-1.0" | "sd35-medium" | "sdxl-turbo" | "sana-sprint-06b" | "wan2.1-t2v-1.3b" | "cogvideox-2b";

export const modelGroups: Array<{ id: string; title: string; description: string; modelIds: ModelId[] }> = [
  {
    id: "text-to-image",
    title: "Text-to-image models",
    description: "Generate an image directly from a text prompt.",
    modelIds: ["z-image-turbo", "sd15-base", "sdxl-base-1.0", "sd35-medium", "sdxl-turbo", "sana-sprint-06b"],
  },
  {
    id: "image-to-image",
    title: "Image-to-image and editing models",
    description: "Use one or more input images from connected workflow nodes to edit or inpaint an image.",
    modelIds: ["qwen-image-edit-2511", "instruct-pix2pix", "sd15-inpainting", "longcat-image-edit-turbo", "flux2-klein-4b"],
  },
  {
    id: "text-to-video",
    title: "Text-to-video models",
    description: "Generate short videos from text prompts. These models do not accept image inputs in Hive workflows.",
    modelIds: ["wan2.1-t2v-1.3b", "cogvideox-2b"],
  },
];
