import type { ReactNode } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type User } from "@/lib/api";
import { AppLayout } from "@/components/layout/AppLayout";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import { ProjectDetailsPage, ProjectFormPage, ProjectsPage } from "@/pages/projects/ProjectsPage";
import { SecretsPage } from "@/pages/security/SecretsPage";
import { NetworkPage } from "@/pages/network/NetworkPage";
import { ApiStudioPage } from "@/pages/tools/ApiStudioPage";
import { DevGeneratorsPage } from "@/pages/tools/DevGeneratorsPage";
import { InterviewPage } from "@/pages/interview/InterviewPage";
import { QuickAccessPage, TeamPage } from "@/pages/workspace/WorkspacePages";
import { SettingsPage } from "@/pages/workspace/SettingsPage";
import { PublicBlogPostPage } from "@/pages/PublicBlogPostPage";
import { BlogWorkspace } from "@/pages/blog/BlogWorkspace";
import { DrivePage } from "@/pages/drive/DrivePage";
import OverviewPage from "@/pages/OverviewPage";
import { Skeleton } from "@/components/ui/primitives";

function RequireAuth({ children }: { children: (user: User) => ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: User }>("/api/auth/me"),
    retry: false,
  });
  if (isLoading) return <div className="grid min-h-screen place-items-center"><Skeleton className="h-10 w-40" /></div>;
  if (isError || !data?.user) return <Navigate to="/login" replace />;
  return <>{children(data.user)}</>;
}

function ProjectEditRoute() {
  const { id } = useParams();
  return <ProjectFormPage projectId={id!} />;
}

function ProjectRoute() {
  const { id } = useParams();
  return <ProjectDetailsPage id={id!} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/posts/:slug" element={<PublicBlogPostPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            {(user) => <AppLayout user={user} />}
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<OverviewPage />} />
        <Route path="/overview" element={<Navigate to="/dashboard" replace />} />
        <Route path="/blog" element={<BlogWorkspace />} />
        <Route path="/private-notes" element={<Navigate to="/blog" replace />} />
        <Route path="/documentation" element={<Navigate to="/blog" replace />} />
        <Route path="/documentation/:id" element={<Navigate to="/blog" replace />} />
        <Route path="/projects/new" element={<ProjectFormPage />} />
        <Route path="/projects/:id/edit" element={<ProjectEditRoute />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectRoute />} />
        <Route path="/secrets" element={<SecretsPage />} />
        <Route path="/security/secrets" element={<Navigate to="/secrets" replace />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route path="/network/:rest" element={<Navigate to="/network" replace />} />
        <Route path="/api-studio" element={<ApiStudioPage />} />
        <Route path="/dev-generators" element={<DevGeneratorsPage />} />
        <Route path="/quick-access" element={<QuickAccessPage />} />
        <Route path="/drive" element={<DrivePage />} />
        <Route path="/interview" element={<Navigate to="/interview/iam" replace />} />
        <Route path="/interview/:topicId" element={<InterviewPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/team/:rest" element={<Navigate to="/team" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
