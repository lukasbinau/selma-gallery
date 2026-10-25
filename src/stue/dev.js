// Dev harness for the room view alone: /dev-stue.html?id=markvej
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import { createStue } from './stue.js';
import data from '../vaerker.json';
import artMeta from '../art-meta.json';

const root = document.getElementById('stue');
const stue = await createStue({ root, works: data.vaerker, artMeta });
const id = new URLSearchParams(location.search).get('id') || data.vaerker[0].id;
stue.on('exit', () => console.log('exit'));
stue.on('work', (e) => console.log('work', e));
await stue.show({ id, from: 'front' });
console.log('shown');
