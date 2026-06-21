import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/recuperar" element={<ForgotPassword />} />
        <Route path="/nueva-contrasena" element={<ResetPassword />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
