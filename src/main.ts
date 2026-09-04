import './styles.css';
import { Shell } from './app/shell';
import { installDebugApi } from './app/debug';
import { updates } from './app/updates';

const shell = new Shell(
  document.getElementById('table') as HTMLCanvasElement,
  document.getElementById('hud') as HTMLElement,
  document.getElementById('overlay') as HTMLElement,
);

installDebugApi(shell);
updates.start();
void shell.boot();
