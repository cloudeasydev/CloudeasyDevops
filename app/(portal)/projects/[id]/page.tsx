"use client";
import { useParams } from "next/navigation";
import { ProjectDetailsPage } from "@/views/projects/ProjectsPage";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <ProjectDetailsPage id={id} />;
}
