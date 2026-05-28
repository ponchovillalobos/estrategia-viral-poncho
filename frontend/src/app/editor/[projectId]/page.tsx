import { EditorWorkspace } from "@/components/editor/workspace";

export default async function EditorWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <EditorWorkspace projectId={decodeURIComponent(projectId)} />;
}
