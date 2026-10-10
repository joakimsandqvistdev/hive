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
      <Text c="dimmed" maw={760}>This page lists third-party software included in Hive. We’ll add each dependency or reused project here as it is introduced.</Text>
      <Paper className="license-card" withBorder>
        <Stack gap="sm">
          <div><Badge variant="light" color="hiveSky">MIT</Badge></div>
          <Title order={2} size="h4">Chatbot Flow Builder Starter Kit</Title>
          <Text size="sm" c="dimmed">By Denish Sharma. Listed as the upstream starter-kit reference for this editor; Hive currently uses the separately licensed @xyflow/react package for its canvas.</Text>
          <Text size="sm">Source: <Anchor href="https://github.com/denishsharma/chatbot-flow-builder-starter-kit" target="_blank" rel="noreferrer">denishsharma/chatbot-flow-builder-starter-kit</Anchor></Text>
          <LicenseNotice copyright="2025 Denish Sharma" />
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
