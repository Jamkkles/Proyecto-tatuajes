import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import ServerWakeNotice from './components/ServerWakeNotice'
import { ThemeProvider } from './lib/theme'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const AppShell = lazy(() => import('./components/AppShell'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Gallery = lazy(() => import('./pages/Gallery'))
const Preview3D = lazy(() => import('./pages/Preview3D'))
const Citas = lazy(() => import('./pages/Citas'))
const Clientes = lazy(() => import('./pages/Clientes'))
const Cliente = lazy(() => import('./pages/Cliente'))
const Proyecto = lazy(() => import('./pages/Proyecto'))
const Inventario = lazy(() => import('./pages/Inventario'))
const Cotizaciones = lazy(() => import('./pages/Cotizaciones'))

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ServerWakeNotice />
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/registro" element={<Register />} />
            <Route path="/recuperar" element={<ForgotPassword />} />
            <Route path="/nueva-contrasena" element={<ResetPassword />} />

            {/* App autenticada: shell compartido (sidebar + barra superior). */}
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/bocetos" element={<Gallery />} />
              <Route path="/previsualizacion" element={<Preview3D />} />
              <Route path="/citas" element={<Citas />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/clientes/:id" element={<Cliente />} />
              <Route path="/proyectos/:id" element={<Proyecto />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/cotizaciones" element={<Cotizaciones />} />
            </Route>
          </Routes>
        </Suspense>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
