import { createTheme } from "@mantine/core";

const fontFamily = "Inter, 'Segoe UI', sans-serif";
const fontFamilyMonospace = "'Cascadia Code', 'SFMono-Regular', Consolas, monospace";

export const theme = createTheme({
  black: "#202124",
  primaryColor: "hiveSky",
  primaryShade: { light: 7, dark: 4 },
  defaultRadius: "md",
  radius: { xs: "0.25rem", sm: "0.4375rem", md: "0.75rem", lg: "1rem", xl: "2rem" },
  fontFamily,
  fontFamilyMonospace,
  headings: { fontFamily, fontWeight: "600" },
  fontSizes: { xs: "0.75rem", sm: "0.875rem", md: "1rem", lg: "1.125rem", xl: "1.25rem" },
  spacing: { xs: "0.5rem", sm: "0.75rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
  shadows: {
    xs: "0 1px 2px rgba(36, 55, 74, 0.04)",
    sm: "0 2px 6px rgba(36, 55, 74, 0.06)",
    md: "0 6px 18px rgba(36, 55, 74, 0.08)",
    lg: "0 10px 28px rgba(36, 55, 74, 0.10)",
    xl: "0 16px 40px rgba(36, 55, 74, 0.12)",
  },
  colors: {
    hiveSky: ["#F1F6FE", "#E8F0FE", "#D2E3FC", "#AECBFA", "#8AB4F8", "#669DF6", "#4285F4", "#1967D2", "#185ABC", "#174EA6"],
    gray: ["#F5F7FA", "#EDF1F5", "#DFE3E8", "#CBD2DA", "#A3ADB8", "#7C8794", "#626974", "#47505C", "#303843", "#202124"],
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
    NavLink: { styles: { root: { borderRadius: "0.5625rem", transition: "background-color 140ms ease, color 140ms ease" } } },
    Paper: { defaultProps: { radius: "md" } },
  },
});
