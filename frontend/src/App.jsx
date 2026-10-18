import { Navigate, Route, Routes } from 'react-router-dom';
import { useDemo } from './demo/DemoContext';
import AppShell from './components/AppShell';
import Landing from './pages/Landing';
import CitizenHome from './pages/citizen/Home';
import Report from './pages/citizen/Report';
import ReportDone from './pages/citizen/ReportDone';
import MyComplaints from './pages/citizen/MyComplaints';
import ComplaintDetail from './pages/citizen/ComplaintDetail';
import CitizenMap from './pages/citizen/CitizenMap';
import PhoneReport from './pages/citizen/PhoneReport';
import Dashboard from './pages/gp/Dashboard';
import Complaints from './pages/gp/Complaints';
import WaterStatus from './pages/gp/WaterStatus';
import Incident from './pages/gp/Incident';
import Pipelines from './pages/gp/Pipelines';
import PipelineDetail from './pages/gp/PipelineDetail';
import GpMap from './pages/gp/GpMap';
import Task from './pages/gp/Task';
import Tasks from './pages/gp/Tasks';
import Overview from './pages/officer/Overview';
import RiskRules from './pages/officer/RiskRules';

function RequireRole({ role, children }) {
  const demo = useDemo();
  if (demo.role !== role) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Landing />} />

      <Route path="/citizen" element={<RequireRole role="citizen"><AppShell /></RequireRole>}>
        <Route index element={<CitizenHome />} />
        <Route path="report" element={<Report />} />
        <Route path="report/done" element={<ReportDone />} />
        <Route path="complaints" element={<MyComplaints />} />
        <Route path="complaints/:code" element={<ComplaintDetail />} />
        <Route path="map" element={<CitizenMap />} />
        <Route path="phone" element={<PhoneReport />} />
      </Route>

      <Route path="/gp" element={<RequireRole role="gp"><AppShell /></RequireRole>}>
        <Route index element={<Dashboard />} />
        <Route path="water" element={<WaterStatus />} />
        <Route path="complaints" element={<Complaints />} />
        <Route path="incidents/:code" element={<Incident />} />
        <Route path="pipelines" element={<Pipelines villageIds={['vil-ramapuram']} base="/gp" />} />
        <Route path="pipelines/:assetId" element={<PipelineDetail />} />
        <Route path="map" element={<GpMap />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/:code" element={<Task />} />
      </Route>

      <Route path="/officer" element={<RequireRole role="officer"><AppShell /></RequireRole>}>
        <Route index element={<Overview />} />
        <Route path="pipelines" element={<Pipelines villageIds={['vil-ramapuram', 'vil-kondapur', 'vil-sitarampalli']} base="/officer" />} />
        <Route path="pipelines/:assetId" element={<PipelineDetail />} />
        <Route path="risk-rules" element={<RiskRules />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
