import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/sora/800.css';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Subscribe } from './pages/Subscribe';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Poster } from './pages/Poster';
import { RegisterStructure } from './pages/RegisterStructure';
import { RegisterTrainer } from './pages/RegisterTrainer';
import { ForgotPassword, JoinLanding, ParentalConsent, ResetPassword, StaffInvite, VerifyEmail } from './pages/TokenPages';
import './styles.css';

function Private({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function Guest({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/app" replace /> : <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/login" element={<Guest><Login /></Guest>} />
          <Route path="/affiliazione" element={<Guest><RegisterStructure /></Guest>} />
          <Route path="/pt/registrazione" element={<Guest><RegisterTrainer /></Guest>} />
          <Route path="/pt/:code" element={<JoinLanding kind="trainer" />} />
          <Route path="/j/:code" element={<JoinLanding kind="structure" />} />
          <Route path="/abbonati" element={<Subscribe />} />
          <Route path="/consenso-genitore" element={<ParentalConsent />} />
          <Route path="/invito-staff" element={<StaffInvite />} />
          <Route path="/verifica-email" element={<VerifyEmail />} />
          <Route path="/password-dimenticata" element={<ForgotPassword />} />
          <Route path="/nuova-password" element={<ResetPassword />} />
          <Route path="/app" element={<Private><Dashboard /></Private>} />
          <Route path="/locandina" element={<Private><Poster /></Private>} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
