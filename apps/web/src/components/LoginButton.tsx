import { Button, Modal, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

export function LoginButton() {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button className="login-button" color="hiveGreen" radius="xl" onClick={open}>
        Log in
      </Button>
      <Modal opened={opened} onClose={close} title="Log in to Hive" centered radius="lg">
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            Google sign-in will be connected here when authentication is ready.
          </Text>
          <Button color="hiveGreen" radius="xl" onClick={close}>
            Got it
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
