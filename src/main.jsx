import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import WelcomeWindow from './components/WelcomeWindow';
import { ThemeProvider } from './context/ThemeContext';
import './styles/index.css';

// Same Vite bundle serves two BrowserWindows. The main process opens the
// welcome window with `#welcome` so first-run users see the onboarding flow;
// the dock window loads without a hash and gets the regular <App />.
const isWelcome = typeof window !== 'undefined' && window.location.hash === '#welcome';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      {isWelcome ? <WelcomeWindow /> : <App />}
    </ThemeProvider>
  </React.StrictMode>
);
