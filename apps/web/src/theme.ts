import { createTheme } from "@mantine/core";

const fontFamily = "Inter, 'Segoe UI', sans-serif";
const fontFamilyMonospace = "'Cascadia Code', 'SFMono-Regular', Consolas, monospace";

export const theme = createTheme({
  primaryColor: "hiveSky",
  primaryShade: { light: 7, dark: 4 },
  defaultRadius: "sm",
  fontFamily,
  fontFamilyMonospace,
  headings: { fontFamily, fontWeight: "600" },
  fontSizes: { xs: "0.75rem", sm: "0.875rem", md: "1rem", lg: "1.125rem", xl: "1.25rem" },
  spacing: { xs: "0.5rem", sm: "0.75rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
  shadows: {
    xs: "0 1px 2px rgba(0, 0, 0, 0.16)",
    sm: "0 3px 10px rgba(0, 0, 0, 0.2)",
    md: "0 8px 24px rgba(0, 0, 0, 0.22)",
    lg: "0 12px 32px rgba(0, 0, 0, 0.24)",
    xl: "0 16px 40px rgba(0, 0, 0, 0.26)",
  },
  colors: {
    hiveSky: ["#EAF8FD", "#D2EFF8", "#B8E4F3", "#9CD8ED", "#83C7E8", "#65B6DD", "#479CC5", "#327D9F", "#255F79", "#194355"],
    dark: ["#F0F4F8", "#D8E0E8", "#C0CBD5", "#95A3B0", "#667585", "#4C5B6A", "#364453", "#25313E", "#1D2733", "#18202A"],
    hiveSuccess: ["#EAFBF2", "#D4F5E3", "#B7EACF", "#91DDB7", "#68D2A0", "#46B982", "#319B6A", "#267A55", "#1D5B41", "#143F2F"],
    hiveWarning: ["#FFF8E8", "#FBEFCF", "#F6E1AA", "#F0D184", "#EDBF69", "#D9A746", "#B8872E", "#916A24", "#6C4F1C", "#493514"],
    hiveError: ["#FFF1F0", "#FDE0DE", "#FAC7C3", "#F6A8A1", "#F18B82", "#DB6D66", "#BA514D", "#933C3A", "#6F2D2C", "#4C201F"],
    hiveInfo: ["#EFF7FF", "#D9EBFF", "#C0DEFF", "#9BCBFA", "#77B7F3", "#589DE0", "#417FC0", "#32649A", "#274B73", "#1D354F"],
  },
  components: {
    Button: { defaultProps: { size: "sm", radius: "sm" }, styles: { root: { fontWeight: 600, transition: "background-color 140ms ease, border-color 140ms ease, color 140ms ease" } } },
    ActionIcon: { defaultProps: { radius: "sm" } },
    Avatar: { defaultProps: { radius: "sm" } },
    Badge: { defaultProps: { radius: "sm" } },
    Input: { defaultProps: { size: "sm", radius: "sm" } },
    Modal: { defaultProps: { radius: "md" } },
    Menu: { defaultProps: { radius: "sm" } },
    NavLink: { styles: { root: { borderRadius: "var(--mantine-radius-sm)", transition: "background-color 140ms ease, color 140ms ease" } } },
    Paper: { defaultProps: { radius: "md" } },
  },
});
