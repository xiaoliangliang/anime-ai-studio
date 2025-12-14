import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import WorkspacePage from './pages/WorkspacePage'
import { ProjectProvider } from './contexts/ProjectContext'

function App() {
  return (
    <ProjectProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/zh" element={<HomePage />} />
        <Route path="/project/:projectId" element={<WorkspacePage />} />
        <Route path="/zh/project/:projectId" element={<WorkspacePage />} />
      </Routes>
    </ProjectProvider>
  )
}

export default App
