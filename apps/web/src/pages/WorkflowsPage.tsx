import { useCallback, useRef } from "react";
import { addEdge, Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type Node } from "@xyflow/react";
import { Badge, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import type { AppView } from "../App";
import "@xyflow/react/dist/style.css";

type AgentNode = Node<{ label: string; description: string }, "agent">;
const initialNodes: AgentNode[] = [{
  id: "agent-1",
  type: "agent",
  position: { x: 180, y: 140 },
  data: { label: "New agent", description: "Select this node and connect it to another agent." },
}];
const initialEdges: Edge[] = [];

export function WorkflowsPage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const nextId = useRef(2);
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge({ ...connection, animated: true }, current)), [setEdges]);
  const addAgentNode = () => {
    const id = `agent-${nextId.current++}`;
    setNodes((current) => [...current, {
      id,
      type: "agent",
      position: { x: 100 + Math.random() * 360, y: 80 + Math.random() * 280 },
      data: { label: `Agent ${nextId.current - 1}`, description: "Connect this agent to define workflow order." },
    }]);
  };

  return (
    <Stack className="workspace-page" gap="lg">
      <Group justify="space-between" align="end">
        <Stack gap={3}><Text className="page-eyebrow">Workspace</Text><Title order={1} className="page-title">Workflows</Title></Stack>
        <Group><Button variant="subtle" onClick={() => onNavigate("agents")}>Manage agents</Button><Button onClick={addAgentNode}>Add agent node</Button></Group>
      </Group>
      <Group gap="xs"><Badge variant="light" color="hiveSky">Editor preview</Badge><Text size="sm" c="dimmed">Drag nodes, connect their handles, and use the controls to explore the canvas.</Text></Group>
      <Paper className="workflow-canvas" withBorder>
        <ReactFlow<AgentNode, Edge>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={{ agent: AgentNodeView }}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: false }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </Paper>
      <Text size="xs" c="dimmed">This editor is a UI preview. Workflows are not saved yet; the API and versioned workflow storage are still to be implemented.</Text>
    </Stack>
  );
}

function AgentNodeView({ data, selected }: { data: AgentNode["data"]; selected: boolean }) {
  return (
    <Paper className="workflow-agent-node" data-selected={selected || undefined} withBorder shadow="sm">
      <Text size="xs" c="hiveSky.3" fw={700}>AGENT</Text>
      <Text fw={650} mt={4}>{data.label}</Text>
      <Text size="xs" c="dimmed" mt={4}>{data.description}</Text>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </Paper>
  );
}
