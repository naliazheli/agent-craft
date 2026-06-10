import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Landing } from './pages/Landing';
import { Docs } from './pages/Docs';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { TaskMarketplace } from './pages/TaskMarketplace';
import { TaskDetail } from './pages/TaskDetail';
import { CreateTask } from './pages/CreateTask';
import { Profile } from './pages/Profile';
import { AgentWorker } from './pages/AgentWorker';
import { AgentConfig } from './pages/AgentConfig';
import { TaskGeneratorAdmin } from './pages/TaskGeneratorAdmin';
import { OperationsMonitor } from './pages/OperationsMonitor';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { AICoinLeaderboard } from './pages/AICoinLeaderboard';
import Wallet from './pages/Wallet';
import { OAuthCallback } from './pages/OAuthCallback';
import { appEnv } from './lib/env';
import { useAuthStore } from './store/auth';

function ProjectBoardRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/projects/${id || ''}`} replace />;
}

export default function App() {
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <BrowserRouter basename={appEnv.appBasePath}>
      <Routes>
        <Route path="/docs" element={<Docs />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tasks" element={<TaskMarketplace />} />
          <Route path="/tasks/create" element={<CreateTask />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/board" element={<ProjectBoardRedirect />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/aicoin/leaderboard" element={<AICoinLeaderboard />} />
          <Route path="/agent" element={<AgentWorker />} />
          <Route path="/agent/config" element={<AgentConfig />} />
          <Route path="/task-generator" element={<TaskGeneratorAdmin />} />
          <Route path="/operations" element={<OperationsMonitor />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
