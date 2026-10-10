import { ActionIcon, Alert, Avatar, Button, Divider, Group, Loader, Menu, Modal, Stack, Text, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { API_BASE, useAuth } from "../auth";

function UserGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function GoogleGlyph() {
  return <span aria-hidden="true" style={{ fontWeight: 800, color: "#4285f4", fontSize: 18 }}>G</span>;
}

export function AuthControl() {
  const { user, loading, googleConfigured, authError, clearAuthError, logout } = useAuth();
  const [opened, { open, close }] = useDisclosure(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (authError) open();
  }, [authError, open]);

  if (loading) return <Loader size="sm" color="hiveSky" aria-label="Loading account" />;

  if (user) {
    return (
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <UnstyledButton className="user-menu-trigger" aria-label={`User menu for ${user.name || user.email}`} title="Account menu">
            <Avatar src={user.avatarUrl} alt="" color="hiveSky" size={40}>
              <UserGlyph />
            </Avatar>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Stack gap={2} px="sm" py={6}>
            {user.name && <Text size="sm" fw={600}>{user.name}</Text>}
            <Text size="xs" c="dimmed">{user.email}</Text>
          </Stack>
          <Divider my={6} />
          <Menu.Item
            color="red"
            leftSection={<UserGlyph />}
            onClick={async () => {
              setLogoutError(null);
              try {
                await logout();
              } catch (error) {
                setLogoutError(error instanceof Error ? error.message : "Could not log out.");
              }
            }}
          >
            Log out
          </Menu.Item>
          {logoutError && <Text size="xs" c="red" px="sm" pb="xs">{logoutError}</Text>}
        </Menu.Dropdown>
      </Menu>
    );
  }

  return (
    <>
      <Button className="login-button" color="hiveSky" onClick={open}>
        Log in
      </Button>
      <Modal
        opened={opened}
        onClose={() => {
          close();
          clearAuthError();
        }}
        title="Log in to Hive"
        centered
      >
        <Stack gap="md">
          {authError && <Alert color="red" title="Sign-in issue">{authError}</Alert>}
          {googleConfigured ? (
            <>
              <Text c="dimmed" size="sm">Continue securely with your Google account.</Text>
              <Button
                color="hiveSky"

                leftSection={<GoogleGlyph />}
                onClick={() => window.location.assign(`${API_BASE}/api/auth/google`)}
              >
                Continue with Google
              </Button>
            </>
          ) : (
            <Text c="dimmed" size="sm">
              Google sign-in is not configured yet. Add your Google OAuth client ID and secret to the project’s .env file, then restart the API.
            </Text>
          )}
        </Stack>
      </Modal>
    </>
  );
}
