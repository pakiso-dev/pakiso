import { hydrateRoot } from 'react-dom/client';
import { DashboardApp } from './App.js';
import './style.css';
import type { PageData } from './types.js';

const dataScript = document.getElementById('__PAKISO_DASHBOARD_DATA__');
if (!dataScript?.textContent) {
  throw new Error('Pakiso Dashboard: embedded page data script not found');
}
const initialPage = JSON.parse(dataScript.textContent) as PageData;

const appRoot = document.getElementById('app');
if (!appRoot) {
  throw new Error('Pakiso Dashboard: #app root element not found');
}

hydrateRoot(appRoot, <DashboardApp initialPage={initialPage} />);
