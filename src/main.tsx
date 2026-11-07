import { render } from 'preact';
import { App } from './ui/App';
import { boot } from './store';
import './ui/styles.css';

boot().finally(() => render(<App />, document.getElementById('app')!));
