import { MantineProvider } from "@mantine/core";
import { AppLayout } from "./components/AppLayout";
import { HomePage } from "./pages/HomePage";
import { theme } from "./theme";

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <AppLayout>
        <HomePage />
      </AppLayout>
    </MantineProvider>
  );
}
