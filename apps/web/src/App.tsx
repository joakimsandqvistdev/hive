import { MantineProvider } from "@mantine/core";
import { AppLayout } from "./components/AppLayout";
import { HomePage } from "./pages/HomePage";
import { theme } from "./theme";
import { AuthProvider } from "./auth";

export default function App() {
  return (
    <MantineProvider theme={theme} forceColorScheme="dark">
      <AuthProvider>
        <AppLayout>
          <HomePage />
        </AppLayout>
      </AuthProvider>
    </MantineProvider>
  );
}
