import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonte bundles lokalt (ingen CDN). Latin-subset dækker æ, ø, å.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';
import { App, TV } from './App';
import { Indtastning } from './Indtastning';

if (TV) {
  document.documentElement.classList.add('tv');
  document.documentElement.dataset.theme = 'dark';
  document.title = 'Nøgletal – storskærm';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.pathname.replace(/\/$/, '') === '/indtast' ? <Indtastning /> : <App />}
  </StrictMode>,
);
