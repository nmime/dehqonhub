import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/montserrat/wght.css';
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { UiErrorBoundary } from '@app/frontend-ui-web';
import App from './app/app';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Missing required root element with id "root".');
}

const root = ReactDOM.createRoot(container);

root.render(
  <StrictMode>
    <UiErrorBoundary>
      <App />
    </UiErrorBoundary>
  </StrictMode>,
);
