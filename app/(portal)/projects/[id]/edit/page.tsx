"use client";
import { useParams } from "next/navigation";
import { ProjectFormPage } from "@/views/projects/ProjectsPage";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <ProjectFormPage projectId={id} />;
}
